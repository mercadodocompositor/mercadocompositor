import type { 
  AdminComposer, ComposerProfile, DashboardMetricPoint, FeaturedComposer, 
  InterestRequest, PlatformSettings, ReleaseDocument, Song, SongStatus, 
  Subscription, SubscriptionStatus, SystemLog, ValueType,
  SubscriptionPlanItem, AdminRoleType, UserRoleItem,
  AccountDeletionRequest, DeletionRequestStatus, UserNotification, NotificationType, RequestHistoryItem
} from '../types';
import { supabase } from './supabase';
import { captureException } from './monitoring';
import {
  STORAGE_BUCKETS,
  extractStoragePath,
  groupStorageFilesForDeletion,
  buildQuarantinePath,
  type StorageBucket,
  type StorageFileRef,
} from './storage';
import { evaluatePlanCapacity, type PlanCapacityInfo } from './planCapacity';
import { DEFAULT_SONG_COVER_URL } from '../config/media';

const camelSong = (r: any): Song => ({
  id: r.id, composerId: r.composer_id, title: r.title || 'Sem título', genre: r.genre || 'Sertanejo',
  subgenre: r.subgenre || '', authors: r.authors || '', dateComposed: r.date_composed || '',
  dateRegistered: r.date_registered || '', lyrics: r.lyrics || '', originalAudioPath: r.original_audio_path || null,
  originalMediaId: r.original_media_id || null, previewAudioUrl: r.preview_audio_url || null,
  previewMediaId: r.preview_media_id || null,
  coverUrl: r.cover_url || DEFAULT_SONG_COVER_URL,
  registryCode: r.registry_code || '', notes: r.notes || '', status: r.status || 'draft',
  isAvailableForRelease: r.is_available_for_release ?? true, valueType: r.value_type || 'suggested',
  suggestedValue: r.suggested_value == null ? undefined : Number(r.suggested_value),
  playCount: Number(r.play_count || 0), interestedCount: Number(r.interested_count || 0), summary: r.summary || '',
  isFeatured: Boolean(r.is_featured)
});

export async function loadSongById(userId: string, songId: string): Promise<Song | null> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('id', songId)
    .eq('composer_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? signOriginalAudio(camelSong(data)) : null;
}

export type SongPageQuery = {
  page: number; pageSize: number; search?: string; genre?: string;
  status?: 'all' | 'pending_action' | SongStatus; sort?: 'recent' | 'plays' | 'interest' | 'title';
};
export type SongCatalogStats = { published: number; drafts: number; pending: number; rejected: number; plays: number; interests: number; genres: string[] };
export type ReleasePageQuery = {
  page: number; pageSize: number; search?: string; songId?: string;
  type?: 'exclusiva' | 'nao_exclusiva'; period?: '30d' | '180d' | 'ano_atual';
  sort?: 'recent' | 'oldest' | 'value_high' | 'value_low' | 'title';
};
export type ReleaseMetrics = {
  count: number; totalValue: number; averageTicket: number;
  exclusiveCount: number; nonExclusiveCount: number; uniqueBuyers: number;
  songs: { id: string; title: string }[];
};

export async function loadReleaseMetrics(params: Pick<ReleasePageQuery, 'search' | 'songId' | 'type' | 'period'> = {}): Promise<ReleaseMetrics> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('get_my_release_metrics', {
    p_search: params.search?.trim() || null,
    p_song_id: params.songId || null,
    p_type: params.type || null,
    p_period: params.period || null
  });
  if (error) throw error;
  const result = data as Record<string, any> | null;
  return {
    count: Number(result?.count || 0), totalValue: Number(result?.totalValue || 0),
    averageTicket: Number(result?.averageTicket || 0),
    exclusiveCount: Number(result?.exclusiveCount || 0), nonExclusiveCount: Number(result?.nonExclusiveCount || 0),
    uniqueBuyers: Number(result?.uniqueBuyers || 0),
    songs: Array.isArray(result?.songs) ? result.songs.map((song: any) => ({ id: String(song.id), title: String(song.title) })) : []
  };
}
export type SongDraftPayload = {
  title: string; genre: string; subgenre: string; authors: string; dateComposed: string;
  lyrics: string; registryCode: string; notes: string; status: SongStatus;
  isAvailableForRelease: boolean; valueType: ValueType; suggestedValue: number | '';
  coverUrl: string;
  previewAudioUrl?: string | null;
  previewMediaId?: string | null;
  previewFileName?: string | null;
  coverFileName?: string | null;
};

export async function loadSongDraft(userId: string, draftKey: string): Promise<SongDraftPayload | null> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.from('song_drafts').select('payload').eq('user_id', userId).eq('draft_key', draftKey).maybeSingle();
  if (error) throw error;
  return data?.payload as SongDraftPayload | null;
}

export async function saveSongDraft(userId: string, draftKey: string, payload: SongDraftPayload): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.from('song_drafts').upsert({ user_id: userId, draft_key: draftKey, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id,draft_key' });
  if (error) throw error;
}

export async function deleteSongDraft(userId: string, draftKey: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.from('song_drafts').delete().eq('user_id', userId).eq('draft_key', draftKey);
  if (error) throw error;
}

const signOriginalAudio = async (song: Song) => {
  if (!supabase || !song.originalAudioPath) return song;
  const {data}=await supabase.storage.from('song-originals').createSignedUrl(song.originalAudioPath,120);
  return {...song,audioUrl:data?.signedUrl};
};
const camelRelease = (r: any): ReleaseDocument => ({
  id: r.id, requestId: r.request_id, songId: r.song_id, songTitle: r.song_title || '', authors: r.authors || '',
  composerName: r.composer_name || '', composerCpf: r.composer_cpf || '', composerCityState: r.composer_city_state || '',
  buyerName: r.buyer_name || '', buyerDocument: r.buyer_document || '', buyerCityState: r.buyer_city_state || '',
  agreedValue: Number(r.agreed_value || 0), authorizedPurpose: r.authorized_purpose || '',
  releaseType: r.release_type || 'Autorização de Gravação e Exploração Fonográfica (Não-Exclusiva)',
  issueDate: r.issue_date || '', additionalConditions: r.additional_conditions || '', digitalSignature: r.digital_signature || '',
  expiresAt: r.expires_at || undefined,
  documentCode: r.document_code || '',
  documentPath: r.document_path || '', documentHash: r.document_hash || '', templateVersion: r.template_version || undefined,
  documentArchivedAt: r.document_archived_at, isDemonstrative: false,
  sentToBuyerAt: r.sent_to_buyer_at || undefined
});
const camelRequest = (r: any): InterestRequest => ({
  id:r.id,composerId:r.composer_id,composerName:r.composer_name||undefined,
  songId:r.song_id,songTitle:r.songs?.title||r.song_title||'',songCover:r.songs?.cover_url||r.song_cover,
  buyerName:r.buyer_name,buyerStageName:r.buyer_stage_name,cpfCnpj:r.cpf_cnpj,buyerEmail:r.buyer_email,
  buyerWhatsapp:r.buyer_whatsapp,buyerCityState:r.buyer_city_state,purpose:r.purpose,message:r.message,
  status:r.status,createdAt:r.created_at,agreedValue:r.agreed_value==null?undefined:Number(r.agreed_value),
  notes:r.notes,paymentReceivedAt:r.payment_received_at,archiveReason:r.archive_reason,
  archivedAt:r.archived_at,releaseId:r.release_id||undefined,updatedAt:r.updated_at,
  platformFeePercentage:r.platform_fee_percentage==null?undefined:Number(r.platform_fee_percentage),
  platformFeeAmount:r.platform_fee_amount==null?undefined:Number(r.platform_fee_amount),
  composerNetAmount:r.composer_net_amount==null?undefined:Number(r.composer_net_amount)
});

export async function createAdminReleaseDocumentUrl(documentPath:string):Promise<string>{
  if(!supabase)throw new Error('Supabase não configurado.');
  if(!documentPath)throw new Error('Este termo não possui PDF arquivado.');
  const {data,error}=await supabase.storage.from('release-documents').createSignedUrl(documentPath,120);
  if(error)throw error;
  if(!data?.signedUrl)throw new Error('Não foi possível gerar o acesso temporário ao documento.');
  return data.signedUrl;
}

export type RequestPageQuery = {
  page:number;pageSize:number;status?:string;songId?:string;search?:string;oldest?:boolean;
};
export type RequestPageResult = {
  requests:InterestRequest[];total:number;statusCounts:Record<string,number>;songCounts:Record<string,number>;
};
export async function loadRequestPage(params: RequestPageQuery): Promise<RequestPageResult> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('list_interest_requests', {
    p_page: params.page,
    p_page_size: params.pageSize,
    p_status: params.status || null,
    p_song_id: params.songId || null,
    p_query: params.search || '',
    p_oldest: params.oldest || false
  });
  if (!error && data) {
    return {
      requests: (data.items || []).map(camelRequest),
      total: Number(data.total || 0),
      statusCounts: data.statusCounts || {},
      songCounts: data.songCounts || {}
    };
  }

  // Fallback: executa paginação, filtros e contagem exata diretamente no banco
  const from = (Math.max(1, params.page) - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  let query = supabase.from('interest_requests')
    .select('*,songs(title,cover_url)', { count: 'exact' });

  if (params.status) query = query.eq('status', params.status);
  if (params.songId) query = query.eq('song_id', params.songId);
  if (params.search && params.search.trim()) {
    // Vírgula, parêntese e ponto são metacaracteres do filtro `or` do PostgREST:
    // interpolar o termo cru permitiria reescrever a expressão inteira.
    const term = params.search.trim().replace(/[^p{L}p{N}s-]/gu, ' ').replace(/s+/g, ' ').trim();
    if (term) query = query.or(`buyer_name.ilike.%${term}%,buyer_stage_name.ilike.%${term}%,buyer_email.ilike.%${term}%`);
  }
  query = query.order('created_at', { ascending: Boolean(params.oldest) }).range(from, to);

  const fallback = await query;
  if (fallback.error) {
    if (error) throw error;
    throw fallback.error;
  }

  return {
    requests: (fallback.data || []).map(camelRequest),
    total: Number(fallback.count || 0),
    statusCounts: {},
    songCounts: {}
  };
}
export async function loadRequestById(requestId:string):Promise<InterestRequest|null>{
  if(!supabase)throw new Error('Supabase não configurado.');
  const {data,error}=await supabase.from('interest_requests').select('*,songs(title,cover_url)')
    .eq('id',requestId).maybeSingle();
  if(error)throw error;
  return data?camelRequest(data):null;
}
const dbSong = (s: Partial<Song>) => {
  const payload: Record<string, any> = {
    updated_at: new Date().toISOString()
  };
  if (s.title !== undefined) payload.title = s.title;
  if (s.genre !== undefined) payload.genre = s.genre;
  if (s.subgenre !== undefined) payload.subgenre = s.subgenre;
  if (s.authors !== undefined) payload.authors = s.authors;
  if (s.dateComposed !== undefined) payload.date_composed = s.dateComposed;
  if (s.lyrics !== undefined) payload.lyrics = s.lyrics;
  if (s.coverUrl !== undefined) payload.cover_url = s.coverUrl;
  if (s.registryCode !== undefined) payload.registry_code = s.registryCode;
  if (s.notes !== undefined) payload.notes = s.notes;
  if (s.status !== undefined) payload.status = s.status;
  if (s.isAvailableForRelease !== undefined) payload.is_available_for_release = s.isAvailableForRelease;
  if (s.valueType !== undefined) payload.value_type = s.valueType;
  if (s.suggestedValue !== undefined) payload.suggested_value = s.suggestedValue;
  if (s.previewAudioUrl !== undefined) payload.preview_audio_url = s.previewAudioUrl;
  if (s.summary !== undefined) payload.summary = s.summary;
  if ('previewMediaId' in s) payload.preview_media_id = s.previewMediaId || null;
  if ('originalMediaId' in s) payload.original_media_id = s.originalMediaId || null;
  if ('originalAudioPath' in s) payload.original_audio_path = s.originalAudioPath || null;
  if (!('originalAudioPath' in s) && s.audioUrl && !/^https?:|^blob:/.test(s.audioUrl)) {
    payload.original_audio_path = s.audioUrl;
  }
  return payload;
};

export async function loadPrivateData(userId: string) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const [pub,priv,songs,requests,releases,subscription,role,prefs] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id',userId).maybeSingle(),
    supabase.from('private_profiles').select('*').eq('user_id',userId).maybeSingle(),
    supabase.from('songs').select('*').eq('composer_id',userId).order('created_at',{ascending:false}),
    supabase.from('interest_requests').select('*,songs(title,cover_url)').eq('composer_id',userId).order('created_at',{ascending:false}),
    supabase.from('releases').select('*').eq('composer_id',userId).order('created_at',{ascending:false}),
    supabase.from('subscriptions').select('*').eq('user_id',userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id',userId),
    supabase.from('user_preferences').select('preferences').eq('user_id',userId).maybeSingle()
  ]);
  const error = pub.error || priv.error || songs.error || requests.error || releases.error || subscription.error || role.error;
  if (error) throw error;
  if (!pub.data) {
    // Sem linha em profiles a conta existe no auth mas não foi provisionada:
    // o trigger on_auth_user_created falhou ou não está instalado. Antes isso
    // estourava um erro cru de PostgREST e deixava o painel inacessível.
    throw new Error('Sua conta ainda não foi provisionada (perfil não encontrado). Fale com o suporte informando o seu e-mail de cadastro.');
  }
  const p:any=pub.data, q:any=priv.data||{}, sub:any=subscription.data||{}, preferences:any=prefs?.data?.preferences||{};
  const profile:ComposerProfile={username:p.username,name:p.name,stageName:p.stage_name,email:q.email,whatsapp:q.whatsapp,cpf:q.cpf,
    city:p.city,state:p.state,bio:p.bio,experienceYears:p.experience_years,genres:p.genres||[],
    society:p.society || preferences.society || '',
    spotify:p.spotify || preferences.spotify || '',
    pixKey: q.pix_key || preferences.pixKey || '',
    pixKeyType: q.pix_key_type || preferences.pixKeyType || 'cpf',
    instagram:p.instagram,youtube:p.youtube,
    website:p.website,photo:p.photo_url,coverPhoto:p.cover_photo_url,viewsCount:Number(p.views_count),isVerified:Boolean(p.is_verified)};
  const mappedSongs = (songs.data||[]).map(camelSong);
  const songsWithAudio = mappedSongs.filter(s => s.originalAudioPath);
  if (songsWithAudio.length > 0) {
    await Promise.all(songsWithAudio.map(async (song) => {
      try {
        const { data } = await supabase.storage.from('song-originals').createSignedUrl(song.originalAudioPath!, 120);
        if (data?.signedUrl) song.audioUrl = data.signedUrl;
      } catch (err) {
        captureException(err, { operation: 'createSignedUrl', songId: song.id });
      }
    }));
  }
  return {profile,songs:mappedSongs,requests:(requests.data||[]).map(camelRequest),
    releases:(releases.data||[]).map(camelRelease),
    subscription:{status:sub.status||'pending',planName:sub.plan_name||'Plano Bronze',monthlyPrice:sub.monthly_price||'0,00',nextBillingDate:sub.next_billing_date||'',
      paymentMethod:sub.payment_method||'Pix',cardLast4:sub.card_last4,cardBrand:sub.card_brand,invoices:sub.invoices||[],
      autoRenew:Boolean(sub.auto_renew),recurringStatus:sub.mp_preapproval_status||undefined,
      trialStartedAt:sub.trial_started_at||undefined,trialEndsAt:sub.trial_ends_at||undefined} as Subscription,
    isAdmin:(role.data||[]).some((r:any)=>['admin','moderator','financial'].includes(r.role)),
    adminRole:((role.data||[]).some((r:any)=>r.role==='admin')?'master':(role.data||[]).some((r:any)=>r.role==='moderator')?'moderator':(role.data||[]).some((r:any)=>r.role==='financial')?'financial':'master') as 'master'|'moderator'|'financial'};
}

export async function loadUserSubscription(userId: string): Promise<Subscription | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('subscriptions').select('*').eq('user_id', userId).single();
  if (error || !data) return null;
  return {
    status: data.status,
    planName: data.plan_name,
    monthlyPrice: data.monthly_price,
    nextBillingDate: data.next_billing_date || '',
    paymentMethod: data.payment_method,
    cardLast4: data.card_last4,
    cardBrand: data.card_brand,
    invoices: data.invoices || [],
    autoRenew: Boolean(data.auto_renew),
    recurringStatus: data.mp_preapproval_status || undefined,
    trialStartedAt: data.trial_started_at || undefined,
    trialEndsAt: data.trial_ends_at || undefined
  } as Subscription;
}

export async function loadDashboardMetrics(days=30):Promise<DashboardMetricPoint[]> {
  if(!supabase) return [];
  const {data,error}=await supabase.rpc('get_my_dashboard_metrics',{p_days:days});
  if(error) {
    // Compatibilidade durante a implantação gradual do novo SQL.
    if(error.code==='PGRST202'||error.code==='42883') return [];
    throw error;
  }
  return (Array.isArray(data)?data:[]).map((point:any)=>({
    date:String(point.date),profileViews:Number(point.profileViews||0),songPlays:Number(point.songPlays||0),
    interestRequests:Number(point.interestRequests||0),releasesIssued:Number(point.releasesIssued||0),songsPublished:Number(point.songsPublished||0)
  }));
}

export async function loadReleasePage(userId:string,params:ReleasePageQuery):Promise<{releases:ReleaseDocument[];total:number}>{
  if(!supabase)throw new Error('Supabase não configurado.');
  void userId; // A RPC limita a consulta ao auth.uid() e à RLS.
  const { data, error } = await supabase.rpc('list_my_releases', {
    p_page: params.page,
    p_page_size: params.pageSize,
    p_search: params.search?.trim() || null,
    p_song_id: params.songId || null,
    p_type: params.type || null,
    p_period: params.period || null,
    p_sort: params.sort || 'recent'
  });
  if(error)throw error;
  return { releases: (data?.items || []).map(camelRelease), total: Number(data?.total || 0) };
}

export async function saveProfile(userId: string, p: ComposerProfile) {
  if (!supabase) return;
  const profilePayload: Record<string, any> = {
    username: p.username,
    name: p.name,
    stage_name: p.stageName,
    city: p.city,
    state: p.state,
    bio: p.bio,
    experience_years: p.experienceYears,
    genres: p.genres,
    instagram: p.instagram,
    youtube: p.youtube,
    website: p.website,
    photo_url: p.photo,
    cover_photo_url: p.coverPhoto,
    society: p.society || '',
    spotify: p.spotify || '',
    updated_at: new Date().toISOString()
  };

  const privPayload: Record<string, any> = {
    email: p.email,
    whatsapp: p.whatsapp,
    cpf: p.cpf,
    pix_key: p.pixKey || '',
    pix_key_type: p.pixKeyType || 'cpf'
  };

  const [resA, resB] = await Promise.all([
    supabase.from('profiles').update(profilePayload).eq('user_id', userId),
    supabase.from('private_profiles').update(privPayload).eq('user_id', userId)
  ]);

  if (resA.error) {
    // Deployments created before society/spotify were added may either not have
    // the columns yet or may still have the old column-level UPDATE grant.
    const canUseLegacyProfileFallback =
      resA.error.code === 'PGRST204' ||
      resA.error.code === '42703' ||
      resA.error.code === '42501' ||
      resA.error.message?.includes('society') ||
      resA.error.message?.includes('spotify') ||
      resA.error.message?.toLowerCase().includes('permission denied');
    if (canUseLegacyProfileFallback) {
      delete profilePayload.society;
      delete profilePayload.spotify;
      const retry = await supabase.from('profiles').update(profilePayload).eq('user_id', userId);
      if (retry.error) throw retry.error;
      const { data: currentPrefs } = await supabase.from('user_preferences').select('preferences').eq('user_id', userId).maybeSingle();
      const nextPrefs = { ...(currentPrefs?.preferences || {}), society: p.society || '', spotify: p.spotify || '' };
      const { error: preferencesError } = await supabase.from('user_preferences').upsert({ user_id: userId, preferences: nextPrefs, updated_at: new Date().toISOString() });
      if (preferencesError) throw preferencesError;
    } else {
      throw resA.error;
    }
  }

  if (resB.error) {
    if (resB.error.code === 'PGRST204' || resB.error.message?.includes('pix_key') || resB.error.code === '42703') {
      delete privPayload.pix_key;
      delete privPayload.pix_key_type;
      const retryPriv = await supabase.from('private_profiles').update(privPayload).eq('user_id', userId);
      if (retryPriv.error) throw retryPriv.error;
      const { data: currentPrefs } = await supabase.from('user_preferences').select('preferences').eq('user_id', userId).maybeSingle();
      const nextPrefs = { ...(currentPrefs?.preferences || {}), pixKey: p.pixKey || '', pixKeyType: p.pixKeyType || 'cpf' };
      const { error: preferencesError } = await supabase.from('user_preferences').upsert({ user_id: userId, preferences: nextPrefs, updated_at: new Date().toISOString() });
      if (preferencesError) throw preferencesError;
    } else {
      throw resB.error;
    }
  }
}

export const RESERVED_USERNAMES = [
  'admin', 'administrador', 'dashboard', 'login', 'cadastro', 'termos', 
  'privacidade', 'autenticacao', 'validar-documento', 'suporte', 'api', 
  'app', 'root', 'sistema', 'oficial', 'mercadodocompositor'
];

export async function checkUsernameAvailability(slug: string, currentUserId?: string): Promise<boolean> {
  if (!slug) return false;
  const normalized = slug.trim().toLowerCase();
  if (RESERVED_USERNAMES.includes(normalized)) return false;
  if (!supabase) return true;
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username')
    .eq('username', normalized)
    .maybeSingle();
  // Uma falha de leitura não prova disponibilidade: liberar aqui produziria
  // violação de unicidade no save (ou um username duplicado se o índice cair).
  if (error) throw error;
  if (!data) return true;
  return currentUserId ? data.user_id === currentUserId : false;
}
export async function insertSong(userId:string,s:Song){
  if(!supabase)return;
  const payload = {id:s.id,composer_id:userId,...dbSong(s),date_registered:s.dateRegistered};
  const {error}=await supabase.from('songs').insert(payload);
  if(error) {
    console.error('[insertSong failure]', { error, payload, userId });
    throw error;
  }
}
export async function saveSong(id:string,s:Partial<Song>){
  if(!supabase)return;
  const payload = dbSong(s);
  const {data,error}=await supabase.from('songs').update(payload).eq('id',id).select('id').maybeSingle();
  if(error) {
    console.error('[saveSong failure]', { error, id, payload });
    throw error;
  }
  if(!data)throw new Error('A música não foi encontrada ou você não tem permissão para alterá-la.');
}

export async function adminModerateSong(
  id: string,
  status: SongStatus,
  notes?: string
): Promise<void> {
  if (!supabase) return;

  // 1. Tenta RPC administrativa com privilégios security definer
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_moderate_song', {
    p_song_id: id,
    p_status: status,
    p_notes: notes || null
  });

  if (!rpcError) {
    return;
  }

  console.warn('[adminModerateSong] RPC falhou ou não existe:', rpcError);

  // Se a função não existe no Supabase (código PGRST202 ou 42883)
  const isRpcNotFound = rpcError.code === 'PGRST202' || rpcError.code === '42883' || rpcError.message?.includes('admin_moderate_song');

  if (!isRpcNotFound) {
    // Erro real vindo da RPC (ex: 42501 de permissão de usuário no Supabase)
    throw new Error(rpcError.message || 'Falha na moderação administrativa.');
  }

  // 2. Fallback: Atualização direta focada exclusivamente nas colunas de moderação
  const payload: Record<string, any> = {
    status,
    updated_at: new Date().toISOString()
  };
  if (notes !== undefined) {
    payload.notes = notes;
  }

  const { data, error } = await supabase
    .from('songs')
    .update(payload)
    .eq('id', id)
    .select('id, status')
    .maybeSingle();

  if (error) {
    console.error('[adminModerateSong fallback failure]', { error, id, payload });
    if (error.code === '42501' || error.message?.includes('violates row-level security')) {
      throw new Error('A aprovação exige a função administrativa no banco. Execute o script "supabase/admin_moderate_song.sql" no SQL Editor do Supabase.');
    }
    if (error.code === '23514' || error.message?.includes('mídia validada') || error.message?.includes('assinatura ativa')) {
      throw new Error('Reavaliação bloqueada por regras de validação. Execute a migração "supabase/admin_moderate_song.sql" no Supabase para aplicar a moderação segura.');
    }
    throw new Error(error.message || 'Erro ao atualizar a música no banco de dados.');
  }

  if (!data) {
    throw new Error('A alteração não pôde ser gravada. Execute a migração "supabase/admin_moderate_song.sql" no Supabase SQL Editor.');
  }
}
export async function removeSong(id:string){if(!supabase)return;const {data,error}=await supabase.from('songs').delete().eq('id',id).select('id').maybeSingle();if(error)throw error;if(!data)throw new Error('A música não foi encontrada ou você não tem permissão para excluí-la.');}
export type SaveRequestExtra = Partial<InterestRequest> & {
  clearAgreedValue?: boolean;
};

export async function saveRequest(id: string, status: string, extra: SaveRequestExtra = {}, expectedUpdatedAt?: string): Promise<InterestRequest | null> {
  if (!supabase) return null;
  if (!expectedUpdatedAt) throw new Error('Recarregue a solicitação antes de salvar alterações.');
  const hasAgreedValue = Boolean(extra && 'agreedValue' in extra);
  const isExplicitClear = Boolean(
    extra?.clearAgreedValue ||
    extra?.agreedValue === 0 ||
    extra?.agreedValue === null ||
    (hasAgreedValue && (extra?.agreedValue === undefined || Number.isNaN(extra?.agreedValue)))
  );
  let agreedVal: number | null = null;
  if (!isExplicitClear && hasAgreedValue && extra?.agreedValue != null && Number.isFinite(Number(extra.agreedValue))) {
    agreedVal = Math.min(Math.max(0, Number(extra.agreedValue)), 10000000);
  }
  const params = {
    p_request_id: id,
    p_status: status,
    p_agreed_value: isExplicitClear ? 0 : agreedVal,
    p_notes: extra?.notes ?? null,
    p_archive_reason: extra?.archiveReason ?? null,
    p_clear_agreed_value: isExplicitClear
  };
  const result = await supabase.rpc('update_interest_request', { ...params, p_expected_updated_at: expectedUpdatedAt });
  if (result.error) {
    if (result.error.code === 'PGRST202') throw new Error('A atualização exige a migração request_workflow_hardening.sql no Supabase.');
    throw result.error;
  }
  if (result.data && typeof result.data === 'object' && ('id' in (result.data as any) || 'status' in (result.data as any))) {
    return camelRequest(result.data);
  }
  return loadRequestById(id);
}

export async function clearRequestAgreedValue(id: string, currentStatus: string, expectedUpdatedAt?: string): Promise<InterestRequest | null> {
  return saveRequest(id, currentStatus, { clearAgreedValue: true }, expectedUpdatedAt);
}

export async function loadRequestHistory(requestId:string):Promise<RequestHistoryItem[]>{
  if(!supabase) return [];
  const {data,error}=await supabase.from('interest_request_history').select('*').eq('request_id',requestId).order('changed_at',{ascending:false});
  if(error)throw error;
  return (data||[]).map((row:any)=>({id:row.id,requestId:row.request_id,actorId:row.actor_id,
    previousStatus:row.previous_status,newStatus:row.new_status,
    previousAgreedValue:row.previous_agreed_value==null?undefined:Number(row.previous_agreed_value),
    newAgreedValue:row.new_agreed_value==null?undefined:Number(row.new_agreed_value),changedAt:row.changed_at}));
}
export async function createInterest(songId:string,data:any){
  if(!supabase)throw new Error('Supabase não configurado.');
  const {data:id,error}=await supabase.rpc('create_interest_request',{p_song_id:songId,p_data:data});
  if(error)throw error;
  return id as string;
}
const getVisitorId=()=>{
  const key='mc_visitor_id';
  try {
    let value=localStorage.getItem(key);
    if(!value){value=crypto.randomUUID();localStorage.setItem(key,value);}
    return value;
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2);
  }
};
export async function incrementPlay(songId:string){if(!supabase)return false;const {data,error}=await supabase.rpc('increment_song_play',{p_song_id:songId,p_visitor_id:getVisitorId()});if(error)throw error;return Boolean(data);}
export async function incrementProfileView(username:string){if(!supabase)return false;const {data,error}=await supabase.rpc('increment_profile_view',{p_username:username,p_visitor_id:getVisitorId()});if(error)throw error;return Boolean(data);}
export async function issueReleaseRequest(requestId:string,data:Pick<ReleaseDocument,'releaseType'|'additionalConditions'|'digitalSignature'> & { agreedValue?: number },closeSong=false,expectedUpdatedAt?:string):Promise<ReleaseDocument>{
  if(!supabase) throw new Error('Supabase não configurado.');
  if(!expectedUpdatedAt) throw new Error('Recarregue a solicitação antes de emitir a liberação.');
  const baseParams: Record<string, any> = {
    p_request_id:requestId,
    p_release_type:data.releaseType,
    p_additional_conditions:data.additionalConditions,
    p_digital_signature:data.digitalSignature,
    p_agreed_value:data.agreedValue ?? null,
    p_expected_updated_at:expectedUpdatedAt
  };
  const result=await supabase.rpc('issue_release',{...baseParams,p_close_song:closeSong});
  if(!result.error) return result.data as ReleaseDocument;
  if(result.error.code==='PGRST202') throw new Error('A emissão exige a migração request_workflow_hardening.sql no Supabase.');
  throw result.error;
}
export type PublicReleaseValidation={songTitle:string;authors:string;composerName:string;composerDocumentLast4:string;composerCityState:string;buyerName:string;buyerDocumentLast4:string;buyerCityState:string;authorizedPurpose:string;releaseType:string;issueDate:string;digitalSignature:string;documentCode:string};
export async function validateReleaseDocument(documentCode:string):Promise<PublicReleaseValidation|null>{
  if(!supabase)throw new Error('Supabase não configurado.');
  const clean = documentCode.trim().toUpperCase();
  if (!clean || clean.length > 50 || !/^[A-Z0-9_-]+$/.test(clean)) return null;
  const{data,error}=await supabase.rpc('validate_release_document',{p_document_code:clean});
  if(error)throw error;
  return data as PublicReleaseValidation|null;
}
/**
 * O fallback antigo fazia `update` direto em `releases` — bloqueado pela policy
 * "releases admin write" — dentro de um catch vazio, e devolvia um timestamp
 * local. A UI marcava "enviado ao comprador" sem nada ter sido gravado. Agora a
 * falha sobe.
 */
export async function markReleaseSent(releaseId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('mark_release_sent', { p_release_id: releaseId });
  if (error) {
    if (error.code === 'PGRST202') {
      throw new Error('O registro de envio exige a função mark_release_sent no Supabase. Execute a migração pendente.');
    }
    throw error;
  }
  if (!data) throw new Error('O servidor não confirmou o registro do envio.');
  return data as string;
}
export async function getPublicComposer(username:string){
  if(!supabase)return null;
  const clean = username.trim().toLowerCase();
  if (!clean || clean.length > 60 || !/^[a-z0-9-]+$/.test(clean)) return null;
  const {data,error}=await supabase.rpc('get_public_composer',{p_username:clean});
  if(error)throw error;
  return data as {profile:ComposerProfile;songs:Song[];subscriptionStatus:Subscription['status']}|null;
}
export async function getFeaturedComposers(limit = 6){if(!supabase)return[];const{data,error}=await supabase.rpc('get_featured_composers',{p_limit:limit});if(error)throw error;return(data||[]) as FeaturedComposer[];}

/**
 * Vitrine pública da home. Consultar `songs` direto devolvia [] para visitantes,
 * porque a tabela só tem policy de leitura para o dono e para o admin — a RPC
 * `get_featured_songs` (security definer) é a única leitura pública válida.
 */
export async function getFeaturedSongs(limit = 6): Promise<Song[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_featured_songs', { p_limit: limit });
  if (error) {
    captureException(error, { operation: 'getFeaturedSongs' });
    return [];
  }
  return Array.isArray(data) ? data.map(camelSong) : [];
}

export async function getPublicComposers(options?: { search?: string; genre?: string; limit?: number }): Promise<FeaturedComposer[]> {
  if (!supabase) return [];
  const limit = options?.limit ?? 50;
  const search = options?.search?.trim() || null;
  const genre = options?.genre?.trim() || null;

  try {
    const { data, error } = await supabase.rpc('get_public_composers', {
      p_limit: limit,
      p_search: search,
      p_genre: genre
    });
    if (!error && Array.isArray(data)) {
      return data as FeaturedComposer[];
    }
  } catch {
    // Fallback gracioso caso a RPC ainda não tenha sido executada no banco
  }

  const fallback = await getFeaturedComposers(Math.min(limit, 24)).catch(() => []);
  return fallback.filter(comp => {
    if (genre && !comp.genres?.some(g => g.toLowerCase() === genre.toLowerCase())) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchName = comp.name?.toLowerCase().includes(q);
      const matchBio = comp.bio?.toLowerCase().includes(q);
      const matchCity = comp.cityState?.toLowerCase().includes(q);
      return Boolean(matchName || matchBio || matchCity);
    }
    return true;
  });
}
export type MediaUploadStage = 'uploading' | 'validating' | 'complete';
export type UploadOptions = {
  onStage?: (stage: MediaUploadStage) => void;
  generatePreview?: boolean;
  signal?: AbortSignal;
  onQuarantinePath?: (path: string) => void;
  subfolder?: string;
  folder?: string;
};
export type ValidatedUpload = {
  value: string;
  mediaId: string;
  quarantinePath: string;
  detectedType?: string;
  size?: number;
  duration?: number | null;
};



async function uploadFileDetailed(
  bucket: string,
  userId: string,
  file: File,
  onStageOrOptions?: ((stage: MediaUploadStage) => void) | UploadOptions,
  generatePreview = true
): Promise<ValidatedUpload> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const options: UploadOptions = typeof onStageOrOptions === 'function'
    ? { onStage: onStageOrOptions, generatePreview }
    : (onStageOrOptions || { generatePreview });

  const { onStage, signal, onQuarantinePath } = options;
  if (signal?.aborted) throw new Error('Envio cancelado.');

  const subfolder = options.subfolder || options.folder || (file as any).subfolder || (file as any).releaseId || (file.name.includes('/') ? file.name.substring(0, file.name.lastIndexOf('/')) : undefined);
  const cleanFileName = file.name.includes('/') ? file.name.substring(file.name.lastIndexOf('/') + 1) : file.name;
  const path = buildQuarantinePath(userId, cleanFileName, subfolder);
  onQuarantinePath?.(path);

  onStage?.('uploading');
  const { error: uploadError } = await supabase.storage.from('media-quarantine').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });
  if (uploadError) throw uploadError;

  if (signal?.aborted) {
    await supabase.storage.from('media-quarantine').remove([path]).catch(() => undefined);
    throw new Error('Envio cancelado.');
  }

  onStage?.('validating');
  const { data, error } = await supabase.functions.invoke('validate-media-upload', {
    body: { path, targetBucket: bucket, generatePreview: options.generatePreview ?? generatePreview }
  });

  if (signal?.aborted && data?.mediaId) {
    await supabase.functions.invoke('validate-media-upload', {
      body: { action: 'cleanup', mediaIds: [data.mediaId] }
    }).catch(() => undefined);
  }

  if (error || signal?.aborted) {
    await supabase.storage.from('media-quarantine').remove([path]).catch(() => undefined);
    if (signal?.aborted) throw new Error('Envio cancelado.');
    let message = 'Não foi possível validar o arquivo.';
    let status: number | undefined;
    let code: string | undefined;
    try {
      const response = (error as { context?: Response }).context;
      if (response) {
        status = response.status;
        const details = await response.clone().json();
        code = typeof details?.error === 'string' ? details.error : undefined;
        if (typeof details?.message === 'string' && details.message.trim()) message = details.message;
      }
    } catch { /* Mantém a mensagem segura para o usuário. */ }
    console.error('[validate-media-upload]', { bucket, status, code, errorName: error?.name });
    if (status === 401) message = 'A sessão não foi aceita na validação de mídia (HTTP 401). Entre novamente e tente enviar o arquivo.';
    if (status === 403) message = 'A validação de mídia foi recusada pelo servidor (HTTP 403). Verifique a configuração e os logs da função validate-media-upload.';
    throw new Error(message);
  }

  if (!data?.value) {
    await supabase.storage.from('media-quarantine').remove([path]).catch(() => undefined);
    throw new Error('A validação do arquivo não retornou um caminho seguro.');
  }

  onStage?.('complete');
  return { ...(data as Omit<ValidatedUpload, 'quarantinePath'>), quarantinePath: path };
}

export async function uploadFile(bucket: string, userId: string, file: File, onStageOrOptions?: ((stage: MediaUploadStage) => void) | UploadOptions) {
  return (await uploadFileDetailed(bucket, userId, file, onStageOrOptions)).value;
}

export async function uploadCurrentUserFile(bucket: string, file: File, onStageOrOptions?: ((stage: MediaUploadStage) => void) | UploadOptions) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sessão expirada. Entre novamente.');
  return uploadFile(bucket, data.user.id, file, onStageOrOptions);
}

export async function uploadCurrentUserFileDetailed(bucket: string, file: File, onStageOrOptions?: ((stage: MediaUploadStage) => void) | UploadOptions, generatePreview = true) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sessão expirada. Entre novamente.');
  return uploadFileDetailed(bucket, data.user.id, file, onStageOrOptions, generatePreview);
}

export async function uploadOriginalWithPreview(file: File, onStageOrOptions?: ((stage: MediaUploadStage) => void) | UploadOptions, generatePreview = true) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sessão expirada. Entre novamente.');
  return uploadFileDetailed('song-originals', data.user.id, file, onStageOrOptions, generatePreview);
}

export async function cleanupUserQuarantine(): Promise<number> {
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase.functions.invoke('validate-media-upload', {
      body: { action: 'cleanup-expired' }
    });
    if (error) throw error;
    return Number(data?.removed || 0);
  } catch (err) {
    captureException(err, { operation: 'cleanupUserQuarantine' });
    return 0;
  }
}

export const storagePathFromValue = (bucket: string, value?: string | null) => {
  return extractStoragePath(bucket, value);
};

export async function removeCurrentUserStorageFiles(files: Array<{ bucket: string; value?: string | null; mediaId?: string | null }>) {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Sessão expirada. Entre novamente.');
  const mediaIds = Array.from(new Set(files.map(file => file.mediaId).filter((id): id is string => Boolean(id))));
  if (mediaIds.length > 0) {
    const { error } = await supabase.functions.invoke('validate-media-upload', {
      body: { action: 'cleanup', mediaIds }
    });
    if (error) throw error;
  }
  const grouped = groupStorageFilesForDeletion(files.filter(file => !file.mediaId), data.user.id);
  const removals = await Promise.allSettled(
    [...grouped].map(async ([bucket, paths]) => {
      const { error } = await supabase.storage.from(bucket).remove([...new Set(paths)]);
      if (error) throw error;
    })
  );
  const failedRemoval = removals.find(result => result.status === 'rejected');
  if (failedRemoval?.status === 'rejected') {
    throw failedRemoval.reason;
  }
}

export {
  STORAGE_BUCKETS,
  extractStoragePath,
  groupStorageFilesForDeletion,
  type StorageBucket,
  type StorageFileRef,
};
export async function loadAdminComposers():Promise<AdminComposer[]>{
  if(!supabase)return[];
  const {data,error}=await supabase.rpc('get_admin_composers');
  if(error)throw error;
  if(!Array.isArray(data))throw new Error('Resposta inválida ao carregar compositores.');
  return data.map((row:any)=>({
    id:row.id,
    username:row.username||'',
    name:row.name||'',
    stageName:row.stageName||'',
    email:row.email||'',
    whatsapp:row.whatsapp||'',
    cpf:row.cpf||'',
    cityState:row.cityState||'',
    subscriptionStatus:row.subscriptionStatus||'pending',
    planName:row.planName||'',
    monthlyValue:Number(row.monthlyValue||0),
    registeredAt:row.registeredAt||'',
    songCount:Number(row.songCount||0),
    totalPlays:Number(row.totalPlays||0),
    totalReleases:Number(row.totalReleases||0),
    revenueGenerated:Number(row.revenueGenerated||0),
    photo:row.photo||'',
    isVerified:Boolean(row.isVerified)
  } as AdminComposer));
}
export async function loadAdminSongs():Promise<Song[]>{
  if(!supabase)return[];
  const {data,error}=await supabase.from('songs').select('id,composer_id,title,genre,subgenre,authors,date_composed,date_registered,lyrics,cover_url,registry_code,notes,status,is_available_for_release,value_type,suggested_value,play_count,interested_count,summary,preview_audio_url,is_featured,created_at,updated_at').order('created_at',{ascending:false}).limit(500);
  if(error)throw error;
  return(data||[]).map(camelSong).map(song=>({...song,audioUrl:song.previewAudioUrl}));
}
export async function loadAdminRequests():Promise<InterestRequest[]>{
  if(!supabase)throw new Error('Supabase não configurado.');
  const rows:any[]=[]; const pageSize=500;
  for(let page=1;;page+=1){
    const {data,error}=await supabase.rpc('get_admin_global_requests',{p_page:page,p_page_size:pageSize});
    if(error)throw error;
    const batch=Array.isArray(data)?data:[];
    rows.push(...batch);
    const total=Number(batch[0]?.total_count||0);
    if(batch.length<pageSize||rows.length>=total)break;
  }
  return rows.map(camelRequest);
}
export async function loadAdminReleases():Promise<ReleaseDocument[]>{
  if(!supabase)throw new Error('Supabase não configurado.');
  const rows:any[]=[]; const pageSize=500;
  for(let page=1;;page+=1){
    const {data,error}=await supabase.rpc('get_admin_global_releases',{p_page:page,p_page_size:pageSize});
    if(error)throw error;
    const batch=Array.isArray(data)?data:[];
    rows.push(...batch);
    const total=Number(batch[0]?.total_count||0);
    if(batch.length<pageSize||rows.length>=total)break;
  }
  return rows.map(camelRelease);
}
export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!supabase || !password) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return false;
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password
  });
  return !error;
}
export async function loadMySongsPage(userId:string,params:SongPageQuery):Promise<{songs:Song[];total:number;stats:SongCatalogStats}>{
  if(!supabase)throw new Error('Supabase não configurado.');
  const page=Math.max(1,params.page);const pageSize=Math.max(1,Math.min(params.pageSize,48));
  let query=supabase.from('songs').select('*',{count:'exact'}).eq('composer_id',userId);
  const search=(params.search||'').trim().replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ');
  if(search)query=query.or(`title.ilike.%${search}%,authors.ilike.%${search}%,genre.ilike.%${search}%,subgenre.ilike.%${search}%,registry_code.ilike.%${search}%`);
  if(params.genre&&params.genre!=='all')query=query.eq('genre',params.genre);
  if(params.status==='pending_action'){
    const today=new Date().toISOString().split('T')[0];
    query=query.or(`status.in.(pending_approval,rejected),title.is.null,title.eq.,authors.is.null,authors.eq.,lyrics.is.null,lyrics.eq.,preview_audio_url.is.null,preview_audio_url.eq.,date_composed.gt.${today},and(value_type.eq.suggested,or(suggested_value.is.null,suggested_value.lte.0,suggested_value.gt.10000000))`);
  }else if(params.status&&params.status!=='all'){
    query=query.eq('status',params.status);
  }
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
export async function adminSetSubscription(userId:string,status:SubscriptionStatus){if(!supabase)throw new Error('Supabase não configurado.');const{data,error}=await supabase.from('subscriptions').update({status,updated_at:new Date().toISOString()}).eq('user_id',userId).select('user_id').maybeSingle();if(error)throw error;if(!data)throw new Error('Assinatura não encontrada ou sem permissão para atualização.');}
export async function adminSetVerified(userId:string,value:boolean){if(!supabase)return;const{error}=await supabase.rpc('admin_set_profile_verified',{p_user_id:userId,p_is_verified:value});if(error)throw error;}
export async function loadPlatformSettings(): Promise<PlatformSettings> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('get_platform_settings');
  if (error) throw error;
  if (!data) throw new Error('Configuração da plataforma não encontrada.');
  return {
    platformName: data.platformName,
    tagline: data.tagline,
    planMonthlyPrice: Number(data.planMonthlyPrice),
    planMaxSongs: Number(data.planMaxSongs),
    platformFeePercentage: Number(data.platformFeePercentage),
    supportWhatsapp: data.supportWhatsapp,
    supportEmail: data.supportEmail,
    pixKeyMasked: data.pixKeyMasked || '',
    pixKeyConfigured: Boolean(data.pixKeyConfigured),
    maintenanceMode: Boolean(data.maintenanceMode),
    systemAnnouncement: data.systemAnnouncement,
    requireApprovalForNewSongs: Boolean(data.requireApprovalForNewSongs),
    termsVersion: data.termsVersion,
    updatedAt: data.updatedAt
  };
}
/**
 * `newPixKey` só é enviado quando o administrador realmente digita uma nova
 * chave. Omitir o campo faz o servidor preservar a chave em vigor, de modo que
 * salvar outras configurações (ou restaurar os padrões) nunca a apaga.
 */
export async function savePlatformSettings(s: PlatformSettings, newPixKey?: string): Promise<PlatformSettings> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { updatedAt, pixKeyMasked, pixKeyConfigured, ...settings } = s;
  const payload: Record<string, unknown> = { ...settings };
  if (typeof newPixKey === 'string') payload.pixKey = newPixKey.trim();
  const { data, error } = await supabase.rpc('admin_update_platform_settings', {
    p_settings: payload,
    p_expected_updated_at: updatedAt || null
  });
  if (error) throw error;
  if (!data) throw new Error('A atualização não foi confirmada pelo servidor.');
  return {
    ...settings,
    planMonthlyPrice: Number(data.planMonthlyPrice),
    planMaxSongs: Number(data.planMaxSongs),
    platformFeePercentage: Number(data.platformFeePercentage),
    pixKeyMasked: data.pixKeyMasked || '',
    pixKeyConfigured: Boolean(data.pixKeyConfigured),
    maintenanceMode: Boolean(data.maintenanceMode),
    requireApprovalForNewSongs: Boolean(data.requireApprovalForNewSongs),
    updatedAt: data.updatedAt
  };
}
/**
 * Exibe a chave Pix master em texto claro. Exige administrador com sessão
 * reautenticada nos últimos 5 minutos e registra a consulta na auditoria.
 */
export async function adminRevealPixKey(): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('admin_reveal_pix_key');
  if (error) throw error;
  return (data?.pixKey as string) || '';
}
export async function loadSystemLogs():Promise<SystemLog[]>{if(!supabase)return[];const{data,error}=await supabase.from('system_logs').select('*').order('created_at',{ascending:false}).limit(500);if(error)throw error;return(data||[]).map((r:any)=>({id:r.id,timestamp:new Date(r.created_at).toLocaleString('pt-BR'),category:r.category,title:r.title,description:r.description,user:r.actor,ip:'',status:r.status}));}
export async function insertSystemLog(log:SystemLog){if(!supabase)throw new Error('Supabase não configurado.');const{error}=await supabase.rpc('write_system_audit_log',{p_id:log.id,p_category:log.category,p_title:log.title,p_description:log.description,p_status:log.status});if(error)throw error;}
export async function adminFeatureSong(id:string,value:boolean){if(!supabase)return;const{error}=await supabase.rpc('admin_set_song_featured',{p_song_id:id,p_is_featured:value});if(error)throw error;}
export async function loadPreferences<T>(defaults:T):Promise<T>{if(!supabase)return defaults;const{data,error}=await supabase.from('user_preferences').select('preferences').single();if(error)throw error;return{...defaults,...data.preferences};}
export async function savePreferences(preferences:unknown){if(!supabase)return;const{data:user}=await supabase.auth.getUser();if(!user.user)throw new Error('Sessão expirada.');const{error}=await supabase.from('user_preferences').upsert({user_id:user.user.id,preferences,updated_at:new Date().toISOString()});if(error)throw error;}

export async function exportPersonalData(): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('export_my_personal_data');
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('O servidor não retornou o arquivo de dados.');
  return data as Record<string, unknown>;
}

export interface SettingsSecurityMetadata {
  preferencesUpdatedAt: string | null;
  passwordChangedAt: string | null;
}

export async function loadSettingsSecurityMetadata(): Promise<SettingsSecurityMetadata> {
  if (!supabase) return { preferencesUpdatedAt: null, passwordChangedAt: null };
  const { data, error } = await supabase.rpc('get_my_security_metadata');
  if (error) throw error;
  return {
    preferencesUpdatedAt: data?.preferencesUpdatedAt ?? null,
    passwordChangedAt: data?.passwordChangedAt ?? null,
  };
}

export async function revokeOtherSessions(): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) throw error;
}

export interface MfaFactorSummary { id: string; friendlyName?: string; status: string }
export async function listMfaFactors(): Promise<MfaFactorSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.map(factor => ({ id: factor.id, friendlyName: factor.friendly_name, status: factor.status }));
}

export async function beginMfaEnrollment(): Promise<{ factorId: string; qrCode: string; secret: string }> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Mercado do Compositor' });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyMfaEnrollment(factorId: string, code: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}

// ==========================================
// 1. SUBSCRIPTION PLANS CRUD (subscription_plans)
// ==========================================

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanItem[] = [
  {
    id: 'Plano Bronze',
    name: 'Plano Bronze',
    monthlyPrice: 24.90,
    maxSongs: 100,
    isActive: true,
    sortOrder: 1,
    features: ['Até 100 músicas publicadas', 'Liberação direta com termo PDF', 'Estatísticas de reprodução'],
    description: 'Plano inicial ideal para compositores'
  },
  {
    id: 'Plano Prata',
    name: 'Plano Prata',
    monthlyPrice: 34.90,
    maxSongs: 200,
    isActive: true,
    sortOrder: 2,
    features: ['Até 200 músicas publicadas', 'Prioridade nas buscas', 'Liberação direta com termo PDF'],
    description: 'Catálogo ampliado para compositores ativos'
  },
  {
    id: 'Plano Ouro',
    name: 'Plano Ouro',
    monthlyPrice: 54.90,
    maxSongs: null,
    isActive: true,
    sortOrder: 3,
    features: ['Catálogo ilimitado de músicas', 'Selo de compositor verificado', 'Destaque editorial', 'Suporte prioritário'],
    description: 'Acesso total e ilimitado para profissionais da música'
  },
  {
    id: 'Plano Inicial',
    name: 'Plano Inicial',
    monthlyPrice: 1.00,
    maxSongs: 1,
    isActive: true,
    sortOrder: 0,
    features: ['Plano exclusivo para testes', 'Até 1 música publicada', 'Validação do fluxo de assinatura e cobrança'],
    description: 'Plano de R$ 1,00 destinado exclusivamente a testes'
  }
];

/**
 * Os planos padrão só valem como catálogo local quando não há Supabase configurado
 * (desenvolvimento/testes). Uma consulta que falha propaga o erro: devolver preços
 * de fábrica faria o administrador acreditar que está vendo o catálogo em vigor.
 * Catálogo vazio é um estado legítimo e é devolvido como tal.
 */
export async function loadSubscriptionPlans(): Promise<SubscriptionPlanItem[]> {
  if (!supabase) return DEFAULT_SUBSCRIPTION_PLANS;
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    if (!data) return [];
    return data.map((r: any) => ({
      id: r.id || r.name,
      name: r.name,
      monthlyPrice: Number(r.monthly_price),
      maxSongs: r.max_songs == null ? null : Number(r.max_songs),
      isActive: Boolean(r.is_active),
      sortOrder: Number(r.sort_order || 0),
      features: Array.isArray(r.features) ? r.features : [],
      description: r.description || ''
    }));
  } catch (err) {
    captureException(err, { operation: 'loadSubscriptionPlans' });
    throw err;
  }
}

/**
 * `subscription_plans.name` é a chave primária da tabela — não existe coluna `id`.
 * Por isso renomear um plano é um UPDATE da própria chave, identificado por
 * `originalName`; um upsert por `name` criaria uma segunda linha e deixaria a
 * antiga órfã. A FK `subscriptions.plan_name` é `on update cascade`, então as
 * assinaturas em vigor acompanham o novo nome.
 */
export async function saveSubscriptionPlan(plan: SubscriptionPlanItem, originalName?: string): Promise<void> {
  if (!supabase) return;
  const dbPayload: any = {
    name: plan.name,
    monthly_price: plan.monthlyPrice,
    max_songs: plan.maxSongs,
    is_active: plan.isActive,
    sort_order: plan.sortOrder,
    features: plan.features || [],
    description: plan.description || '',
    updated_at: new Date().toISOString()
  };

  if (originalName && originalName !== plan.name) {
    const { data, error } = await supabase
      .from('subscription_plans')
      .update(dbPayload)
      .eq('name', originalName)
      .select('name')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`O plano "${originalName}" não foi encontrado para renomeação.`);
    return;
  }

  const { data, error } = await supabase
    .from('subscription_plans')
    .upsert(dbPayload, { onConflict: 'name' })
    .select('name')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('O servidor não confirmou a gravação do plano.');
}

export async function deleteSubscriptionPlan(planId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('subscription_plans')
    .delete()
    .eq('name', planId)
    .select('name')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`O plano "${planId}" não foi encontrado para exclusão.`);
}

export async function checkUserPlanCapacity(userId?: string): Promise<PlanCapacityInfo> {
  if (!supabase) {
    return evaluatePlanCapacity(0, 100, 'Plano Demonstrativo');
  }

  try {
    let targetUserId = userId;
    if (!targetUserId) {
      const { data: authData } = await supabase.auth.getUser();
      targetUserId = authData?.user?.id;
    }

    if (!targetUserId) {
      return {
        canAddSong: false,
        currentSongCount: 0,
        maxSongs: 0,
        remainingSongs: 0,
        planName: 'Sem sessão',
        isUnlimited: false,
        message: 'Sessão expirada. Entre novamente para verificar a capacidade do plano.'
      };
    }

    // 1. Tenta RPC nativo atômico no Postgres
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('check_plan_capacity', {
        p_user_id: targetUserId
      });
      if (!rpcError && rpcData) {
        const d = rpcData as any;
        return evaluatePlanCapacity(d.currentSongCount ?? 0, d.maxSongs, d.planName || 'Plano Atual');
      }
    } catch { /* Fallback para consulta direta */ }

    // 2. Fallback resiliente: conta diretamente no banco
    const [subRes, songsCountRes] = await Promise.all([
      supabase.from('subscriptions').select('plan_name').eq('user_id', targetUserId).maybeSingle(),
      supabase.from('songs').select('*', { count: 'exact', head: true }).eq('composer_id', targetUserId)
    ]);

    if (subRes.error || songsCountRes.error || !subRes.data || songsCountRes.count === null) {
      throw subRes.error || songsCountRes.error || new Error('Não foi possível confirmar a assinatura ou a quantidade de músicas.');
    }

    const planName = subRes.data.plan_name;
    const currentCount = songsCountRes.count;

    // Busca o limite nas configurações ativas de planos
    let planLimit: number | null = 100;
    const planRow = await supabase.from('subscription_plans').select('max_songs').eq('name', planName).maybeSingle();
    if (planRow.error) throw planRow.error;
    if (planRow.data && 'max_songs' in planRow.data) {
      planLimit = planRow.data.max_songs;
    } else {
      const defaultPlan = DEFAULT_SUBSCRIPTION_PLANS.find(p => p.name === planName);
      planLimit = defaultPlan ? defaultPlan.maxSongs : 100;
    }

    return evaluatePlanCapacity(currentCount, planLimit, planName);
  } catch (err) {
    captureException(err, { operation: 'checkUserPlanCapacity', userId });
    return {
      canAddSong: false,
      currentSongCount: 0,
      maxSongs: 0,
      remainingSongs: 0,
      planName: 'Não verificado',
      isUnlimited: false,
      message: 'Não foi possível verificar o limite do seu plano. Confira sua conexão e tente novamente.'
    };
  }
}

export { evaluatePlanCapacity, type PlanCapacityInfo };

// ==========================================
// 2. TEAM ROLES & PERMISSIONS CRUD (user_roles)
// ==========================================

/**
 * Registra o aceite da versão de termos em vigor para o usuário autenticado.
 * O aceite feito no cadastro é gravado por trigger, a partir do metadado do
 * signUp, já que ali ainda não existe sessão.
 */
export async function recordTermsAcceptance(version: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('record_terms_acceptance', { p_version: version });
  if (error) throw error;
}

/**
 * O membro padrão existe apenas para o modo sem Supabase (desenvolvimento/testes).
 * Uma falha real de leitura propaga o erro: exibir um "Administrador Master"
 * inexistente esconderia tanto uma quebra de RLS quanto uma equipe vazia.
 */
export async function loadTeamRoles(): Promise<UserRoleItem[]> {
  const fallbackRoles: UserRoleItem[] = [
    {
      id: 'role-1',
      userId: 'admin-master',
      email: 'contato@mercadodocompositor.com.br',
      name: 'Administrador Master',
      role: 'admin',
      createdAt: new Date().toISOString()
    }
  ];
  if (!supabase) return fallbackRoles;
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, role, created_at');
    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Fetch user profiles to enrich email & name
    const userIds = data.map((r: any) => r.user_id);
    const [profilesRes, privRes] = await Promise.all([
      supabase.from('profiles').select('user_id, name, stage_name').in('user_id', userIds),
      supabase.from('private_profiles').select('user_id, email').in('user_id', userIds)
    ]);

    const profMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
    const privMap = new Map((privRes.data || []).map((q: any) => [q.user_id, q.email]));

    return data.map((r: any) => {
      const p = profMap.get(r.user_id);
      const email = privMap.get(r.user_id) || r.user_id;
      return {
        id: `${r.user_id}_${r.role}`,
        userId: r.user_id,
        email: email,
        name: p?.stage_name || p?.name || 'Membro da Equipe',
        role: r.role as AdminRoleType,
        createdAt: r.created_at || new Date().toISOString()
      };
    });
  } catch (err) {
    captureException(err, { operation: 'loadTeamRoles' });
    throw err;
  }
}

export async function adminAssignRole(email: string, role: AdminRoleType): Promise<{ success: boolean; message?: string }> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('admin_assign_user_role', { p_email: email, p_role: role });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.message || 'O servidor não confirmou a atribuição do papel.');
  return { success: true };
}

export async function adminRevokeRole(userId: string, role: AdminRoleType): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('admin_revoke_user_role', { p_user_id: userId, p_role: role });
  if (error) throw error;
}

// ==========================================
// 3. LGPD ACCOUNT DELETION REQUESTS CRUD
// ==========================================

export async function submitAccountDeletionRequest(req: {
  userId: string;
  userName: string;
  userEmail: string;
  reason?: string;
}): Promise<AccountDeletionRequest> {
  // Um direito LGPD não pode "falhar em silêncio": se a solicitação não for
  // persistida, o erro sobe para que o titular veja a falha em vez de receber
  // uma confirmação falsa de que pediu a exclusão.
  if (!supabase) throw new Error('Supabase não configurado.');

  // Evita duplicidade de solicitações pendentes para o mesmo usuário
  const { data: existing, error: existingError } = await supabase
    .from('account_deletion_requests')
    .select('*')
    .eq('user_id', req.userId)
    .in('status', ['pendente', 'em_analise'])
    .maybeSingle();

  if (existingError) {
    captureException(existingError, { operation: 'submitAccountDeletionRequest.lookup' });
    throw existingError;
  }

  if (existing) {
    return {
      id: existing.id,
      userId: existing.user_id,
      userName: existing.user_name,
      userEmail: existing.user_email,
      reason: existing.reason || undefined,
      status: existing.status,
      createdAt: existing.created_at,
      resolvedAt: existing.resolved_at || undefined,
      adminNotes: existing.admin_notes || undefined
    };
  }

  const { data, error } = await supabase
    .from('account_deletion_requests')
    .insert({
      user_id: req.userId,
      user_name: req.userName,
      user_email: req.userEmail,
      reason: req.reason || null,
      status: 'pendente'
    })
    .select('*')
    .single();

  if (error) {
    captureException(error, { operation: 'submitAccountDeletionRequest' });
    throw error;
  }
  if (!data) throw new Error('A solicitação de exclusão não foi confirmada pelo servidor.');

  return {
    id: data.id,
    userId: data.user_id,
    userName: data.user_name,
    userEmail: data.user_email,
    reason: data.reason || undefined,
    status: data.status,
    createdAt: data.created_at,
    resolvedAt: data.resolved_at || undefined,
    adminNotes: data.admin_notes || undefined
  };
}

export async function loadAccountDeletionRequests(): Promise<AccountDeletionRequest[]> {
  // Devolver [] em caso de erro faria a fila LGPD parecer vazia para o admin,
  // escondendo solicitações pendentes. Falha de leitura precisa ser visível.
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    captureException(error, { operation: 'loadAccountDeletionRequests' });
    throw error;
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    reason: r.reason || undefined,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at || undefined,
    adminNotes: r.admin_notes || undefined
  }));
}

export async function updateAccountDeletionRequestStatus(
  id: string,
  status: DeletionRequestStatus,
  adminNotes?: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('admin_update_deletion_request', {
    p_request_id: id,
    p_status: status,
    p_admin_notes: adminNotes || null
  });
  if (error) throw error;
}

/**
 * Conclui de fato a solicitação: elimina os dados pessoais sem base de retenção,
 * pseudonimiza o perfil, tira as obras do ar e invalida as credenciais. Exige
 * administrador com sessão reautenticada nos últimos 5 minutos.
 */
export async function adminFinalizeAccountDeletion(requestId: string, adminNotes?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { error } = await supabase.rpc('admin_finalize_account_deletion', {
    p_request_id: requestId,
    p_admin_notes: adminNotes || null
  });
  if (error) throw error;
}

// ==========================================
// 4. USER NOTIFICATIONS CRUD (user_notifications)
// ==========================================

/**
 * Caixa vazia é um estado legítimo. O fallback anterior inventava uma
 * notificação `notif-welcome` que não existia no banco: marcá-la como lida
 * atualizava um id inexistente e o badge "1 não lida" voltava a cada recarga.
 */
export async function loadUserNotifications(userId: string): Promise<UserNotification[]> {
  if (!supabase || !userId) return [];

  try {
    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!data) return [];

    return data.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      message: r.message,
      type: r.type as NotificationType,
      read: Boolean(r.is_read),
      link: r.link || undefined,
      createdAt: r.created_at
    }));
  } catch (err) {
    captureException(err, { operation: 'loadUserNotifications', userId });
    return [];
  }
}

/**
 * Nunca devolve objeto sintético: um "envio" que só existe na memória do
 * navegador é indistinguível de um envio real para quem chamou.
 */
export async function createUserNotification(data: Omit<UserNotification, 'id' | 'createdAt'>): Promise<UserNotification> {
  if (!supabase) throw new Error('Supabase não configurado.');

  const { data: row, error } = await supabase
    .from('user_notifications')
    .insert({
      user_id: data.userId,
      title: data.title,
      message: data.message,
      type: data.type,
      is_read: data.read,
      link: data.link || null
    })
    .select('*')
    .single();

  if (error) {
    captureException(error, { operation: 'createUserNotification' });
    throw error;
  }
  if (!row) throw new Error('O servidor não confirmou o registro da notificação.');

  return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type as NotificationType,
      read: Boolean(row.is_read),
    link: row.link || undefined,
    createdAt: row.created_at
  };
}

/** Confirma a gravação: sem `select`, uma recusa de RLS passava por sucesso. */
export async function markNotificationAsRead(id: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    captureException(error, { operation: 'markNotificationAsRead', id });
    throw error;
  }
  if (!data) throw new Error('A notificação não foi encontrada.');
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) {
    captureException(error, { operation: 'markAllNotificationsAsRead', userId });
    throw error;
  }
}
