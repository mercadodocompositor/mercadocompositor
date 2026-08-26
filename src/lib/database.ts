import type { AdminComposer, ComposerProfile, FeaturedComposer, InterestRequest, PlatformSettings, ReleaseDocument, Song, Subscription, SubscriptionStatus, SystemLog } from '../types';
import { supabase } from './supabase';

const camelSong = (r: any): Song => ({
  id:r.id,composerId:r.composer_id,title:r.title,genre:r.genre,subgenre:r.subgenre,authors:r.authors,dateComposed:r.date_composed,
  dateRegistered:r.date_registered,lyrics:r.lyrics,originalAudioPath:r.original_audio_path,previewAudioUrl:r.preview_audio_url,
  coverUrl:r.cover_url,registryCode:r.registry_code,notes:r.notes,status:r.status,
  isAvailableForRelease:r.is_available_for_release,valueType:r.value_type,
  suggestedValue:r.suggested_value == null ? undefined : Number(r.suggested_value),
  playCount:Number(r.play_count),interestedCount:Number(r.interested_count),summary:r.summary
});

export type SongPageQuery = {
  page: number; pageSize: number; search?: string; genre?: string;
  status?: string; sort?: 'recent' | 'plays' | 'interest' | 'title';
};
export type SongCatalogStats = { published: number; drafts: number; pending: number; rejected: number; plays: number; interests: number; genres: string[] };

const signOriginalAudio = async (song: Song) => {
  if (!supabase || !song.originalAudioPath) return song;
  const {data}=await supabase.storage.from('song-originals').createSignedUrl(song.originalAudioPath,120);
  return {...song,audioUrl:data?.signedUrl};
};
const dbSong = (s: Partial<Song>) => ({title:s.title,genre:s.genre,subgenre:s.subgenre,authors:s.authors,
  date_composed:s.dateComposed,lyrics:s.lyrics,cover_url:s.coverUrl,registry_code:s.registryCode,notes:s.notes,
  status:s.status,is_available_for_release:s.isAvailableForRelease,value_type:s.valueType,
  suggested_value:s.suggestedValue,preview_audio_url:s.previewAudioUrl,summary:s.summary,
  ...('originalAudioPath' in s ? { original_audio_path: s.originalAudioPath || null } : {}),
  ...(!('originalAudioPath' in s) && s.audioUrl && !/^https?:|^blob:/.test(s.audioUrl) ? {original_audio_path:s.audioUrl} : {}),updated_at:new Date().toISOString()});

export async function loadPrivateData(userId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const [pub,priv,songs,requests,releases,subscription,role] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id',userId).single(),
    supabase.from('private_profiles').select('*').eq('user_id',userId).single(),
    supabase.from('songs').select('*').eq('composer_id',userId).order('created_at',{ascending:false}).range(0,23),
    supabase.from('interest_requests').select('*,songs(title,cover_url)').eq('composer_id',userId).order('created_at',{ascending:false}),
    supabase.from('releases').select('*').eq('composer_id',userId).order('created_at',{ascending:false}),
    supabase.from('subscriptions').select('*').eq('user_id',userId).single(),
    supabase.from('user_roles').select('role').eq('user_id',userId)
  ]);
  const error = pub.error || priv.error || songs.error || requests.error || releases.error || subscription.error || role.error;
  if (error) throw error;
  const p:any=pub.data, q:any=priv.data, sub:any=subscription.data;
  const profile:ComposerProfile={username:p.username,name:p.name,stageName:p.stage_name,email:q.email,whatsapp:q.whatsapp,cpf:q.cpf,
    city:p.city,state:p.state,bio:p.bio,experienceYears:p.experience_years,genres:p.genres||[],instagram:p.instagram,youtube:p.youtube,
    website:p.website,photo:p.photo_url,coverPhoto:p.cover_photo_url,viewsCount:Number(p.views_count)};
  const mappedSongs = (songs.data||[]).map(camelSong);
  for (const song of mappedSongs) {
    const row=(songs.data||[]).find((item:any)=>item.id===song.id);
    if (row?.original_audio_path) {
      const {data}=await supabase.storage.from('song-originals').createSignedUrl(row.original_audio_path,120);
      song.audioUrl=data?.signedUrl;
    }
  }
  return {profile,songs:mappedSongs,requests:(requests.data||[]).map((r:any)=>({id:r.id,songId:r.song_id,songTitle:r.songs?.title||'',songCover:r.songs?.cover_url,
    buyerName:r.buyer_name,buyerStageName:r.buyer_stage_name,cpfCnpj:r.cpf_cnpj,buyerEmail:r.buyer_email,buyerWhatsapp:r.buyer_whatsapp,
    buyerCityState:r.buyer_city_state,purpose:r.purpose,message:r.message,status:r.status,createdAt:r.created_at.slice(0,10),
    agreedValue:r.agreed_value==null?undefined:Number(r.agreed_value),notes:r.notes,paymentReceivedAt:r.payment_received_at} as InterestRequest)),
    releases:(releases.data||[]).map((r:any)=>({id:r.id,requestId:r.request_id,songId:r.song_id,songTitle:r.song_title,authors:r.authors,
      composerName:r.composer_name,composerCpf:r.composer_cpf,composerCityState:r.composer_city_state,buyerName:r.buyer_name,
      buyerDocument:r.buyer_document,buyerCityState:r.buyer_city_state,agreedValue:Number(r.agreed_value),authorizedPurpose:r.authorized_purpose,
      releaseType:r.release_type,issueDate:r.issue_date,additionalConditions:r.additional_conditions,digitalSignature:r.digital_signature,
      documentCode:r.document_code,isDemonstrative:false} as ReleaseDocument)),
    subscription:{status:sub.status,planName:sub.plan_name,monthlyPrice:sub.monthly_price,nextBillingDate:sub.next_billing_date||'',
      paymentMethod:sub.payment_method,cardLast4:sub.card_last4,cardBrand:sub.card_brand,invoices:sub.invoices||[]} as Subscription,
    isAdmin:(role.data||[]).some((r:any)=>r.role==='admin')};
}

export async function saveProfile(userId:string,p:ComposerProfile){if(!supabase)return;const [{error:a},{error:b}]=await Promise.all([
  supabase.from('profiles').update({username:p.username,name:p.name,stage_name:p.stageName,city:p.city,state:p.state,bio:p.bio,experience_years:p.experienceYears,genres:p.genres,instagram:p.instagram,youtube:p.youtube,website:p.website,photo_url:p.photo,cover_photo_url:p.coverPhoto,updated_at:new Date().toISOString()}).eq('user_id',userId),
  supabase.from('private_profiles').update({email:p.email,whatsapp:p.whatsapp,cpf:p.cpf}).eq('user_id',userId)]);if(a||b)throw(a||b);}
export async function insertSong(userId:string,s:Song){if(!supabase)return;const {error}=await supabase.from('songs').insert({id:s.id,composer_id:userId,...dbSong(s),date_registered:s.dateRegistered,play_count:0,interested_count:0});if(error)throw error;}
export async function saveSong(id:string,s:Partial<Song>){if(!supabase)return;const {error}=await supabase.from('songs').update(dbSong(s)).eq('id',id);if(error)throw error;}
export async function removeSong(id:string){if(!supabase)return;const {error}=await supabase.from('songs').delete().eq('id',id);if(error)throw error;}
export async function saveRequest(id:string,status:string,extra:any){if(!supabase)return;const {error}=await supabase.from('interest_requests').update({status,agreed_value:extra?.agreedValue,notes:extra?.notes,payment_received_at:extra?.paymentReceivedAt}).eq('id',id);if(error)throw error;}
export async function createInterest(songId:string,data:any){if(!supabase)throw new Error('Supabase não configurado.');const {data:id,error}=await supabase.rpc('create_interest_request',{p_song_id:songId,p_data:data});if(error)throw error;return id as string;}
export async function incrementPlay(songId:string){if(!supabase)return;const {error}=await supabase.rpc('increment_song_play',{p_song_id:songId});if(error)throw error;}
export async function saveSubscription(s:Subscription){if(!supabase)return;const {error}=await supabase.rpc('update_my_subscription',{p_plan_name:s.planName,p_monthly_price:s.monthlyPrice,p_payment_method:s.paymentMethod,p_card_last4:s.cardLast4||null});if(error)throw error;}
export async function insertRelease(userId:string,r:ReleaseDocument){if(!supabase)return;const {error}=await supabase.from('releases').insert({id:r.id,request_id:r.requestId,composer_id:userId,song_id:r.songId,song_title:r.songTitle,authors:r.authors,composer_name:r.composerName,composer_cpf:r.composerCpf,composer_city_state:r.composerCityState,buyer_name:r.buyerName,buyer_document:r.buyerDocument,buyer_city_state:r.buyerCityState,agreed_value:r.agreedValue,authorized_purpose:r.authorizedPurpose,release_type:r.releaseType,issue_date:r.issueDate,additional_conditions:r.additionalConditions,digital_signature:r.digitalSignature,document_code:r.documentCode});if(error)throw error;}
export async function getPublicComposer(username:string){if(!supabase)return null;const {data,error}=await supabase.rpc('get_public_composer',{p_username:username});if(error)throw error;return data as {profile:ComposerProfile;songs:Song[];subscriptionStatus:Subscription['status']}|null;}
export async function getFeaturedComposers(){if(!supabase)return[];const{data,error}=await supabase.rpc('get_featured_composers',{p_limit:6});if(error)throw error;return(data||[]) as FeaturedComposer[];}
export async function uploadFile(bucket:string,userId:string,file:File){
  if(!supabase)throw new Error('Supabase não configurado.');
  const ext=file.name.split('.').pop()?.toLowerCase()||'bin';
  const path=`${userId}/${crypto.randomUUID()}.${ext}`;
  const {error:uploadError}=await supabase.storage.from('media-quarantine').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
  if(uploadError)throw uploadError;
  const {data,error}=await supabase.functions.invoke('validate-media-upload',{body:{path,targetBucket:bucket}});
  if(error){
    await supabase.storage.from('media-quarantine').remove([path]);
    let message='Não foi possível validar o arquivo.';
    try {
      const response=(error as {context?:Response}).context;
      if(response){const details=await response.clone().json();message=details?.message||message;}
    } catch { /* Mantém a mensagem segura para o usuário. */ }
    throw new Error(message);
  }
  if(!data?.value)throw new Error('A validação do arquivo não retornou um caminho seguro.');
  return data.value as string;
}
export async function uploadCurrentUserFile(bucket:string,file:File){if(!supabase)throw new Error('Supabase não configurado.');const {data}=await supabase.auth.getUser();if(!data.user)throw new Error('Sessão expirada. Entre novamente.');return uploadFile(bucket,data.user.id,file);}

const storagePathFromValue = (bucket: string, value?: string | null) => {
  if (!value) return null;
  if (!/^https?:/i.test(value)) return value.replace(/^\/+/, '');
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    const markers = [`/storage/v1/object/public/${bucket}/`, `/storage/v1/object/sign/${bucket}/`];
    const marker = markers.find(item => pathname.includes(item));
    return marker ? pathname.split(marker)[1] || null : null;
  } catch { return null; }
};

export async function removeCurrentUserStorageFiles(files: Array<{ bucket: string; value?: string | null }>) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sessão expirada. Entre novamente.');
  const grouped = new Map<string, string[]>();
  for (const file of files) {
    const path = storagePathFromValue(file.bucket, file.value);
    if (!path || path.split('/')[0] !== data.user.id) continue;
    grouped.set(file.bucket, [...(grouped.get(file.bucket) || []), path]);
  }
  for (const [bucket, paths] of grouped) {
    const { error } = await supabase.storage.from(bucket).remove([...new Set(paths)]);
    if (error) throw error;
  }
}
export async function loadAdminComposers():Promise<AdminComposer[]>{if(!supabase)return[];const [ps,qs,ss,songs,rels]=await Promise.all([supabase.from('profiles').select('*'),supabase.from('private_profiles').select('*'),supabase.from('subscriptions').select('*'),supabase.from('songs').select('composer_id,play_count'),supabase.from('releases').select('composer_id,agreed_value')]);const error=ps.error||qs.error||ss.error||songs.error||rels.error;if(error)throw error;return(ps.data||[]).map((p:any)=>{const q=(qs.data||[]).find((x:any)=>x.user_id===p.user_id)||{};const sub=(ss.data||[]).find((x:any)=>x.user_id===p.user_id)||{};const ownSongs=(songs.data||[]).filter((x:any)=>x.composer_id===p.user_id);const ownRels=(rels.data||[]).filter((x:any)=>x.composer_id===p.user_id);return{id:p.user_id,username:p.username,name:p.name,stageName:p.stage_name,email:q.email||'',whatsapp:q.whatsapp||'',cpf:q.cpf||'',cityState:[p.city,p.state].filter(Boolean).join(' - '),subscriptionStatus:sub.status||'pending',planName:sub.plan_name||'',monthlyValue:Number(String(sub.monthly_price||'0').replace(',','.')),registeredAt:p.created_at?.slice(0,10)||'',songCount:ownSongs.length,totalPlays:ownSongs.reduce((n:number,x:any)=>n+Number(x.play_count),0),totalReleases:ownRels.length,revenueGenerated:ownRels.reduce((n:number,x:any)=>n+Number(x.agreed_value),0),photo:p.photo_url,isVerified:p.is_verified} as AdminComposer;});}
export async function loadAdminSongs():Promise<Song[]>{
  if(!supabase)return[];
  const {data,error}=await supabase.from('songs').select('id,composer_id,title,genre,subgenre,authors,date_composed,date_registered,lyrics,cover_url,registry_code,notes,status,is_available_for_release,value_type,suggested_value,play_count,interested_count,summary,preview_audio_url,is_featured,created_at,updated_at').order('created_at',{ascending:false});
  if(error)throw error;
  return(data||[]).map(camelSong).map(song=>({...song,audioUrl:song.previewAudioUrl}));
}
export async function loadMySongsPage(userId:string,params:SongPageQuery):Promise<{songs:Song[];total:number;stats:SongCatalogStats}>{
  if(!supabase)throw new Error('Supabase não configurado.');
  const page=Math.max(1,params.page);const pageSize=Math.max(1,Math.min(params.pageSize,48));
  let query=supabase.from('songs').select('*',{count:'exact'}).eq('composer_id',userId);
  const search=(params.search||'').trim().replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ');
  if(search)query=query.or(`title.ilike.%${search}%,authors.ilike.%${search}%,genre.ilike.%${search}%,subgenre.ilike.%${search}%,registry_code.ilike.%${search}%`);
  if(params.genre&&params.genre!=='all')query=query.eq('genre',params.genre);
  if(params.status&&params.status!=='all')query=query.eq('status',params.status);
  if(params.sort==='plays')query=query.order('play_count',{ascending:false}).order('created_at',{ascending:false});
  else if(params.sort==='interest')query=query.order('interested_count',{ascending:false}).order('created_at',{ascending:false});
  else if(params.sort==='title')query=query.order('title',{ascending:true}).order('created_at',{ascending:false});
  else query=query.order('created_at',{ascending:false});
  const from=(page-1)*pageSize;
  const [{data,error,count},{data:statsData,error:statsError}]=await Promise.all([
    query.range(from,from+pageSize-1),supabase.rpc('get_my_song_stats')
  ]);
  if(error||statsError)throw(error||statsError);
  const songs=await Promise.all((data||[]).map(camelSong).map(signOriginalAudio));
  const raw=statsData||{};
  return{songs,total:count||0,stats:{published:Number(raw.published||0),drafts:Number(raw.drafts||0),pending:Number(raw.pending||0),rejected:Number(raw.rejected||0),plays:Number(raw.plays||0),interests:Number(raw.interests||0),genres:Array.isArray(raw.genres)?raw.genres:[]}};
}
export async function adminSetSubscription(userId:string,status:SubscriptionStatus){if(!supabase)return;const{error}=await supabase.from('subscriptions').update({status,updated_at:new Date().toISOString()}).eq('user_id',userId);if(error)throw error;}
export async function adminSetVerified(userId:string,value:boolean){if(!supabase)return;const{error}=await supabase.from('profiles').update({is_verified:value,updated_at:new Date().toISOString()}).eq('user_id',userId);if(error)throw error;}
export async function loadPlatformSettings():Promise<PlatformSettings>{if(!supabase)throw new Error('Supabase não configurado.');const{data,error}=await supabase.from('platform_settings').select('*').eq('id',true).single();if(error)throw error;return{platformName:data.platform_name,tagline:data.tagline,planMonthlyPrice:Number(data.plan_monthly_price),planMaxSongs:data.plan_max_songs,platformFeePercentage:Number(data.platform_fee_percentage),supportWhatsapp:data.support_whatsapp,supportEmail:data.support_email,pixKey:data.pix_key,maintenanceMode:data.maintenance_mode,systemAnnouncement:data.system_announcement,requireApprovalForNewSongs:data.require_approval_for_new_songs,termsVersion:data.terms_version};}
export async function savePlatformSettings(s:PlatformSettings){if(!supabase)return;const{error}=await supabase.from('platform_settings').update({platform_name:s.platformName,tagline:s.tagline,plan_monthly_price:s.planMonthlyPrice,plan_max_songs:s.planMaxSongs,platform_fee_percentage:s.platformFeePercentage,support_whatsapp:s.supportWhatsapp,support_email:s.supportEmail,pix_key:s.pixKey,maintenance_mode:s.maintenanceMode,system_announcement:s.systemAnnouncement,require_approval_for_new_songs:s.requireApprovalForNewSongs,terms_version:s.termsVersion,updated_at:new Date().toISOString()}).eq('id',true);if(error)throw error;}
export async function loadSystemLogs():Promise<SystemLog[]>{if(!supabase)return[];const{data,error}=await supabase.from('system_logs').select('*').order('created_at',{ascending:false}).limit(500);if(error)throw error;return(data||[]).map((r:any)=>({id:r.id,timestamp:new Date(r.created_at).toLocaleString('pt-BR'),category:r.category,title:r.title,description:r.description,user:r.actor,ip:'',status:r.status}));}
export async function insertSystemLog(log:SystemLog){if(!supabase)return;const{error}=await supabase.from('system_logs').insert({id:log.id,category:log.category,title:log.title,description:log.description,actor:log.user,status:log.status});if(error)throw error;}
export async function deleteSystemLogs(){if(!supabase)return;const{error}=await supabase.from('system_logs').delete().not('id','is',null);if(error)throw error;}
export async function adminFeatureSong(id:string,value:boolean){if(!supabase)return;const{error}=await supabase.from('songs').update({is_featured:value}).eq('id',id);if(error)throw error;}
export async function loadPreferences<T>(defaults:T):Promise<T>{if(!supabase)return defaults;const{data,error}=await supabase.from('user_preferences').select('preferences').single();if(error)throw error;return{...defaults,...data.preferences};}
export async function savePreferences(preferences:unknown){if(!supabase)return;const{data:user}=await supabase.auth.getUser();if(!user.user)throw new Error('Sessão expirada.');const{error}=await supabase.from('user_preferences').upsert({user_id:user.user.id,preferences,updated_at:new Date().toISOString()});if(error)throw error;}
