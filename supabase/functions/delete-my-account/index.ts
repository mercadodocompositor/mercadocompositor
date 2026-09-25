import { createClient } from 'npm:@supabase/supabase-js@2'
import { stripeClient } from '../_shared/stripe.ts'

const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'}})
// Status do Stripe em que a assinatura não cobra mais nada.
const ENDED=['canceled','incomplete_expired']

async function sendFarewell(recipient:string){
  const resendKey=Deno.env.get('RESEND_API_KEY'),sender=Deno.env.get('NOTIFICATION_EMAIL_FROM')||Deno.env.get('AUTH_EMAIL_FROM')
  if(!resendKey||!sender)return
  // Enviado direto, sem passar pela fila: a fila guardaria o e-mail que acabou de ser eliminado.
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${resendKey}`,'content-type':'application/json'},
    body:JSON.stringify({from:sender,to:[recipient],subject:'Sua conta foi excluída',
      html:`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#060b18;font-family:Arial,sans-serif;color:#e2e8f0"><table width="100%" role="presentation" style="padding:32px 16px"><tr><td align="center"><table width="100%" role="presentation" style="max-width:560px;background:#0a1128;border:1px solid #263147;border-radius:20px"><tr><td style="padding:34px"><p style="color:#fbbf24;font-size:12px;font-weight:bold;letter-spacing:2px">MERCADO DO COMPOSITOR</p><h1 style="color:#fff;font-size:24px">Sua conta foi excluída</h1><p style="color:#cbd5e1;line-height:1.6">Concluímos a exclusão da sua conta. Seus dados pessoais foram eliminados, suas obras saíram do catálogo e a assinatura foi cancelada. Termos de liberação já emitidos e o histórico financeiro são mantidos sem identificação pessoal, por obrigação legal.</p><p style="margin-top:26px;color:#64748b;font-size:12px">Esta é a última mensagem que você receberá do Mercado do Compositor.</p></td></tr></table></td></tr></table></body></html>`})})
  if(!response.ok)console.error('[delete-my-account] e-mail de despedida',response.status,(await response.text()).slice(0,300))
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return json({})
  if(req.method!=='POST')return json({message:'Método não permitido.'},405)
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),stripeKey=Deno.env.get('STRIPE_SECRET_KEY')
  if(!url||!anon||!service)return json({message:'Serviço não configurado.'},500)
  const client=createClient(url,anon,{global:{headers:{Authorization:req.headers.get('authorization')||''}}})
  const {data:{user}}=await client.auth.getUser()
  if(!user)return json({message:'Sessão inválida.'},401)
  const admin=createClient(url,service)

  // As mesmas travas de perform_account_deletion, conferidas antes de cancelar
  // a assinatura: não cancela a cobrança de quem não vai conseguir excluir.
  const [{data:roles,error:rolesError},{count:paid,error:paidError},{data:sub,error:subError}]=await Promise.all([
    admin.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin'),
    admin.from('interest_requests').select('id',{count:'exact',head:true}).eq('composer_id',user.id).eq('status','pagamento_confirmado'),
    admin.from('subscriptions').select('stripe_subscription_id,stripe_subscription_status').eq('user_id',user.id).maybeSingle(),
  ])
  if(rolesError||paidError||subError){console.error('[delete-my-account]',rolesError||paidError||subError);return json({message:'Não foi possível verificar sua conta. Tente novamente.'},500)}
  if(roles?.length)return json({message:'Contas de administrador não podem ser excluídas por aqui. Peça a outro administrador para revogar seu acesso antes.'},409)
  if(paid)return json({message:'Há pedidos com pagamento confirmado aguardando o termo de liberação. Emita os termos antes de excluir a conta.'},409)

  if(sub?.stripe_subscription_id&&!ENDED.includes(sub.stripe_subscription_status||'')){
    if(!stripeKey)return json({message:'Stripe não configurado.'},500)
    try{
      // Cancelamento imediato: a conta deixa de existir agora, então não há "até o fim do período".
      await stripeClient(stripeKey)(`subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`,'DELETE').catch((error:Error)=>{if(error.message.startsWith('Stripe 404'))return null;throw error})
    }catch(error){console.error('[delete-my-account] cancelamento Stripe',error);return json({message:'Não foi possível cancelar sua assinatura. Nada foi excluído; tente novamente.'},502)}
    const {error}=await admin.from('subscriptions').update({stripe_subscription_status:'canceled',status:'cancelled',stripe_cancel_at:null,updated_at:new Date().toISOString()}).eq('user_id',user.id)
    if(error){console.error('[delete-my-account] assinatura local',error);return json({message:'Sua assinatura foi cancelada, mas a exclusão não foi concluída. Tente novamente.'},500)}
  }

  const email=user.email
  const {data,error}=await client.rpc('delete_my_account')
  if(error){
    console.error('[delete-my-account] delete_my_account',error)
    const status=error.code==='42501'?401:error.code==='23514'?409:500
    return json({message:status===500?'Não foi possível excluir sua conta. Tente novamente.':error.message},status)
  }
  if(email)await sendFarewell(email).catch(error=>console.error('[delete-my-account] e-mail de despedida',error))
  return json({ok:true,archivedRequests:data?.archived_requests??0})
})
