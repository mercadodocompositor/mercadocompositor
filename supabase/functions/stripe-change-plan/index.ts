import { createClient } from 'npm:@supabase/supabase-js@2'
import { ensurePlanPrice, PLAN_COLUMNS, stripeClient } from '../_shared/stripe.ts'

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'}})

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return json({},200)
  if(req.method!=='POST') return json({message:'Método não permitido.'},405)
  const stripeKey=Deno.env.get('STRIPE_SECRET_KEY'), url=Deno.env.get('SUPABASE_URL'), anon=Deno.env.get('SUPABASE_ANON_KEY'), service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!stripeKey||!url||!anon||!service) return json({message:'Stripe não configurado.'},500)
  const userClient=createClient(url,anon,{global:{headers:{Authorization:req.headers.get('authorization')||''}}})
  const {data:{user}}=await userClient.auth.getUser()
  if(!user) return json({message:'Sessão inválida.'},401)
  const admin=createClient(url,service)
  const stripe=stripeClient(stripeKey)

  try{
    const {planName}=await req.json().catch(()=>({}))
    const {data:plan,error:planError}=await admin.from('subscription_plans').select(PLAN_COLUMNS).eq('name',planName).maybeSingle()
    if(planError) throw planError
    if(!plan?.is_active) return json({message:'Plano indisponível.'},400)
    const {data:row,error:rowError}=await admin.from('subscriptions').select('stripe_subscription_id').eq('user_id',user.id).maybeSingle()
    if(rowError) throw rowError
    if(!row?.stripe_subscription_id) return json({message:'Você ainda não tem uma assinatura para trocar de plano.'},409)

    const sub=await stripe(`subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`)
    if(!['active','trialing'].includes(sub.status)) return json({message:sub.status==='past_due'||sub.status==='unpaid'
      ?'Regularize o pagamento em “Gerenciar cobrança” na aba Assinatura antes de trocar de plano.'
      :'Sua assinatura não está ativa. Assine um plano novamente.'},409)
    const item=sub.items?.data?.[0]
    if(!item) throw new Error('subscription_without_items')

    // O limite conta todas as músicas do compositor, como em checkUserPlanCapacity.
    if(plan.max_songs!==null){
      const {count,error:countError}=await admin.from('songs').select('*',{count:'exact',head:true}).eq('composer_id',user.id)
      if(countError) throw countError
      if((count||0)>plan.max_songs) return json({message:`O ${plan.name} permite até ${plan.max_songs} músicas e você tem ${count}. Remova músicas antes de trocar de plano.`},409)
    }

    const priceId=await ensurePlanPrice(admin,stripe,plan)
    if(item.price?.id===priceId) return json({message:'Este já é o seu plano atual.'},409)
    const isUpgrade=Math.round(Number(plan.monthly_price)*100)>(item.price?.unit_amount||0)
    // Upgrade cobra a diferença proporcional na hora e só vale se o pagamento passar;
    // downgrade vira crédito na próxima fatura. No teste grátis não há o que ratear.
    const params:Record<string,string>={
      'items[0][id]':item.id,'items[0][price]':priceId,
      proration_behavior:sub.status==='trialing'?'none':isUpgrade?'always_invoice':'create_prorations',
    }
    if(isUpgrade&&sub.status!=='trialing') params.payment_behavior='pending_if_incomplete'
    const updated=await stripe(`subscriptions/${encodeURIComponent(sub.id)}`,'POST',params)
    if(updated.pending_update) return json({message:'O pagamento da diferença não foi aprovado. Atualize seu cartão em “Gerenciar cobrança” na aba Assinatura e tente de novo.'},402)
    // O webhook (customer.subscription.updated) grava o novo plano no banco.
    return json({ok:true})
  }catch(error){
    console.error('[stripe-change-plan]',error)
    return json({message:'Não foi possível trocar de plano agora.'},502)
  }
})
