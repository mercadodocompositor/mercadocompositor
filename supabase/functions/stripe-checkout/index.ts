import { createClient } from 'npm:@supabase/supabase-js@2'
import { ensurePlanPrice, LIVE_STATUSES, PLAN_COLUMNS, stripeClient } from '../_shared/stripe.ts'

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'}})

// Prometido na landing e no cadastro; vale só para a primeira assinatura do usuário.
const TRIAL_DAYS=7

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return json({},200)
  if(req.method!=='POST') return json({message:'Método não permitido.'},405)
  const stripeKey=Deno.env.get('STRIPE_SECRET_KEY'), url=Deno.env.get('SUPABASE_URL'), anon=Deno.env.get('SUPABASE_ANON_KEY'), service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appUrl=(Deno.env.get('APP_URL')||'https://mercadodocompositor.com.br').replace(/\/$/,'')
  if(!stripeKey||!url||!anon||!service) return json({message:'Stripe não configurado.'},500)
  const auth=req.headers.get('authorization')||''
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}})
  const {data:{user}}=await userClient.auth.getUser()
  if(!user) return json({message:'Sessão inválida.'},401)
  const admin=createClient(url,service)
  const stripe=stripeClient(stripeKey)

  try{
    const {planName}=await req.json().catch(()=>({}))
    const {data:plan}=await admin.from('subscription_plans').select(PLAN_COLUMNS).eq('name',planName).maybeSingle()
    if(!plan?.is_active) return json({message:'Plano indisponível.'},400)
    const {data:sub,error:subError}=await admin.from('subscriptions').select('stripe_customer_id,trial_started_at').eq('user_id',user.id).maybeSingle()
    if(subError) throw subError
    if(!sub) return json({message:'Cadastro de assinatura não encontrado. Fale com o suporte.'},409)

    // O cliente Stripe é criado antes do checkout para que sessões e assinaturas
    // fiquem sempre ligadas a ele; sem isso não há como achar checkouts abertos.
    let customerId:string|null=sub.stripe_customer_id
    if(!customerId){
      const created=await stripe('customers','POST',{...(user.email?{email:user.email}:{}),'metadata[user_id]':user.id})
      // Só grava se ainda estiver vazio: duas requisições simultâneas não podem deixar dois clientes para o mesmo usuário.
      const {data:saved,error}=await admin.from('subscriptions').update({stripe_customer_id:created.id}).eq('user_id',user.id).is('stripe_customer_id',null).select('stripe_customer_id').maybeSingle()
      if(error) throw error
      if(saved) customerId=created.id
      else {
        await stripe(`customers/${created.id}`,'DELETE').catch(()=>{})
        const {data:current,error:currentError}=await admin.from('subscriptions').select('stripe_customer_id').eq('user_id',user.id).maybeSingle()
        if(currentError) throw currentError
        customerId=current?.stripe_customer_id||null
        if(!customerId) throw new Error('customer_not_saved')
      }
    }

    const customer=encodeURIComponent(customerId!)
    const {data:subscriptions}=await stripe(`subscriptions?customer=${customer}&status=all&limit=100`) as {data:{id:string,status:string}[]}
    if(subscriptions.some(item=>LIVE_STATUSES.includes(item.status))) return json({message:'Você já possui uma assinatura. Use “Gerenciar cobrança” na aba Assinatura.'},409)
    // Tentativas abandonadas (ex.: 3DS não concluído) ainda poderiam ser pagas depois e virar uma segunda assinatura.
    for(const item of subscriptions.filter(item=>item.status==='incomplete')) await stripe(`subscriptions/${item.id}`,'DELETE')
    // Um checkout aberto em outra aba geraria uma segunda assinatura paga; só o mais recente pode ser concluído.
    const {data:openSessions}=await stripe(`checkout/sessions?customer=${customer}&status=open&limit=100`) as {data:{id:string}[]}
    for(const session of openSessions) await stripe(`checkout/sessions/${session.id}/expire`,'POST')

    const priceId=await ensurePlanPrice(admin,stripe,plan)
    const params:Record<string,string>={
      mode:'subscription','line_items[0][quantity]':'1','line_items[0][price]':priceId,
      customer:customerId!,client_reference_id:user.id,'metadata[user_id]':user.id,'metadata[plan_name]':plan.name,
      'subscription_data[metadata][user_id]':user.id,'subscription_data[metadata][plan_name]':plan.name,
      success_url:`${appUrl}/dashboard/assinatura?stripe=success`,cancel_url:`${appUrl}/dashboard/assinatura?stripe=cancelled`,locale:'pt-BR'
    }
    if(subscriptions.length===0&&!sub.trial_started_at) params['subscription_data[trial_period_days]']=String(TRIAL_DAYS)
    const session=await stripe('checkout/sessions','POST',params)
    return json({url:session.url})
  }catch(error){
    console.error('[stripe-checkout]',error)
    return json({message:'Não foi possível iniciar o pagamento.'},502)
  }
})
