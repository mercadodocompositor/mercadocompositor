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
  SystemLog
  ,DashboardMetricPoint
} from '../types';
import { DEFAULT_PLATFORM_SETTINGS } from '../data/platformDefaults';
import { APP_CONFIG, APP_URL } from '../config/appConfig';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { adminFeatureSong, adminSetSubscription, adminSetVerified, createInterest, deleteSystemLogs, incrementPlay, insertSong, insertSystemLog, issueReleaseRequest, loadAdminComposers, loadAdminSongs, loadDashboardMetrics, loadMySongsPage, loadPlatformSettings, loadPrivateData, loadSystemLogs, removeCurrentUserStorageFiles, removeSong, savePlatformSettings, saveProfile, saveRequest, saveSong, type SongCatalogStats, type SongPageQuery } from '../lib/database';

type RegistrationResult = { success: boolean; needsEmailConfirmation: boolean };

const EMPTY_PROFILE: ComposerProfile = {
  username: '', name: '', stageName: '', email: '', whatsapp: '', cpf: '', city: '', state: '',
  bio: '', experienceYears: '', genres: [], instagram: '', youtube: '', website: '', photo: '',
  coverPhoto: '', viewsCount: 0
};

const EMPTY_SUBSCRIPTION: Subscription = {
  status: 'pending', planName: APP_CONFIG.plans[0].name,
  monthlyPrice: APP_CONFIG.plans[0].priceMonthly, nextBillingDate: '',
  paymentMethod: 'Pix', invoices: []
};

interface AppContextType {
  profile: ComposerProfile;
  updateProfile: (data: Partial<ComposerProfile>) => Promise<void>;
  
  songs: Song[];
  addSong: (song: Omit<Song, 'id' | 'playCount' | 'interestedCount' | 'dateRegistered'>) => Promise<Song>;
  updateSong: (id: string, data: Partial<Song>) => Promise<boolean>;
  deleteSong: (id: string) => Promise<boolean>;
  queryMySongs: (params: SongPageQuery) => Promise<{ songs: Song[]; total: number; stats: SongCatalogStats }>;
  incrementPlayCount: (songId: string) => void;
  
  requests: InterestRequest[];
  addInterestRequest: (req: Omit<InterestRequest, 'id' | 'createdAt' | 'status'>) => Promise<InterestRequest | null>;
  updateRequestStatus: (requestId: string, status: RequestStatus, extra?: Partial<InterestRequest>) => Promise<boolean>;
  
  releases: ReleaseDocument[];
  issueRelease: (requestId: string, releaseData: Omit<ReleaseDocument, 'id' | 'documentCode' | 'isDemonstrative'>) => Promise<ReleaseDocument>;
  
  subscription: Subscription;
  dashboardMetrics: DashboardMetricPoint[];
  
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  login: (email?: string, password?: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  register: (email: string, password: string, profile: Partial<ComposerProfile>) => Promise<RegistrationResult>;
  resetPassword: (email: string) => Promise<boolean>;
  resendConfirmation: (email: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  
  // ADMIN PANEL STATES & ACTIONS
  isAdminAuthenticated: boolean;
  adminRole: 'master' | 'moderator' | 'financial';
  setAdminRole: (role: 'master' | 'moderator' | 'financial') => void;
  adminLogin: (email?: string, password?: string) => Promise<boolean>;
  adminLogout: () => void;
  
  adminComposers: AdminComposer[];
  adminSongs: Song[];
  moderateSong: (songId: string, status: Extract<SongStatus, 'published' | 'rejected' | 'draft'>) => Promise<boolean>;
  updateAdminComposerStatus: (composerId: string, status: SubscriptionStatus) => Promise<boolean>;
  toggleComposerVerified: (composerId: string) => Promise<boolean>;
  deleteAdminComposer: (composerId: string) => void;
  addAdminComposer: (composer: Omit<AdminComposer, 'id' | 'registeredAt' | 'songCount' | 'totalPlays' | 'totalReleases' | 'revenueGenerated'>) => void;

  platformSettings: PlatformSettings;
  updatePlatformSettings: (settings: Partial<PlatformSettings>) => Promise<boolean>;
  resetPlatformSettings: () => Promise<boolean>;

  systemLogs: SystemLog[];
  addSystemLog: (log: Omit<SystemLog, 'id' | 'timestamp'>) => void;
  clearSystemLogs: () => void;

  featuredSongIds: string[];
  toggleFeatureSong: (songId: string) => Promise<boolean>;

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

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    const applySession = async (sessionUserId: string | null) => {
      setUserId(sessionUserId);
      setIsAuthenticated(Boolean(sessionUserId));
      if (!sessionUserId) {
        setAuthLoading(false);
        return;
      }

      try {
        const [data, settings, metrics] = await Promise.all([loadPrivateData(sessionUserId), loadPlatformSettings(), loadDashboardMetrics(30)]);
        setProfile(data.profile); setSongs(data.songs); setRequests(data.requests);
        setReleases(data.releases); setSubscription(data.subscription);
        setPlatformSettings(settings);
        setDashboardMetrics(metrics);
        setIsAdminAuthenticated(data.isAdmin);
        if(data.isAdmin) {
          const [composers,allSongs,logs]=await Promise.all([loadAdminComposers(),loadAdminSongs(),loadSystemLogs()]);
          setAdminComposers(composers);
          setAdminSongs(allSongs);
          setFeaturedSongIds(allSongs.filter(s => s.isFeatured).map(s => s.id));
          setSystemLogs(logs);
        }
      } catch (error) { setAuthError(error instanceof Error ? error.message : 'Falha ao carregar os dados.'); }
      setAuthLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session?.user.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.history.replaceState(null, '', '/autenticacao?modo=new-password');
      }
      window.setTimeout(() => void applySession(session?.user.id ?? null), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Admin States
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return false;
  });

  const [adminRole, setAdminRole] = useState<'master' | 'moderator' | 'financial'>('master');

  const [adminComposers, setAdminComposers] = useState<AdminComposer[]>(() => {
    return [];
  });

  const [adminSongs, setAdminSongs] = useState<Song[]>([]);

  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(() => {
    return DEFAULT_PLATFORM_SETTINGS;
  });

  const [systemLogs, setSystemLogs] = useState<SystemLog[]>(() => {
    return [];
  });

  const [featuredSongIds, setFeaturedSongIds] = useState<string[]>(() => {
    return [];
  });


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
      const message = error instanceof Error ? error.message : 'Não foi possível cadastrar a música.';
      setAuthError(message);
      throw new Error(message);
    }

    setSongs(prev => [newSong, ...prev]);

    // Add log
    addSystemLog({
      category: 'moderation',
      title: 'Nova Música Cadastrada',
      description: `Composição "${newSong.title}" (${newSong.genre}) foi adicionada ao acervo por ${profile.stageName}.`,
      user: profile.email,
      ip: '177.89.21.4',
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
            ? { bucket: 'song-originals', value: previous.originalAudioPath } : null,
          data.previewAudioUrl !== undefined && data.previewAudioUrl !== previous.previewAudioUrl
            ? { bucket: 'song-previews', value: previous.previewAudioUrl } : null,
          data.coverUrl !== undefined && data.coverUrl !== previous.coverUrl
            ? { bucket: 'song-covers', value: previous.coverUrl } : null
        ].filter((file): file is { bucket: string; value: string | null | undefined } => Boolean(file?.value));
        if (replacedFiles.length) void removeCurrentUserStorageFiles(replacedFiles).catch(error => {
          setAuthError(error instanceof Error ? `Música salva, mas não foi possível remover o arquivo antigo: ${error.message}` : 'Música salva, mas não foi possível remover o arquivo antigo.');
        });
      }
      return true;
    } catch (error) {
      if (previous) setSongs(current => current.map(song => song.id === id ? previous : song));
      setAuthError(error instanceof Error ? error.message : 'Falha ao atualizar a música.');
      return false;
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
          { bucket: 'song-originals', value: target.originalAudioPath },
          { bucket: 'song-previews', value: target.previewAudioUrl },
          { bucket: 'song-covers', value: target.coverUrl }
        ]);
      } catch (cleanupError) {
        setAuthError(cleanupError instanceof Error ? `Música excluída, mas a limpeza dos arquivos falhou: ${cleanupError.message}` : 'Música excluída, mas a limpeza dos arquivos falhou.');
      }
      addSystemLog({
        category: 'moderation',
        title: 'Música Removida do Acervo',
        description: `Música "${target.title}" foi excluída pelo compositor.`,
        user: profile.email,
        ip: '177.89.21.4',
        status: 'warning'
      });
      return true;
    } catch (error) {
      setSongs(current => current.some(song => song.id === id) ? current : [target, ...current]);
      setAuthError(error instanceof Error ? error.message : 'Falha ao excluir a música.');
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

  const addInterestRequest = async (reqData: Omit<InterestRequest, 'id' | 'createdAt' | 'status'>): Promise<InterestRequest | null> => {
    try {
    const requestId = await createInterest(reqData.songId, reqData);
    const newReq: InterestRequest = {
      ...reqData,
      id: requestId,
      createdAt: new Date().toISOString().split('T')[0],
      status: 'nova'
    };
    
    setRequests(prev => [newReq, ...prev]);
    setSongs(prev => prev.map(s => s.id === reqData.songId ? { ...s, interestedCount: s.interestedCount + 1 } : s));
    return newReq;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Não foi possível enviar a solicitação.');
      return null;
    }
  };

  const updateRequestStatus = async (requestId: string, status: RequestStatus, extra?: Partial<InterestRequest>) => {
    const previous = requests.find(req => req.id === requestId);
    setRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        return {
          ...req,
          status,
          ...extra
        };
      }
      return req;
    }));
    try {
      await saveRequest(requestId,status,extra);
      return true;
    } catch (error) {
      if (previous) setRequests(prev => prev.map(req => req.id === requestId ? previous : req));
      setAuthError(error instanceof Error ? error.message : 'Não foi possível atualizar a solicitação.');
      return false;
    }
  };

  const issueRelease = async (
    requestId: string, 
    releaseData: Omit<ReleaseDocument, 'id' | 'documentCode' | 'isDemonstrative'>
  ): Promise<ReleaseDocument> => {
    const newDoc = await issueReleaseRequest(requestId, releaseData);
    setReleases(prev => [newDoc, ...prev]);
    setRequests(prev => prev.map(req => req.id === requestId ? { ...req, status: 'liberacao_enviada', releaseId: newDoc.id } : req));

    addSystemLog({
      category: 'moderation',
      title: 'Liberação Digital Assinada',
      description: `Termo de autorização de gravação ${newDoc.documentCode} emitido para "${newDoc.songTitle}" em favor de ${newDoc.buyerName}.`,
      user: newDoc.composerName,
      ip: '177.89.21.4',
      status: 'success'
    });

    return newDoc;
  };

  const login = async (email?: string, password?: string) => {
    setAuthError(null);
    if (!supabase) {
      setAuthError('Supabase não configurado. Verifique as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
      return false;
    }
    if (!email || !password) return false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
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
    if (error) setAuthError(error.message);
    return !error;
  };

  const register = async (email: string, password: string, profileData: Partial<ComposerProfile>) => {
    setAuthError(null);
    if (!supabase) {
      setAuthError('Supabase não configurado. Verifique as variáveis de ambiente.');
      return { success: false, needsEmailConfirmation: false };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${APP_URL}/autenticacao`,
        data: { profile: { ...EMPTY_PROFILE, ...profileData, email } }
      }
    });
    if (error) {
      setAuthError(error.message);
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
    if (error) setAuthError(error.message);
    return !error;
  };

  const resendConfirmation = async (email: string) => {
    setAuthError(null);
    if (!supabase) { setAuthError('Supabase não configurado.'); return false; }
    const { error } = await supabase.auth.resend({
      type: 'signup', email,
      options: { emailRedirectTo: `${APP_URL}/autenticacao?confirmado=1` }
    });
    if (error) setAuthError(error.message);
    return !error;
  };

  const updatePassword = async (password: string) => {
    setAuthError(null);
    if (!supabase) {
      setAuthError('Supabase não configurado.');
      return false;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setAuthError(error.message);
    return !error;
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  // Admin Methods
  const adminLogin = async (email?: string, password?: string) => {
    if (!supabase || !email || !password) return false;
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error||!data.user){setAuthError(error?.message||'Credenciais inválidas.');return false;}
    const {data:roles}=await supabase.from('user_roles').select('role').eq('user_id',data.user.id);
    const allowed=(roles||[]).some(item=>item.role==='admin');
    setIsAdminAuthenticated(allowed);
    if(!allowed){await supabase.auth.signOut();setAuthError('Esta conta não possui acesso administrativo.');return false;}
    addSystemLog({
      category: 'auth',
      title: 'Login Master Efetuado',
      description: 'Dono da plataforma autenticado no Painel Administrativo.',
      user: 'admin@mercadodocompositor.com.br',
      ip: '201.55.190.8',
      status: 'success'
    });
    return allowed;
  };

  const adminLogout = () => {
    setIsAdminAuthenticated(false);
  };

  const updateAdminComposerStatus = async (composerId: string, status: SubscriptionStatus) => {
    try { await adminSetSubscription(composerId,status); }
    catch(error){setAuthError(error instanceof Error?error.message:'Falha ao atualizar assinatura.');return false;}
    setAdminComposers(prev => prev.map(c => c.id===composerId?{...c,subscriptionStatus:status}:c));

    addSystemLog({
      category: 'financial',
      title: 'Status de Assinatura Modificado',
      description: `Status do compositor #${composerId} alterado para "${status}" pelo administrador.`,
      user: 'Admin Master',
      ip: '201.55.190.8',
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

  const deleteAdminComposer = (composerId: string) => {
    setAuthError('Exclusão de contas exige uma função de servidor com a API administrativa do Supabase.');
  };

  const addAdminComposer = (_composerData: Omit<AdminComposer, 'id' | 'registeredAt' | 'songCount' | 'totalPlays' | 'totalReleases' | 'revenueGenerated'>) => {
    setAuthError('Crie novas contas pelo fluxo de cadastro para preservar confirmação de e-mail e senha segura.');
  };

  const updatePlatformSettings = async (settings: Partial<PlatformSettings>) => {
    const next={...platformSettings,...settings};
    try{await savePlatformSettings(next);}
    catch(error){setAuthError(error instanceof Error?error.message:'Falha ao salvar configurações.');return false;}
    setPlatformSettings(next);
    addSystemLog({
      category: 'system',
      title: 'Configurações da Plataforma Atualizadas',
      description: 'Parâmetros comerciais ou institucionais foram salvos com sucesso.',
      user: 'Admin Master',
      ip: '201.55.190.8',
      status: 'info'
    });
    return true;
  };

  const resetPlatformSettings = async () => {
    try{await savePlatformSettings(DEFAULT_PLATFORM_SETTINGS);}
    catch(error){setAuthError(error instanceof Error?error.message:'Falha ao restaurar configurações.');return false;}
    setPlatformSettings(DEFAULT_PLATFORM_SETTINGS);
    return true;
  };

  const addSystemLog = (logData: Omit<SystemLog, 'id' | 'timestamp'>) => {
    const now = new Date();
    const formatted = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newLog: SystemLog = {
      ...logData,
      id: crypto.randomUUID(),
      timestamp: formatted
    };
    setSystemLogs(prev => [newLog, ...prev]);
    if(isAdminAuthenticated)void insertSystemLog(newLog).catch(e=>setAuthError(e.message));
  };

  const clearSystemLogs = async () => {
    try{await deleteSystemLogs();setSystemLogs([]);}
    catch(error){setAuthError(error instanceof Error?error.message:'Falha ao limpar logs.');}
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

  const moderateSong = async (songId: string, status: Extract<SongStatus, 'published' | 'rejected' | 'draft'>) => {
    const previous = adminSongs.find(song => song.id === songId);
    if (!previous) return false;
    const shouldUnfeature = status !== 'published';
    if (shouldUnfeature) {
      setFeaturedSongIds(prev => prev.filter(id => id !== songId));
    }
    setAdminSongs(current => current.map(song => song.id === songId ? { ...song, status, isFeatured: shouldUnfeature ? false : song.isFeatured } : song));
    try {
      await saveSong(songId, { status });
      if (shouldUnfeature && previous.isFeatured) {
        void adminFeatureSong(songId, false).catch(() => undefined);
      }
      setSongs(current => current.map(song => song.id === songId ? { ...song, status, isFeatured: shouldUnfeature ? false : song.isFeatured } : song));
      addSystemLog({
        category: 'moderation',
        title: status === 'published' ? 'Música aprovada' : status === 'rejected' ? 'Música rejeitada' : 'Música retirada do catálogo',
        description: `A composição "${previous.title}" teve o status alterado para ${status}.`,
        user: profile.email || 'Administrador',
        ip: '',
        status: status === 'published' ? 'success' : 'warning'
      });
      return true;
    } catch (error) {
      setAdminSongs(current => current.map(song => song.id === songId ? previous : song));
      setAuthError(error instanceof Error ? error.message : 'Não foi possível moderar a música.');
      return false;
    }
  };

  return (
    <AppContext.Provider value={{
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
      releases,
      issueRelease,
      subscription,
      dashboardMetrics,
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
      setAdminRole,
      adminLogin,
      adminLogout,
      adminComposers,
      adminSongs,
      moderateSong,
      updateAdminComposerStatus,
      toggleComposerVerified,
      deleteAdminComposer,
      addAdminComposer,
      platformSettings,
      updatePlatformSettings,
      resetPlatformSettings,
      systemLogs,
      addSystemLog,
      clearSystemLogs,
      featuredSongIds,
      toggleFeatureSong,

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
