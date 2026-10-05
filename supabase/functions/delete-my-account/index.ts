import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { stripeClient, type StripeRequest } from '../_shared/stripe.ts'
import { renderBrandedEmail } from '../_shared/email-template.ts'

const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'}})
// Status do Stripe em que a assinatura não cobra mais nada.
const ENDED=['canceled','incomplete_expired']
// Buckets com arquivos do compositor. release-documents fica de fora: os termos emitidos são retidos.
const USER_BUCKETS=['profile-media','song-covers','song-previews','song-originals','media-quarantine']

async function sendFarewell(recipient:string){
  const resendKey=Deno.env.get('RESEND_API_KEY'),sender=Deno.env.get('NOTIFICATION_EMAIL_FROM')||Deno.env.get('AUTH_EMAIL_FROM')
  if(!resendKey||!sender)return
  // Enviado direto, sem passar pela fila: a fila guardaria o e-mail que acabou de ser eliminado.
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${resendKey}`,'content-type':'application/json'},
    body:JSON.stringify({from:sender,to:[recipient],subject:'Sua conta foi excluída',
      html:renderBrandedEmail({preheader:'Confirmação da exclusão da sua conta',eyebrow:'Privacidade e transparência',title:'Sua conta foi excluída',body:'Seu acesso foi encerrado, seus dados de cadastro foram removidos, suas obras saíram do catálogo e a assinatura foi cancelada.\n\nTermos de liberação já emitidos e registros financeiros são preservados. Esses documentos podem conter seu nome, CPF e outros dados necessários ao registro da liberação.',footer:'Esta é a última mensagem que você receberá do Mercado do Compositor.'})})})
  if(!response.ok)console.error('[delete-my-account] e-mail de despedida',response.status,(await response.text()).slice(0,300))
}

/** Caminhos de todos os arquivos dentro de uma pasta do bucket (as pastas não têm id). */
async function listFiles(admin:SupabaseClient,bucket:string,folder:string,depth=0):Promise<string[]>{
  const paths:string[]=[]
  for(let offset=0;;offset+=1000){
    const {data,error}=await admin.storage.from(bucket).list(folder,{limit:1000,offset})
    if(error)throw error
    for(const item of data||[]){
      const path=`${folder}/${item.name}`
      if(item.id)paths.push(path)
      else if(depth<3)paths.push(...await listFiles(admin,bucket,path,depth+1))
    }
    if(!data||data.length<1000)break
  }
  return paths
}

/**
 * O que a rotina do banco não alcança: arquivos no Storage, obras sem vínculo
 * com pedidos ou termos, o e-mail do titular na trilha de auditoria e o cliente
 * no Stripe. O áudio entregue a quem licenciou uma obra é mantido, como os termos.
 */
async function eraseLeftovers(admin:SupabaseClient,stripe:StripeRequest|null,userId:string,email:string|undefined,customerId:string|null){
  const [{data:deliveries,error:deliveriesError},{data:releases,error:releasesError},{data:requests,error:requestsError},{data:songs,error:songsError}]=await Promise.all([
    admin.from('release_deliveries').select('audio_path').eq('composer_id',userId),
    admin.from('releases').select('song_id').eq('composer_id',userId),
    admin.from('interest_requests').select('song_id').eq('composer_id',userId),
    admin.from('songs').select('id,original_audio_path').eq('composer_id',userId),
  ])
  if(deliveriesError||releasesError||requestsError||songsError)throw deliveriesError||releasesError||requestsError||songsError

  const releasedSongIds=new Set((releases||[]).map(row=>row.song_id as string))
  const songsWithHistory=new Set([...releasedSongIds,...(requests||[]).map(row=>row.song_id as string)])
  const keptAudio=new Set<string>()
  for(const row of deliveries||[])if(row.audio_path)keptAudio.add(row.audio_path as string)
  // Entregas antigas, sem áudio congelado, leem o arquivo atual da obra.
  for(const song of songs||[])if(song.original_audio_path&&releasedSongIds.has(song.id as string))keptAudio.add(song.original_audio_path as string)

  for(const bucket of USER_BUCKETS){
    const files=(await listFiles(admin,bucket,userId)).filter(path=>!(bucket==='song-originals'&&keptAudio.has(path)))
    for(let i=0;i<files.length;i+=100){
      const {error}=await admin.storage.from(bucket).remove(files.slice(i,i+100))
      if(error)throw error
    }
  }
  const {data:mediaRows,error:mediaError}=await admin.from('validated_media').select('id,bucket_id,object_path').eq('user_id',userId)
  if(mediaError)throw mediaError
  const staleMedia=(mediaRows||[]).filter(row=>!(row.bucket_id==='song-originals'&&keptAudio.has(row.object_path as string))&&row.bucket_id!=='release-documents').map(row=>row.id as string)
  if(staleMedia.length){
    const {error}=await admin.from('validated_media').delete().in('id',staleMedia)
    if(error)throw error
  }

  // Obras sem pedido nem termo não sustentam nenhum contrato: saem com a letra.
  const disposable=(songs||[]).map(song=>song.id as string).filter(id=>!songsWithHistory.has(id))
  if(disposable.length){
    const {error}=await admin.from('songs').delete().in('id',disposable)
    if(error)throw error
  }

  if(email){
    const {error}=await admin.from('system_logs').update({actor:'usuário removido'}).eq('actor',email)
    if(error)throw error
  }

  if(stripe&&customerId){
    await stripe(`customers/${encodeURIComponent(customerId)}`,'DELETE').catch((error:Error)=>{if(error.message.startsWith('Stripe 404'))return null;throw error})
    const {error}=await admin.from('subscriptions').update({stripe_customer_id:null}).eq('user_id',userId)
    if(error)throw error
  }
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
  const stripe=stripeKey?stripeClient(stripeKey):null

  // Com requestId, um administrador conclui a solicitação de exclusão de outra conta.
  const body=await req.json().catch(()=>({})) as {requestId?:unknown;adminNotes?:unknown}
  const requestId=typeof body.requestId==='string'&&/^[0-9a-f-]{36}$/i.test(body.requestId)?body.requestId:null
  let targetId=user.id,targetEmail=user.email
  if(requestId){
    const {data:callerRoles,error:callerError}=await admin.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin')
    if(callerError){console.error('[delete-my-account]',callerError);return json({message:'Não foi possível verificar sua permissão. Tente novamente.'},500)}
    if(!callerRoles?.length)return json({message:'Acesso restrito a administradores.'},403)
    const {data:request,error:requestError}=await admin.from('account_deletion_requests').select('user_id,status').eq('id',requestId).maybeSingle()
    if(requestError){console.error('[delete-my-account]',requestError);return json({message:'Não foi possível carregar a solicitação. Tente novamente.'},500)}
    if(!request)return json({message:'Solicitação não encontrada.'},404)
    if(request.status==='concluida'||request.status==='rejeitada')return json({message:'Esta solicitação já foi encerrada.'},409)
    targetId=request.user_id as string
    const {data:target,error:targetError}=await admin.auth.admin.getUserById(targetId)
    if(targetError){console.error('[delete-my-account]',targetError);return json({message:'Não foi possível carregar a conta. Tente novamente.'},500)}
    targetEmail=target.user?.email
  }

  // As mesmas travas de perform_account_deletion, conferidas antes de cancelar
  // a assinatura: não cancela a cobrança de quem não vai conseguir excluir.
  const [{data:roles,error:rolesError},{count:paid,error:paidError},{data:sub,error:subError}]=await Promise.all([
    admin.from('user_roles').select('role').eq('user_id',targetId).eq('role','admin'),
    admin.from('interest_requests').select('id',{count:'exact',head:true}).eq('composer_id',targetId).eq('status','pagamento_confirmado'),
    admin.from('subscriptions').select('stripe_customer_id,stripe_subscription_id,stripe_subscription_status').eq('user_id',targetId).maybeSingle(),
  ])
  if(rolesError||paidError||subError){console.error('[delete-my-account]',rolesError||paidError||subError);return json({message:'Não foi possível verificar a conta. Tente novamente.'},500)}
  if(roles?.length)return json({message:requestId?'Revogue o papel de administrador desta conta antes de concluir a exclusão.':'Contas de administrador não podem ser excluídas por aqui. Peça a outro administrador para revogar seu acesso antes.'},409)
  if(paid)return json({message:'Há pedidos com pagamento confirmado aguardando o termo de liberação. Emita os termos antes de excluir a conta.'},409)

  if(sub?.stripe_subscription_id&&!ENDED.includes(sub.stripe_subscription_status||'')){
    if(!stripe)return json({message:'Stripe não configurado.'},500)
    try{
      // Cancelamento imediato: a conta deixa de existir agora, então não há "até o fim do período".
      await stripe(`subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`,'DELETE').catch((error:Error)=>{if(error.message.startsWith('Stripe 404'))return null;throw error})
    }catch(error){console.error('[delete-my-account] cancelamento Stripe',error);return json({message:'Não foi possível cancelar a assinatura. Nada foi excluído; tente novamente.'},502)}
    const {error}=await admin.from('subscriptions').update({stripe_subscription_status:'canceled',status:'cancelled',stripe_cancel_at:null,updated_at:new Date().toISOString()}).eq('user_id',targetId)
    if(error){console.error('[delete-my-account] assinatura local',error);return json({message:'A assinatura foi cancelada, mas a exclusão não foi concluída. Tente novamente.'},500)}
  }

  // A eliminação roda com o JWT de quem pediu: o banco confere de novo a permissão
  // (e, para o administrador, a reautenticação recente).
  const {data,error}=requestId
    ?await client.rpc('admin_finalize_account_deletion',{p_request_id:requestId,p_admin_notes:typeof body.adminNotes==='string'&&body.adminNotes.trim()?body.adminNotes:null})
    :await client.rpc('delete_my_account')
  if(error){
    console.error('[delete-my-account] eliminação',error)
    const status=error.code==='42501'?(requestId?403:401):error.code==='23514'?409:500
    return json({message:status===500?'Não foi possível excluir a conta. Tente novamente.':error.message},status)
  }

  // A conta já foi eliminada: uma falha aqui não desfaz nada e fica no log para nova tentativa manual.
  let leftoversErased=true
  try{await eraseLeftovers(admin,stripe,targetId,targetEmail,sub?.stripe_customer_id||null)}
  catch(cleanupError){
    leftoversErased=false
    console.error('[delete-my-account] SOBRAS NÃO ELIMINADAS',{userId:targetId},cleanupError)
    const {error:logError}=await admin.from('system_logs').insert({
      category:'system',title:'Limpeza complementar de conta pendente',
      description:`A exclusão da conta ${targetId} foi concluída, mas a limpeza complementar de arquivos, registros ou cliente Stripe falhou. Verifique os logs da Edge Function e conclua a limpeza.`,
      actor:'sistema',status:'error'
    })
    if(logError)console.error('[delete-my-account] falha ao registrar limpeza pendente',logError)
    const {data:admins,error:adminsError}=await admin.from('user_roles').select('user_id').eq('role','admin')
    if(adminsError)console.error('[delete-my-account] falha ao buscar administradores',adminsError)
    else if(admins?.length){
      const {error:noticeError}=await admin.from('user_notifications').insert(admins.map(({user_id})=>({
        user_id,title:'Limpeza de conta pendente',
        message:`A conta ${targetId} foi excluída, mas a limpeza complementar falhou. Verifique os logs e os arquivos restantes.`,
        type:'system',link:'/admin/configuracoes'
      })))
      if(noticeError)console.error('[delete-my-account] falha ao avisar administradores',noticeError)
    }
  }

  if(targetEmail)await sendFarewell(targetEmail).catch(mailError=>console.error('[delete-my-account] e-mail de despedida',mailError))
  return json({ok:true,archivedRequests:data?.archived_requests??0,leftoversErased})
})
