import { createClient } from 'npm:@supabase/supabase-js@2'
import { LIVE_STATUSES, stripeClient } from '../_shared/stripe.ts'

const enc=new TextEncoder()
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('')
// Comparação em tempo constante: não para no primeiro caractere diferente.
const safeEqual=(a:string,b:string)=>{
  if(a.length!==b.length)return false
  let diff=0
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i)
  return diff===0
}
const toIso=(seconds?:number|null)=>seconds?new Date(seconds*1000).toISOString():undefined
// Data do calendário de Brasília (YYYY-MM-DD), como o Stripe mostra ao cliente.
// Em UTC, um período que acaba às 21h de 30/09 viraria 01/10.
const brazilDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'})
const toBrazilDate=(seconds:number)=>brazilDate.format(new Date(seconds*1000))
const idOf=(value:unknown)=>typeof value==='string'?value:(value as {id?:string}|null)?.id

// past_due continua ativo: o Stripe ainda está tentando cobrar e o catálogo não
// some na primeira recusa do cartão. A tela avisa pelo stripe_subscription_status.
// incomplete é uma primeira cobrança que nunca foi paga: ainda não há assinatura.
const localStatus=(stripeStatus:string)=>
  ['active','trialing','past_due'].includes(stripeStatus)?'active'
  :stripeStatus==='canceled'?'cancelled'
  :['incomplete','incomplete_expired'].includes(stripeStatus)?'pending'
  :'suspended'

// A partir da API 2025-03-31.basil a fatura não tem mais `subscription` na raiz.
const invoiceSubscriptionId=(invoice:any)=>idOf(invoice.subscription)
  ||idOf(invoice.parent?.subscription_details?.subscription)
  ||idOf(invoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription)

async function validSignature(payload:string,header:string,secret:string){
  const parts=header.split(',').map(p=>p.split('=',2))
  const timestamp=parts.find(([k])=>k==='t')?.[1]
  // Durante a rotação do segredo o Stripe envia mais de uma assinatura v1.
  const candidates=parts.filter(([k,v])=>k==='v1'&&v).map(([,v])=>v)
  if(!timestamp||candidates.length===0||Math.abs(Date.now()/1000-Number(timestamp))>300)return false
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const signature=hex(await crypto.subtle.sign('HMAC',key,enc.encode(`${timestamp}.${payload}`)))
  return candidates.some(candidate=>safeEqual(signature,candidate))
}

Deno.serve(async req=>{
  if(req.method!=='POST')return new Response('method_not_allowed',{status:405})
  const secret=Deno.env.get('STRIPE_WEBHOOK_SECRET'),stripeKey=Deno.env.get('STRIPE_SECRET_KEY'),url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!secret||!stripeKey||!url||!service)return new Response('missing_configuration',{status:500})
  const raw=await req.text(),signature=req.headers.get('stripe-signature')||''
  if(!await validSignature(raw,signature,secret))return new Response('invalid_signature',{status:400})
  const event=JSON.parse(raw),admin=createClient(url,service)
  const {error:claimError}=await admin.from('stripe_webhook_events').insert({event_id:event.id,event_type:event.type})
  if(claimError?.code==='23505')return new Response('already_processed',{status:200})
  if(claimError)return new Response('claim_failed',{status:500})
  try{
    const object=event.data.object
    const stripe=stripeClient(stripeKey)

    const findUserId=async(metadataUserId:string|undefined,customerId:string|undefined)=>{
      if(metadataUserId)return metadataUserId
      if(!customerId)return undefined
      const {data,error}=await admin.from('subscriptions').select('user_id').eq('stripe_customer_id',customerId).maybeSingle()
      if(error)throw error
      return data?.user_id as string|undefined
    }

    // O plano sai do Product do Stripe, que não muda com renomeação, reajuste
    // ou troca de plano. O metadado só serve para assinaturas antigas, criadas
    // com preço avulso, e só vale se o nome ainda existir: um plano renomeado
    // já foi atualizado em subscriptions por cascade e o nome antigo violaria a FK.
    const currentPlanName=async(productId:string|undefined,metadataName:string|undefined)=>{
      if(productId){
        const {data,error}=await admin.from('subscription_plans').select('name').eq('stripe_product_id',productId).maybeSingle()
        if(error)throw error
        if(data)return data.name as string
      }
      if(!metadataName)return undefined
      const {data,error}=await admin.from('subscription_plans').select('name').eq('name',metadataName).maybeSingle()
      if(error)throw error
      if(!data)console.warn('[stripe-webhook] plano da assinatura não encontrado; mantendo o plano gravado',{productId,metadataName})
      return data?.name as string|undefined
    }

    /** Sincroniza a assinatura com o Stripe. Devolve o user_id, ou null quando o evento não se aplica à assinatura vigente. */
    const applySubscription=async(subscriptionId:string):Promise<string|null>=>{
      const sub=await stripe(`subscriptions/${encodeURIComponent(subscriptionId)}`)
      const userId=await findUserId(sub.metadata?.user_id,idOf(sub.customer))
      if(!userId)throw new Error('subscription_without_user')
      const {data:row,error:rowError}=await admin.from('subscriptions').select('stripe_subscription_id').eq('user_id',userId).maybeSingle()
      if(rowError)throw rowError
      if(!row)throw new Error('subscription_row_missing')

      const current=row.stripe_subscription_id as string|null
      if(current&&current!==sub.id){
        // Evento atrasado de uma assinatura antiga não pode sobrescrever a vigente.
        if(!LIVE_STATUSES.includes(sub.status))return null
        // 404: assinatura de outro modo (teste x produção) ou inexistente; não bloqueia a nova.
        const previous=await stripe(`subscriptions/${encodeURIComponent(current)}`).catch((error:Error)=>{if(error.message.startsWith('Stripe 404'))return null;throw error})
        if(previous&&LIVE_STATUSES.includes(previous.status)){
          // Segunda assinatura viva para o mesmo usuário (ex.: checkouts em duas abas).
          // Cancela a nova para não cobrar em dobro; se já houve cobrança, o estorno é manual.
          await stripe(`subscriptions/${encodeURIComponent(sub.id)}`,'DELETE')
          console.error('[stripe-webhook] ASSINATURA DUPLICADA cancelada — verificar estorno',{userId,kept:current,cancelled:sub.id,status:sub.status,latestInvoice:idOf(sub.latest_invoice)})
          return null
        }
      }

      const item=sub.items?.data?.[0]
      const planName=await currentPlanName(idOf(item?.price?.product),sub.metadata?.plan_name)
      const periodEnd=sub.current_period_end||item?.current_period_end
      const unitAmount=item?.price?.unit_amount
      const {data:updated,error:updateError}=await admin.from('subscriptions').update({
        status:localStatus(sub.status),plan_name:planName,
        monthly_price:unitAmount?(unitAmount/100).toFixed(2).replace('.',','):undefined,
        next_billing_date:periodEnd?toBrazilDate(periodEnd):null,payment_method:'Cartão de Crédito',
        trial_started_at:toIso(sub.trial_start),trial_ends_at:toIso(sub.trial_end),
        // Cancelamento agendado pelo portal: a assinatura segue ativa até essa data.
        stripe_cancel_at:toIso(sub.cancel_at)??(sub.cancel_at_period_end&&periodEnd?toIso(periodEnd):undefined)??null,
        stripe_customer_id:idOf(sub.customer),stripe_subscription_id:sub.id,stripe_subscription_status:sub.status,updated_at:new Date().toISOString()
      }).eq('user_id',userId).select('user_id').maybeSingle()
      if(updateError)throw updateError
      if(!updated)throw new Error('subscription_row_missing')
      return userId
    }

    if(event.type==='checkout.session.completed'&&object.subscription)await applySubscription(idOf(object.subscription)!)
    else if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type))await applySubscription(object.id)
    else if(['invoice.paid','invoice.payment_failed'].includes(event.type)){
      const subscriptionId=invoiceSubscriptionId(object)
      const userId=subscriptionId?await applySubscription(subscriptionId):null
      // Fatura de R$ 0,00 do início do período de teste não entra no histórico.
      if(userId&&Number(object.amount_due||0)>0){
        const invoice={id:object.id,date:new Date((object.status_transitions?.paid_at||object.created)*1000).toISOString(),value:Number(object.amount_paid||object.amount_due||0)/100,status:event.type==='invoice.paid'?'pago':'falhou',
          number:object.number||undefined,hostedUrl:object.hosted_invoice_url||undefined,pdfUrl:object.invoice_pdf||undefined}
        // Um único UPDATE no banco: eventos simultâneos não sobrescrevem as faturas um do outro.
        const {data:saved,error:invoiceError}=await admin.rpc('upsert_subscription_invoice',{p_user_id:userId,p_invoice:invoice})
        if(invoiceError)throw invoiceError
        if(!saved)throw new Error('subscription_row_missing')
      }
    }
    return new Response('ok',{status:200})
  }catch(error){console.error('[stripe-webhook]',event.type,event.id,error);await admin.from('stripe_webhook_events').delete().eq('event_id',event.id);return new Response('processing_failed',{status:500})}
})
