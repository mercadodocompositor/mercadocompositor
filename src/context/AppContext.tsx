import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Song,
  InterestRequest,
  ReleaseDocument,
  ComposerProfile,
  Subscription,
  SubscriptionStatus,
  RequestStatus,
  SongStatus,
  AdminComposer,
  PlatformSettings,
  SystemLog,
  DashboardMetricPoint,
  SubscriptionPlanItem,
  AdminRoleType,
  UserRoleItem,
  AccountDeletionRequest,
  DeletionRequestStatus,
  UserNotification,
  NotificationType
} from '../types';
import { DEFAULT_PLATFORM_SETTINGS } from '../data/platformDefaults';
import { formatMoneyBR, resolvePlan } from '../lib/plans';
import { APP_CONFIG, APP_URL } from '../config/appConfig';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { authErrorMessage, getFriendlyErrorMessage } from '../lib/apiErrors';
import {
  adminFeatureSong, adminSetSubscription, adminSetVerified, createInterest,
  incrementPlay, insertSong, insertSystemLog, issueReleaseRequest,
  loadAdminComposers, loadAdminSongs, loadAdminRequests, loadAdminReleases, verifyAdminPassword,
  loadDashboardMetrics, loadMySongsPage, loadPlatformSettings, loadPrivateData, loadRequestById, loadRequestPage,
  loadReleasePage, loadSystemLogs, removeCurrentUserStorageFiles, removeSong,
  savePlatformSettings, saveProfile, saveRequest, clearRequestAgreedValue as dbClearRequestAgreedValue, saveSong,
  adminModerateSong,
  STORAGE_BUCKETS,
  loadSubscriptionPlans, saveSubscriptionPlan, deleteSubscriptionPlan, DEFAULT_SUBSCRIPTION_PLANS,
  loadTeamRoles, adminAssignRole, adminRevokeRole,
  loadAccountDeletionRequests, updateAccountDeletionRequestStatus,
  adminFinalizeAccountDeletion,
  loadUserNotifications, createUserNotification, markNotificationAsRead, markAllNotificationsAsRead,
  loadUserSubscription,
  type ReleasePageQuery, type RequestPageQuery, type RequestPageResult, type SongCatalogStats, type SongPageQuery,
  type SaveRequestExtra
} from '../lib/database';
import { parseRequestUpdateError, RequestUpdateError } from '../lib/requestWorkflow';

type RegistrationResult = { success: boolean; needsEmailConfirmation: boolean };

const EMPTY_PROFILE: ComposerProfile = {
  username: '', name: '', stageName: '', email: '', whatsapp: '', cpf: '', city: '', state: '',
  bio: '', experienceYears: '', genres: [], instagram: '', youtube: '', website: '', photo: '',
  coverPhoto: '', viewsCount: 0
};

const EMPTY_SUBSCRIPTION: Subscription = {
  status: 'pending', planName: APP_CONFIG.plans[0].name,
  monthlyPrice: APP_CONFIG.plans[0].priceMonthly, nextBillingDate: '',
  paymentMethod: 'Pix', invoices: [], isPlaceholder: true
};

/**
 * Resultado de um salvamento das configurações da plataforma. `conflict` indica
 * que outra sessão alterou a linha: o estado local já foi recarregado.
 */
export interface SettingsSaveResult {
  ok: boolean;
  error?: string;
  conflict?: boolean;
}

/** 40001 = serialization_failure, usado pelo RPC para sinalizar edição concorrente. */
const isSettingsConflict = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  if (code === '40001') return true;
  const message = error instanceof Error ? error.message : '';
  return /alterad[ao]s? em outra sess/i.test(message);
};

interface AppContextType {
  currentUserId: string | null;
  profile: ComposerProfile;
  updateProfile: (data: Partial<ComposerProfile>) => Promise<void>;

  songs: Song[];
  addSong: (song: Omit<Song, 'id' | 'playCount' | 'interestedCount' | 'dateRegistered'>) => Promise<Song>;
  /** Lança Error com a mensagem amigável quando o banco recusa a alteração. */
  updateSong: (id: string, data: Partial<Song>) => Promise<boolean>;
  deleteSong: (id: string) => Promise<boolean>;
  queryMySongs: (params: SongPageQuery) => Promise<{ songs: Song[]; total: number; stats: SongCatalogStats }>;
  incrementPlayCount: (songId: string) => void;

  requests: InterestRequest[];
  addInterestRequest: (req: Omit<InterestRequest, 'id' | 'createdAt' | 'status'>) => Promise<InterestRequest>;
  updateRequestStatus: (requestId: string, status: RequestStatus, extra?: SaveRequestExtra) => Promise<InterestRequest | null>;
  clearRequestAgreedValue: (requestId: string, status?: RequestStatus) => Promise<InterestRequest | null>;
  queryRequests: (params: RequestPageQuery) => Promise<RequestPageResult>;
  getRequestById: (requestId: string) => Promise<InterestRequest | null>;

  releases: ReleaseDocument[];
  queryReleases: (params: ReleasePageQuery) => Promise<{ releases: ReleaseDocument[]; total: number }>;
  issueRelease: (requestId: string, releaseData: Omit<ReleaseDocument, 'id' | 'documentCode' | 'isDemonstrative'>, closeSong?: boolean, expectedUpdatedAt?: string) => Promise<ReleaseDocument>;
  retryReleaseArchive: (document: ReleaseDocument) => Promise<ReleaseDocument>;
  markReleaseSent: (releaseId: string) => Promise<string>;

  subscription: Subscription;
  dashboardMetrics: DashboardMetricPoint[];
  /** Recarrega do banco e devolve a assinatura lida (null se falhar). */
  refreshSubscription: () => Promise<Subscription | null>;

  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  login: (email?: string, password?: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  register: (email: string, password: string, profile: Partial<ComposerProfile>, selectedPlanName?: string) => Promise<RegistrationResult>;
  resetPassword: (email: string) => Promise<boolean>;
  resendConfirmation: (email: string) => Promise<boolean>;
  updatePassword: (password: string, currentPassword?: string) => Promise<boolean>;
  logout: () => Promise<void>;

  // ADMIN PANEL STATES & ACTIONS
  isAdminAuthenticated: boolean;
  /** Papel efetivo, derivado de user_roles. Propositalmente sem setter: um
   *  seletor de papel na interface deixava moderador/auditor destravar as abas
   *  restritas ao master. */
  adminRole: 'master' | 'moderator' | 'financial';
  adminLogin: (email?: string, password?: string) => Promise<boolean>;
  adminLogout: () => Promise<void>;
  verifyAdminPassword: (password: string) => Promise<boolean>;

  adminComposers: AdminComposer[];
  adminSongs: Song[];
  adminRequests: InterestRequest[];
  adminReleases: ReleaseDocument[];
  refreshAdminTransactions: () => Promise<boolean>;
  moderateSong: (songId: string, status: Extract<SongStatus, 'published' | 'rejected' | 'draft'>, notes?: string) => Promise<{ ok: boolean; error?: string }>;
  updateAdminComposerStatus: (composerId: string, status: SubscriptionStatus) => Promise<boolean>;
  toggleComposerVerified: (composerId: string) => Promise<boolean>;
  suspendAdminComposer: (composerId: string) => Promise<boolean>;

  platformSettings: PlatformSettings;
  updatePlatformSettings: (settings: Partial<PlatformSettings>, newPixKey?: string) => Promise<SettingsSaveResult>;
  resetPlatformSettings: () => Promise<SettingsSaveResult>;

  systemLogs: SystemLog[];
  addSystemLog: (log: Omit<SystemLog, 'id' | 'timestamp'>) => Promise<boolean>;

  featuredSongIds: string[];
  toggleFeatureSong: (songId: string) => Promise<boolean>;

  // DYNAMIC SUBSCRIPTION PLANS
  subscriptionPlans: SubscriptionPlanItem[];
  savePlan: (plan: SubscriptionPlanItem, originalName?: string) => Promise<boolean>;
  deletePlan: (planId: string) => Promise<boolean>;

  // TEAM & ROLES
  teamMembers: UserRoleItem[];
  assignTeamRole: (email: string, role: AdminRoleType) => Promise<{ success: boolean; message?: string }>;
  revokeTeamRole: (userId: string, role: AdminRoleType) => Promise<boolean>;

  // LGPD ACCOUNT DELETION REQUESTS
  deletionRequests: AccountDeletionRequest[];
  deletionRequestsError: string | null;
  updateDeletionRequestStatus: (id: string, status: DeletionRequestStatus, adminNotes?: string) => Promise<boolean>;
  finalizeAccountDeletion: (id: string, adminNotes?: string) => Promise<boolean>;

  // USER NOTIFICATIONS
  notifications: UserNotification[];
  unreadNotificationCount: number;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  sendNotification: (notification: Omit<UserNotification, 'id' | 'createdAt'>) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const clearAuthError = useCallback(() => setAuthError(null), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ComposerProfile>(() => {
    return EMPTY_PROFILE;
  });

  const [songs, setSongs] = useState<Song[]>(() => {
    return [];
  });

  const [requests, setRequests] = useState<InterestRequest[]>(() => {
    return [];
  });

  const [releases, setReleases] = useState<ReleaseDocument[]>(() => {
    return [];
  });

  const [subscription, setSubscription] = useState<Subscription>(() => {
    return EMPTY_SUBSCRIPTION;
  });
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetricPoint[]>([]);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return false;
  });

  // Admin States
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => false);
  const [adminRole, setAdminRole] = useState<'master' | 'moderator' | 'financial'>('master');
  const [adminComposers, setAdminComposers] = useState<AdminComposer[]>(() => []);
  const [adminSongs, setAdminSongs] = useState<Song[]>([]);
  const [adminRequests, setAdminRequests] = useState<InterestRequest[]>([]);
  const [adminReleases, setAdminReleases] = useState<ReleaseDocument[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(() => DEFAULT_PLATFORM_SETTINGS);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>(() => []);
  const [featuredSongIds, setFeaturedSongIds] = useState<string[]>(() => []);
  // Começa vazio: o catálogo real chega na carga. Preencher com os padrões faria
  // a aba de planos exibir preços de fábrica antes (ou no lugar) dos verdadeiros.
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlanItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserRoleItem[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<AccountDeletionRequest[]>([]);
  // Distingue "fila vazia" de "não foi possível ler a fila": sem isso, uma falha
  // de leitura faria solicitações LGPD pendentes sumirem da tela do admin.
  const [deletionRequestsError, setDeletionRequestsError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);

  const unreadNotificationCount = notifications.filter(n => !n.read).length;

  const resetPrivateState = useCallback(() => {
    setUserId(null);
    setIsAuthenticated(false);
    setIsAdminAuthenticated(false);
    setProfile(EMPTY_PROFILE);
    setSongs([]);
    setRequests([]);
    setReleases([]);
    setSubscription(EMPTY_SUBSCRIPTION);
    setDashboardMetrics([]);
    setNotifications([]);
    setAdminComposers([]);
    setAdminSongs([]);
    setAdminRequests([]);
    setAdminReleases([]);
    setSystemLogs([]);
    setTeamMembers([]);
    setDeletionRequests([]);
    setFeaturedSongIds([]);
    try {
      window.localStorage.removeItem('compositor-my-songs-filters-v1');
      window.sessionStorage.clear();
    } catch { /* no-op */ }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let activeRun = 0;
    let loadedUserId: string | null = null;

    const applySession = async (sessionUserId: string | null) => {
      const run = ++activeRun;
      /** Descarta o resultado de uma carga já superada por outra mais recente. */
      const isStale = () => run !== activeRun;

      if (!sessionUserId) {
        loadedUserId = null;
        resetPrivateState();
        setAuthLoading(false);
        return;
      }

      setUserId(sessionUserId);
      setIsAuthenticated(true);

      try {
        const [data, metrics] = await Promise.all([
          loadPrivateData(sessionUserId),
          loadDashboardMetrics(30).catch(() => [])
        ]);
        if (isStale()) return;
        setProfile(data.profile); setSongs(data.songs); setRequests(data.requests);
        setReleases(data.releases);

        // O plano escolhido no cadastro é gravado pela trigger handle_new_user a
        // partir do metadado `selected_plan` do signUp. A tentativa anterior de
        // corrigir isso pelo cliente era negada pela policy "subscription admin
        // update", com o erro descartado — quem escolhia Ouro ficava no Bronze e
        // nunca era avisado.
        setSubscription(data.subscription);
        try { localStorage.removeItem('pending_selected_plan'); } catch { /* storage indisponível */ }

        setDashboardMetrics(metrics);
        setIsAdminAuthenticated(data.isAdmin);
        if (data.isAdmin && data.adminRole) {
          setAdminRole(data.adminRole);
        }

        const userNotifs = await loadUserNotifications(sessionUserId).catch(() => [] as UserNotification[]);
        if (isStale()) return;
        setNotifications(userNotifs);

        if(data.isAdmin) {
          const [composers,allSongs,logs,admReqs,admRels,roles,delReqs]=await Promise.all([
            loadAdminComposers(),loadAdminSongs(),loadSystemLogs(),
            loadAdminRequests(),loadAdminReleases(),
            loadTeamRoles().catch((err: unknown) => {
              setAuthError(getFriendlyErrorMessage(err, 'Não foi possível carregar a equipe administrativa.'));
              return [] as UserRoleItem[];
            }),
            loadAccountDeletionRequests().then(r => { setDeletionRequestsError(null); return r; })
              .catch((err: unknown) => {
                setDeletionRequestsError(err instanceof Error ? err.message : 'Falha ao carregar as solicitações de exclusão.');
                return [] as AccountDeletionRequest[];
              })
          ]);
          if (isStale()) return;
          setAdminComposers(composers);
          setAdminSongs(allSongs);
          setFeaturedSongIds(allSongs.filter(s => s.isFeatured && s.status === 'published').map(s => s.id));
          setSystemLogs(logs);
          setAdminRequests(admReqs);
          setAdminReleases(admRels);
          setTeamMembers(roles);
          setDeletionRequests(delReqs);
        }
      } catch (error) {
        if (!isStale()) setAuthError(error instanceof Error ? error.message : 'Falha ao carregar os dados.');
      }
      if (!isStale()) {
        loadedUserId = sessionUserId;
        setAuthLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session?.user.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.history.replaceState(null, '', '/autenticacao?modo=new-password');
      }
      const nextUserId = session?.user.id ?? null;
      // TOKEN_REFRESHED e USER_UPDATED chegam de hora em hora (e a cada
      // reautenticação do PIN administrativo) para o mesmo usuário já
      // carregado. Recarregar ali disparava ~17 consultas e competia com a
      // carga em andamento, sem nenhum dado novo para mostrar.
      if (nextUserId && nextUserId === loadedUserId && (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) return;
      window.setTimeout(() => void applySession(nextUserId), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [resetPrivateState]);

  // Mantém sino, badge e lista sincronizados enquanto o painel está aberto.
  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase
      .channel(`user-notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` }, payload => {
        const row = payload.new as any;
        const incoming: UserNotification = {
          id: row.id, userId: row.user_id, title: row.title, message: row.message,
          type: row.type as NotificationType, read: Boolean(row.is_read),
          link: row.link || undefined, createdAt: row.created_at,
        };
        setNotifications(current => current.some(item => item.id === incoming.id) ? current : [incoming, ...current].slice(0, 50));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` }, payload => {
        const row = payload.new as any;
        setNotifications(current => current.map(item => item.id === row.id ? { ...item, read: Boolean(row.is_read) } : item));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  /**
   * Configurações da plataforma e catálogo de planos não dependem de sessão:
   * `get_platform_settings` e `subscription_plans` são legíveis por `anon`.
   * Carregá-los apenas dentro de applySession deixava o visitante anônimo com
   * os padrões de fábrica — o modo manutenção nunca aparecia para quem não
   * estava logado, a home mostrava preços de fábrica e o cadastro registrava
   * aceite de uma versão de termos que podia não ser a vigente.
   */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    void (async () => {
      const [settings, plans] = await Promise.all([
        loadPlatformSettings().catch(() => null),
        loadSubscriptionPlans().catch((err: unknown) => {
          setAuthError(getFriendlyErrorMessage(err, 'Não foi possível carregar os planos de assinatura.'));
          return null;
        })
      ]);
      if (cancelled) return;
      if (settings) setPlatformSettings(settings);
      // Catálogo vazio é estado legítimo; falha de leitura mantém o anterior.
      if (plans) setSubscriptionPlans(plans);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const refreshAdminTransactions = useCallback(async () => {
    if (!isAdminAuthenticated) return false;
    try {
      const [reqs, rels] = await Promise.all([loadAdminRequests(), loadAdminReleases()]);
      setAdminRequests(reqs);
      setAdminReleases(rels);
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Não foi possível atualizar transações.');
      return false;
    }
  }, [isAdminAuthenticated]);


  const updateProfile = async (data: Partial<ComposerProfile>) => {
    if (!userId) throw new Error('Sua sessão expirou. Entre novamente.');
    const next={...profile,...data};
    try {
      await saveProfile(userId,next);
      setProfile(next);
    } catch (error) {
      const message=error instanceof Error?error.message:'Não foi possível atualizar o perfil.';
      setAuthError(message);
      throw new Error(message);
    }
  };

  const addSong = async (songData: Omit<Song, 'id' | 'playCount' | 'interestedCount' | 'dateRegistered'>): Promise<Song> => {
    if (!userId) throw new Error('Sua sessão expirou. Entre novamente para cadastrar a música.');
    const newSong: Song = {
      ...songData,
      id: crypto.randomUUID(),
      playCount: 0,
      interestedCount: 0,
      dateRegistered: new Date().toISOString().split('T')[0]
    };
    try {
      await insertSong(userId, newSong);
    } catch (error) {
      console.error('[AppContext.addSong failure]', error);
      const message = getFriendlyErrorMessage(error, 'Não foi possível cadastrar a música.');
      throw new Error(message);
    }

    setSongs(prev => [newSong, ...prev]);

    // Add log
    addSystemLog({
      category: 'moderation',
      title: 'Nova Música Cadastrada',
      description: `Composição "${newSong.title}" (${newSong.genre}) foi adicionada ao acervo por ${profile.stageName}.`,
      user: profile.email,
      ip: '',
      status: 'info'
    });

    return newSong;
  };

  const updateSong = async (id: string, data: Partial<Song>) => {
    const previous = songs.find(song => song.id === id);
    setSongs(current => current.map(song => song.id === id ? { ...song, ...data } : song));
    try {
      await saveSong(id, data);
      if (previous) {
        const replacedFiles = [
          data.originalAudioPath !== undefined && data.originalAudioPath !== previous.originalAudioPath
            ? { bucket: STORAGE_BUCKETS.SONG_ORIGINALS, value: previous.originalAudioPath } : null,
          data.previewAudioUrl !== undefined && data.previewAudioUrl !== previous.previewAudioUrl
            ? { bucket: STORAGE_BUCKETS.SONG_PREVIEWS, value: previous.previewAudioUrl } : null,
          data.coverUrl !== undefined && data.coverUrl !== previous.coverUrl
            ? { bucket: STORAGE_BUCKETS.SONG_COVERS, value: previous.coverUrl } : null
        ].filter((file): file is NonNullable<typeof file> => Boolean(file?.value));
        if (replacedFiles.length) void removeCurrentUserStorageFiles(replacedFiles).catch(error => {
          setAuthError(getFriendlyErrorMessage(error, 'Música salva, mas não foi possível remover o arquivo antigo.'));
        });
      }
      return true;
    } catch (error) {
      if (previous) setSongs(current => current.map(song => song.id === id ? previous : song));
      // O motivo vem do banco (gatilhos de publicação, plano, mídia) e é o que o
      // compositor precisa ler; cada tela o exibe junto da ação que falhou.
      throw new Error(getFriendlyErrorMessage(error, 'Falha ao atualizar a música.'));
    }
  };

  const deleteSong = async (id: string) => {
    const target = songs.find(s => s.id === id);
    if (!target) return false;
    setSongs(current => current.filter(song => song.id !== id));
    try {
      await removeSong(id);
      try {
        await removeCurrentUserStorageFiles([
          { bucket: STORAGE_BUCKETS.SONG_ORIGINALS, value: target.originalAudioPath },
          { bucket: STORAGE_BUCKETS.SONG_PREVIEWS, value: target.previewAudioUrl },
          { bucket: STORAGE_BUCKETS.SONG_COVERS, value: target.coverUrl }
        ]);
      } catch (cleanupError) {
        setAuthError(getFriendlyErrorMessage(cleanupError, 'Música excluída, mas a limpeza dos arquivos falhou.'));
      }
      addSystemLog({
        category: 'moderation',
        title: 'Música Removida do Acervo',
        description: `Música "${target.title}" foi excluída pelo compositor.`,
        user: profile.email,
        ip: '',
        status: 'warning'
      });
      return true;
    } catch (error) {
      setSongs(current => current.some(song => song.id === id) ? current : [target, ...current]);
      setAuthError(getFriendlyErrorMessage(error, 'Falha ao excluir a música.'));
      return false;
    }
  };

  const queryMySongs = useCallback(async (params: SongPageQuery) => {
    if (!userId) throw new Error('Sua sessão expirou. Entre novamente.');
    const result = await loadMySongsPage(userId, params);
    setSongs(current => {
      const byId = new Map(current.map(song => [song.id, song]));
      result.songs.forEach(song => byId.set(song.id, song));
      return [...byId.values()];
    });
    return result;
  }, [userId]);

  const incrementPlayCount = (songId: string) => {
    void incrementPlay(songId).then(counted => {
      if (counted) setSongs(prev => prev.map(s => s.id === songId ? { ...s, playCount: s.playCount + 1 } : s));
    }).catch(()=>undefined);
  };

  /**
   * O erro propaga em vez de virar `null`: engolir a mensagem do servidor fazia
   * o visitante ver "tente novamente" quando a causa real era limite de
   * solicitações, obra indisponível ou manutenção da plataforma.
   */
  const addInterestRequest = async (reqData: Omit<InterestRequest, 'id' | 'createdAt' | 'status'>): Promise<InterestRequest> => {
    const requestId = await createInterest(reqData.songId, reqData);
    const newReq: InterestRequest = {
      ...reqData,
      id: requestId,
      createdAt: new Date().toISOString().split('T')[0],
      status: 'nova'
    };

    // Só reflete no estado local quando é o próprio compositor navegando
    // autenticado; para um visitante anônimo esses dados não são dele.
    if (userId && reqData.composerId === userId) {
      setRequests(prev => [newReq, ...prev]);
      setSongs(prev => prev.map(s => s.id === reqData.songId ? { ...s, interestedCount: s.interestedCount + 1 } : s));
    }
    return newReq;
  };

  const updateRequestStatus = async (
    requestId: string,
    status: RequestStatus,
    extra?: SaveRequestExtra
  ): Promise<InterestRequest | null> => {
    const previous = requests.find(req => req.id === requestId);
    const hasAgreedValue = Boolean(extra && 'agreedValue' in extra);
    const isExplicitClear = Boolean(
      extra?.clearAgreedValue ||
      extra?.agreedValue === 0 ||
      extra?.agreedValue === null ||
      (hasAgreedValue && (extra?.agreedValue === undefined || Number.isNaN(extra?.agreedValue)))
    );

    setRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        return {
          ...req,
          status,
          ...extra,
          agreedValue: isExplicitClear
            ? undefined
            : (hasAgreedValue && extra?.agreedValue != null
                ? Number(extra.agreedValue)
                : req.agreedValue)
        };
      }
      return req;
    }));

    try {
      const updated = await saveRequest(
        requestId,
        status,
        {
          ...extra,
          clearAgreedValue: isExplicitClear,
          ...(isExplicitClear ? { agreedValue: 0 } : {})
        },
        previous?.updatedAt
      );

      if (updated) {
        setRequests(prev => prev.map(req => req.id === requestId ? updated : req));
        return updated;
      }
      return previous || null;
    } catch (error) {
      if (previous) setRequests(prev => prev.map(req => req.id === requestId ? previous : req));
      const structuredError = parseRequestUpdateError(error, requestId);
      setAuthError(structuredError.message);
      throw structuredError;
    }
  };

  const clearRequestAgreedValue = async (requestId: string, status?: RequestStatus): Promise<InterestRequest | null> => {
    const current = requests.find(req => req.id === requestId);
    const targetStatus = status || current?.status || 'nova';
    return updateRequestStatus(requestId, targetStatus, { clearAgreedValue: true });
  };

  const queryRequests = useCallback((params: RequestPageQuery) => loadRequestPage(params), []);
  const getRequestById = useCallback(async (requestId: string) => {
    const item = await loadRequestById(requestId);
    if (item) setRequests(previous => previous.some(request => request.id === item.id)
      ? previous.map(request => request.id === item.id ? item : request)
      : [...previous, item]);
    return item;
  }, []);

  const issueRelease = async (
    requestId: string,
    releaseData: Omit<ReleaseDocument, 'id' | 'documentCode' | 'isDemonstrative'>,
    closeSong = false,
    expectedUpdatedAt?: string
  ): Promise<ReleaseDocument> => {
    let newDoc = await issueReleaseRequest(requestId, releaseData, closeSong, expectedUpdatedAt);
    const requestUpdatedAt = (newDoc as ReleaseDocument & { requestUpdatedAt?: string }).requestUpdatedAt;
    setRequests(prev => prev.map(req => req.id === requestId ? { ...req, status: 'liberacao_enviada', releaseId: newDoc.id, updatedAt: requestUpdatedAt || req.updatedAt, agreedValue: newDoc.agreedValue } : req));
    if (closeSong) setSongs(prev => prev.map(song => song.id === newDoc.songId ? { ...song, isAvailableForRelease: false } : song));
    setReleases(prev => [newDoc, ...prev]);

    addSystemLog({
      category: 'moderation',
      title: 'Liberação Digital Assinada',
      description: `Termo de autorização de gravação ${newDoc.documentCode} emitido para "${newDoc.songTitle}" em favor de ${newDoc.buyerName}.`,
      user: newDoc.composerName,
      ip: '',
      status: 'success'
    });

    return newDoc;
  };

  const markReleaseSent = async (releaseId: string) => {
    const { markReleaseSent: markReleaseSentDb } = await import('../lib/database');
    const timestamp = await markReleaseSentDb(releaseId);
    setReleases(prev => prev.map(r => r.id === releaseId ? { ...r, sentToBuyerAt: timestamp } : r));
    return timestamp;
  };

  const queryReleases = useCallback(async (params: ReleasePageQuery) => {
    if (!userId) throw new Error('Sua sessão expirou. Entre novamente.');
    return loadReleasePage(userId, params);
  }, [userId]);

  const login = async (email?: string, password?: string) => {
    setAuthError(null);
    if (!supabase) {
      setAuthError('Supabase não configurado. Verifique as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
      return false;
    }
    if (!email || !password) return false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(authErrorMessage(error));
    return !error;
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError('Supabase não configurado. Verifique as variáveis de ambiente.');
      return false;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${APP_URL}/autenticacao?oauth=google`,
        scopes: 'openid email profile'
      }
    });
    if (error) setAuthError(authErrorMessage(error));
    return !error;
  };

  const retryReleaseArchive = async (document: ReleaseDocument): Promise<ReleaseDocument> => {
    if (!userId) throw new Error('Entre na sua conta para arquivar o documento.');
    const { archiveReleasePdf } = await import('../lib/releaseArchive');
    const archived = await archiveReleasePdf(userId, document);
    setReleases(prev => prev.map(item => item.id === archived.id ? archived : item));
    return archived;
  };

  const refreshSubscription = useCallback(async () => {
    if (!userId) return null;
    try {
      const sub = await loadUserSubscription(userId);
      if (sub) setSubscription(sub);
      return sub;
    } catch (err) {
      console.error('Falha ao atualizar assinatura:', err);
      return null;
    }
  }, [userId]);

  const register = async (email: string, password: string, profileData: Partial<ComposerProfile>, selectedPlanName?: string) => {
    setAuthError(null);
    if (!supabase) {
      setAuthError('Supabase não configurado. Verifique as variáveis de ambiente.');
      return { success: false, needsEmailConfirmation: false };
    }
    // O plano vai no metadado do signUp e é gravado pela trigger
    // handle_new_user. Precisa sair do catálogo real: o preço de fábrica
    // divergiria do catálogo administrado no banco.
    const chosenPlan = selectedPlanName || subscriptionPlans.find(p => p.isActive)?.name || 'Plano Bronze';
    const planConfig = resolvePlan(subscriptionPlans, chosenPlan);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${APP_URL}/autenticacao`,
        data: {
          profile: { ...EMPTY_PROFILE, ...profileData, email },
          selected_plan: planConfig.name,
          monthly_price: formatMoneyBR(planConfig.monthlyPrice),
          // Versão marcada na caixa "Li e aceito os Termos"; a trigger
          // `handle_new_user_terms` converte isso no registro de aceite.
          terms_version: platformSettings.termsVersion
        }
      }
    });
    if (error) {
      setAuthError(authErrorMessage(error));
      return { success: false, needsEmailConfirmation: false };
    }
    return { success: true, needsEmailConfirmation: !data.session };
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    if (!supabase) {
      setAuthError('Supabase não configurado.');
      return false;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/autenticacao?modo=new-password`
    });
    if (error) setAuthError(authErrorMessage(error));
    return !error;
  };

  const resendConfirmation = async (email: string) => {
    setAuthError(null);
    if (!supabase) { setAuthError('Supabase não configurado.'); return false; }
    const { error } = await supabase.auth.resend({
      type: 'signup', email,
      options: { emailRedirectTo: `${APP_URL}/autenticacao?confirmado=1` }
    });
    if (error) setAuthError(authErrorMessage(error));
    return !error;
  };

  const updatePassword = async (password: string, currentPassword?: string) => {
    setAuthError(null);
    if (!supabase) {
      setAuthError('Supabase não configurado.');
      return false;
    }
    if (currentPassword) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (userError || !email) {
        setAuthError(authErrorMessage(userError || 'Usuário não encontrado.'));
        return false;
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (reauthError) {
        setAuthError('A senha atual está incorreta.');
        return false;
      }
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      await supabase.rpc('record_my_password_change');
      await supabase.auth.signOut({ scope: 'others' });
    }
    if (error) setAuthError(authErrorMessage(error));
    return !error;
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    resetPrivateState();
  };

  // Admin Methods
  const adminLogin = async (email?: string, password?: string) => {
    if (!supabase || !email || !password) return false;
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error||!data.user){setAuthError(authErrorMessage(error||'Credenciais inválidas.'));return false;}
    const {data:roles}=await supabase.from('user_roles').select('role').eq('user_id',data.user.id);
    const allowed=(roles||[]).some(item=>['admin','moderator','financial'].includes(item.role));
    setIsAdminAuthenticated(allowed);
    if(!allowed){await supabase.auth.signOut();setAuthError('Esta conta não possui acesso administrativo.');return false;}
    const resolvedRole: 'master'|'moderator'|'financial' = (roles||[]).some(item=>item.role==='admin')?'master':(roles||[]).some(item=>item.role==='moderator')?'moderator':'financial';
    setAdminRole(resolvedRole);
    addSystemLog({
      category: 'auth',
      title: 'Acesso Administrativo Efetuado',
      description: `Membro da equipe (${resolvedRole.toUpperCase()}) autenticado no Painel Administrativo.`,
      user: data.user.email || 'admin@mercadodocompositor.com.br',
      ip: '',
      status: 'success'
    });
    return allowed;
  };

  const adminLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    resetPrivateState();
  };

  const updateAdminComposerStatus = async (composerId: string, status: SubscriptionStatus) => {
    try { await adminSetSubscription(composerId,status); }
    catch(error){setAuthError(error instanceof Error?error.message:'Falha ao atualizar assinatura.');return false;}
    setAdminComposers(prev => prev.map(c => c.id===composerId?{...c,subscriptionStatus:status}:c));

    addSystemLog({
      category: 'financial',
      title: 'Status de Assinatura Modificado',
      description: `Status do compositor #${composerId} alterado para "${status}" pelo administrador.`,
      user: profile.email || 'Admin Master',
      ip: '',
      status: 'warning'
    });
    return true;
  };

  const toggleComposerVerified = async (composerId: string) => {
    const target=adminComposers.find(c=>c.id===composerId);
    if(!target)return false;
    try{await adminSetVerified(composerId,!target.isVerified);}
    catch(error){setAuthError(error instanceof Error?error.message:'Falha ao alterar verificação.');return false;}
    setAdminComposers(prev=>prev.map(c=>c.id===composerId?{...c,isVerified:!target.isVerified}:c));
    return true;
  };

  const suspendAdminComposer = async (composerId: string): Promise<boolean> => {
    const success = await updateAdminComposerStatus(composerId, 'suspended');
    if (success) {
      addSystemLog({
        category: 'moderation',
        title: 'Conta de Compositor Suspensa',
        description: `A conta #${composerId} foi suspensa pelo administrador para impedir novas publicações.`,
        user: profile.email || 'Admin Master',
        ip: '',
        status: 'warning'
      });
    }
    return success;
  };


  /**
   * O servidor faz controle otimista de concorrência: `admin_update_platform_settings`
   * rejeita (40001) quando o `updated_at` enviado não bate com o da linha. Nesse caso
   * recarregamos as configurações em vigor, para que o formulário se sincronize e a
   * próxima tentativa parta da versão correta em vez de falhar indefinidamente.
   */
  const handleSettingsFailure = async (error: unknown, fallback: string): Promise<SettingsSaveResult> => {
    const message = getFriendlyErrorMessage(error, fallback);
    setAuthError(message);
    if (isSettingsConflict(error)) {
      try { setPlatformSettings(await loadPlatformSettings()); } catch { /* mantém o estado atual */ }
      return { ok: false, error: message, conflict: true };
    }
    return { ok: false, error: message };
  };

  const updatePlatformSettings = async (settings: Partial<PlatformSettings>, newPixKey?: string): Promise<SettingsSaveResult> => {
    const next={...platformSettings,...settings};
    let saved: PlatformSettings;
    try{saved=await savePlatformSettings(next,newPixKey);}
    catch(error){return handleSettingsFailure(error,'Falha ao salvar configurações.');}
    setPlatformSettings(saved);
    return { ok: true };
  };

  const resetPlatformSettings = async (): Promise<SettingsSaveResult> => {
    let saved: PlatformSettings;
    try{saved=await savePlatformSettings({...DEFAULT_PLATFORM_SETTINGS,updatedAt:platformSettings.updatedAt});}
    catch(error){return handleSettingsFailure(error,'Falha ao restaurar configurações.');}
    setPlatformSettings(saved);
    return { ok: true };
  };

  const addSystemLog = async (logData: Omit<SystemLog, 'id' | 'timestamp'>): Promise<boolean> => {
    const now = new Date();
    const formatted = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newLog: SystemLog = {
      ...logData,
      id: crypto.randomUUID(),
      timestamp: formatted
    };
    // write_system_audit_log aceita qualquer sessão autenticada e usa o e-mail
    // real do autor como `actor`. O gate anterior em isAdminAuthenticated fazia
    // cadastro/exclusão de obra e pedido LGPD do compositor sumirem da trilha.
    if (userId) {
      try {
        await insertSystemLog(newLog);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Falha ao registrar auditoria.');
        return false;
      }
    }
    if (isAdminAuthenticated) setSystemLogs(prev => [newLog, ...prev]);
    return true;
  };

  const toggleFeatureSong = async (songId: string) => {
    const nextValue=!featuredSongIds.includes(songId);
    try{await adminFeatureSong(songId,nextValue);}
    catch(error){setAuthError(error instanceof Error?error.message:'Falha ao alterar destaque.');return false;}
    setFeaturedSongIds(prev =>
      prev.includes(songId)
        ? prev.filter(id => id !== songId)
        : [...prev, songId]
    );
    setAdminSongs(prev => prev.map(s => s.id === songId ? { ...s, isFeatured: nextValue } : s));
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, isFeatured: nextValue } : s));
    return true;
  };

  const moderateSong = async (songId: string, status: Extract<SongStatus, 'published' | 'rejected' | 'draft'>, notes?: string): Promise<{ ok: boolean; error?: string }> => {
    const previous = adminSongs.find(song => song.id === songId);
    if (!previous) return { ok: false, error: 'Composição não localizada no acervo.' };
    const shouldUnfeature = status !== 'published';
    if (shouldUnfeature) {
      setFeaturedSongIds(prev => prev.filter(id => id !== songId));
    }
    const updatedNotes = notes !== undefined ? notes : (status === 'published' ? undefined : previous.notes);
    setAdminSongs(current => current.map(song => song.id === songId ? { ...song, status, notes: updatedNotes, isFeatured: shouldUnfeature ? false : song.isFeatured } : song));
    setSongs(current => current.map(song => song.id === songId ? { ...song, status, notes: updatedNotes, isFeatured: shouldUnfeature ? false : song.isFeatured } : song));
    try {
      await adminModerateSong(songId, status, notes);
      if (shouldUnfeature && previous.isFeatured) {
        void adminFeatureSong(songId, false).catch(() => undefined);
      }
      addSystemLog({
        category: 'moderation',
        title: status === 'published' ? 'Música aprovada' : status === 'rejected' ? 'Música rejeitada' : 'Música retirada do catálogo',
        description: `A composição "${previous.title}" teve o status alterado para ${status}.${notes ? ` Motivo: ${notes}` : ''}`,
        user: profile.email || 'Administrador',
        ip: '',
        status: status === 'published' ? 'success' : 'warning'
      });
      return { ok: true };
    } catch (error) {
      console.error('[moderateSong failure]', { error, songId, status });
      setAdminSongs(current => current.map(song => song.id === songId ? previous : song));
      setSongs(current => current.map(song => song.id === songId ? previous : song));
      if (previous.isFeatured) {
        setFeaturedSongIds(prev => prev.includes(songId) ? prev : [...prev, songId]);
      }
      const errMsg = error instanceof Error ? error.message : 'Não foi possível moderar a música.';
      setAuthError(errMsg);
      return { ok: false, error: errMsg };
    }
  };

  // SUBSCRIPTION PLANS ACTIONS
  /**
   * `originalName` identifica a linha quando o administrador renomeia o plano:
   * o nome é a chave primária, então sem ele o save criaria um plano duplicado.
   */
  const savePlan = async (plan: SubscriptionPlanItem, originalName?: string): Promise<boolean> => {
    try {
      await saveSubscriptionPlan(plan, originalName);
      // O id local acompanha o nome, que é a chave real da tabela.
      const persisted: SubscriptionPlanItem = { ...plan, id: plan.name };
      const previousKey = originalName || plan.id;
      setSubscriptionPlans(prev => {
        const idx = prev.findIndex(p => p.id === previousKey);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = persisted;
          return copy;
        }
        return [...prev, persisted];
      });
      // Aguardado: a gravação do plano não passa por RPC (ao contrário de
      // configurações e papéis, que auditam na mesma transação), então a falha
      // da auditoria precisa ao menos chegar ao estado de erro antes do toast.
      await addSystemLog({
        category: 'financial',
        title: 'Plano de Assinatura Atualizado',
        description: `Plano "${plan.name}" (R$ ${plan.monthlyPrice}) foi salvo com sucesso.`,
        user: profile.email || 'Admin',
        ip: '',
        status: 'success'
      });
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha ao salvar plano.');
      return false;
    }
  };

  const deletePlan = async (planId: string): Promise<boolean> => {
    try {
      await deleteSubscriptionPlan(planId);
      setSubscriptionPlans(prev => prev.filter(p => p.id !== planId));
      await addSystemLog({
        category: 'financial',
        title: 'Plano de Assinatura Excluído',
        description: `Plano id #${planId} foi excluído do catálogo de assinaturas.`,
        user: profile.email || 'Admin',
        ip: '',
        status: 'warning'
      });
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha ao excluir plano.');
      return false;
    }
  };

  // TEAM & ROLES ACTIONS
  const assignTeamRole = async (email: string, role: AdminRoleType): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await adminAssignRole(email, role);
      if (res.success) {
        const reloaded = await loadTeamRoles();
        setTeamMembers(reloaded);
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao atribuir função.';
      setAuthError(msg);
      return { success: false, message: msg };
    }
  };

  const revokeTeamRole = async (targetUserId: string, role: AdminRoleType): Promise<boolean> => {
    try {
      await adminRevokeRole(targetUserId, role);
      setTeamMembers(prev => prev.filter(m => !(m.userId === targetUserId && m.role === role)));
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha ao revogar função.');
      return false;
    }
  };

  // LGPD ACCOUNT DELETION ACTIONS
  const updateDeletionRequest = async (id: string, status: DeletionRequestStatus, adminNotes?: string): Promise<boolean> => {
    try {
      await updateAccountDeletionRequestStatus(id, status, adminNotes);
      setDeletionRequests(prev => prev.map(r => r.id === id ? {
        ...r,
        status,
        adminNotes: adminNotes ?? r.adminNotes,
        resolvedAt: (status === 'concluida' || status === 'rejeitada') ? new Date().toISOString() : r.resolvedAt
      } : r));
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha ao atualizar status da solicitação.');
      return false;
    }
  };

  const finalizeAccountDeletion = async (id: string, adminNotes?: string): Promise<boolean> => {
    try {
      await adminFinalizeAccountDeletion(id, adminNotes);
      // Recarrega do servidor: a conclusão também pseudonimiza nome e e-mail
      // na própria solicitação, então o estado local ficaria desatualizado.
      setDeletionRequests(await loadAccountDeletionRequests());
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha ao concluir a exclusão da conta.');
      return false;
    }
  };

  // NOTIFICATION ACTIONS
  const markNotificationRead = async (id: string): Promise<void> => {
    const previous = notifications;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      await markNotificationAsRead(id);
    } catch (error) {
      setNotifications(previous);
      setAuthError(getFriendlyErrorMessage(error, 'Não foi possível marcar a notificação como lida.'));
    }
  };

  const markAllNotificationsRead = async (): Promise<void> => {
    if (!userId) return;
    const previous = notifications;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await markAllNotificationsAsRead(userId);
    } catch (error) {
      setNotifications(previous);
      setAuthError(getFriendlyErrorMessage(error, 'Não foi possível marcar as notificações como lidas.'));
    }
  };

  const sendNotification = async (notificationData: Omit<UserNotification, 'id' | 'createdAt'>): Promise<void> => {
    const created = await createUserNotification(notificationData);
    if (userId && created.userId === userId) {
      setNotifications(prev => [created, ...prev]);
    }
  };

  return (
    <AppContext.Provider value={{
      currentUserId: userId,
      profile,
      updateProfile,
      songs,
      addSong,
      updateSong,
      deleteSong,
      queryMySongs,
      incrementPlayCount,
      requests,
      addInterestRequest,
      updateRequestStatus,
      clearRequestAgreedValue,
      queryRequests,
      getRequestById,
      releases,
      queryReleases,
      issueRelease,
      retryReleaseArchive,
      markReleaseSent,
      subscription,
      dashboardMetrics,
      refreshSubscription,

      isAuthenticated,
      authLoading,
      authError,
      clearAuthError,
      login,
      loginWithGoogle,
      register,
      resetPassword,
      resendConfirmation,
      updatePassword,
      logout,

      // ADMIN
      isAdminAuthenticated,
      adminRole,
      adminLogin,
      adminLogout,
      verifyAdminPassword,
      adminComposers,
      adminSongs,
      adminRequests,
      adminReleases,
      refreshAdminTransactions,
      moderateSong,
      updateAdminComposerStatus,
      toggleComposerVerified,
      suspendAdminComposer,
      platformSettings,
      updatePlatformSettings,
      resetPlatformSettings,
      systemLogs,
      addSystemLog,
      featuredSongIds,
      toggleFeatureSong,

      // SUBSCRIPTION PLANS
      subscriptionPlans,
      savePlan,
      deletePlan,

      // TEAM & ROLES
      teamMembers,
      assignTeamRole,
      revokeTeamRole,

      // LGPD DELETION
      deletionRequests,
      deletionRequestsError,
      updateDeletionRequestStatus: updateDeletionRequest,
      finalizeAccountDeletion,

      // NOTIFICATIONS
      notifications,
      unreadNotificationCount,
      markNotificationRead,
      markAllNotificationsRead,
      sendNotification,

    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
