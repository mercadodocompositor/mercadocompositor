import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Song, 
  InterestRequest, 
  ReleaseDocument, 
  ComposerProfile, 
  Subscription, 
  SubscriptionStatus, 
  RequestStatus,
  AdminComposer,
  PlatformSettings,
  SystemLog
} from '../types';
import { DEFAULT_PLATFORM_SETTINGS } from '../data/platformDefaults';
import { APP_CONFIG, APP_URL } from '../config/appConfig';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { adminFeatureSong, adminSetSubscription, adminSetVerified, createInterest, deleteSystemLogs, incrementPlay, insertRelease, insertSong, insertSystemLog, loadAdminComposers, loadPlatformSettings, loadPrivateData, loadSystemLogs, removeSong, savePlatformSettings, saveProfile, saveRequest, saveSong, saveSubscription } from '../lib/database';

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
  updateProfile: (data: Partial<ComposerProfile>) => void;
  
  songs: Song[];
  addSong: (song: Omit<Song, 'id' | 'playCount' | 'interestedCount' | 'dateRegistered'>) => Song;
  updateSong: (id: string, data: Partial<Song>) => void;
  deleteSong: (id: string) => void;
  incrementPlayCount: (songId: string) => void;
  
  requests: InterestRequest[];
  addInterestRequest: (req: Omit<InterestRequest, 'id' | 'createdAt' | 'status'>) => InterestRequest;
  updateRequestStatus: (requestId: string, status: RequestStatus, extra?: Partial<InterestRequest>) => void;
  
  releases: ReleaseDocument[];
  issueRelease: (requestId: string, releaseData: Omit<ReleaseDocument, 'id' | 'documentCode' | 'isDemonstrative'>) => ReleaseDocument;
  
  subscription: Subscription;
  updateSubscriptionPlan: (planName: string, monthlyPrice: string) => void;
  updateSubscriptionPaymentMethod: (method: 'Cartão de Crédito' | 'Pix', cardLast4?: string) => void;
  
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  login: (email?: string, password?: string) => Promise<boolean>;
  register: (email: string, password: string, profile: Partial<ComposerProfile>) => Promise<RegistrationResult>;
  resetPassword: (email: string) => Promise<boolean>;
  resendConfirmation: (email: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  
  // ADMIN PANEL STATES & ACTIONS
  isAdminAuthenticated: boolean;
  adminLogin: (email?: string, password?: string) => Promise<boolean>;
  adminLogout: () => void;
  
  adminComposers: AdminComposer[];
  updateAdminComposerStatus: (composerId: string, status: SubscriptionStatus) => void;
  toggleComposerVerified: (composerId: string) => void;
  deleteAdminComposer: (composerId: string) => void;
  addAdminComposer: (composer: Omit<AdminComposer, 'id' | 'registeredAt' | 'songCount' | 'totalPlays' | 'totalReleases' | 'revenueGenerated'>) => void;

  platformSettings: PlatformSettings;
  updatePlatformSettings: (settings: Partial<PlatformSettings>) => void;
  resetPlatformSettings: () => void;

  systemLogs: SystemLog[];
  addSystemLog: (log: Omit<SystemLog, 'id' | 'timestamp'>) => void;
  clearSystemLogs: () => void;

  featuredSongIds: string[];
  toggleFeatureSong: (songId: string) => void;

}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
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
        const data = await loadPrivateData(sessionUserId);
        setProfile(data.profile); setSongs(data.songs); setRequests(data.requests);
        setReleases(data.releases); setSubscription(data.subscription);
        setIsAdminAuthenticated(data.isAdmin);
        if(data.isAdmin) {
          const [composers,settings,logs]=await Promise.all([loadAdminComposers(),loadPlatformSettings(),loadSystemLogs()]);
          setAdminComposers(composers);setPlatformSettings(settings);setSystemLogs(logs);
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

  const [adminComposers, setAdminComposers] = useState<AdminComposer[]>(() => {
    return [];
  });

  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(() => {
    return DEFAULT_PLATFORM_SETTINGS;
  });

  const [systemLogs, setSystemLogs] = useState<SystemLog[]>(() => {
    return [];
  });

  const [featuredSongIds, setFeaturedSongIds] = useState<string[]>(() => {
    return [];
  });


  const updateProfile = (data: Partial<ComposerProfile>) => {
    setProfile(prev => { const next={...prev,...data}; if(userId) void saveProfile(userId,next).catch(e=>setAuthError(e.message)); return next; });
  };

  const addSong = (songData: Omit<Song, 'id' | 'playCount' | 'interestedCount' | 'dateRegistered'>): Song => {
    const newSong: Song = {
      ...songData,
      id: crypto.randomUUID(),
      playCount: 0,
      interestedCount: 0,
      dateRegistered: new Date().toISOString().split('T')[0]
    };
    setSongs(prev => [newSong, ...prev]);
    if (userId) void insertSong(userId,newSong).catch(e=>setAuthError(e.message));

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

  const updateSong = (id: string, data: Partial<Song>) => {
    setSongs(prev => prev.map(song => song.id === id ? { ...song, ...data } : song));
    void saveSong(id,data).catch(e=>setAuthError(e.message));
  };

  const deleteSong = (id: string) => {
    const target = songs.find(s => s.id === id);
    setSongs(prev => prev.filter(song => song.id !== id));
    void removeSong(id).catch(e=>setAuthError(e.message));
    if (target) {
      addSystemLog({
        category: 'moderation',
        title: 'Música Removida do Acervo',
        description: `Música "${target.title}" foi excluída pelo compositor.`,
        user: profile.email,
        ip: '177.89.21.4',
        status: 'warning'
      });
    }
  };

  const incrementPlayCount = (songId: string) => {
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, playCount: s.playCount + 1 } : s));
    void incrementPlay(songId).catch(()=>undefined);
  };

  const addInterestRequest = (reqData: Omit<InterestRequest, 'id' | 'createdAt' | 'status'>): InterestRequest => {
    const newReq: InterestRequest = {
      ...reqData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString().split('T')[0],
      status: 'nova'
    };
    
    setRequests(prev => [newReq, ...prev]);
    setSongs(prev => prev.map(s => s.id === reqData.songId ? { ...s, interestedCount: s.interestedCount + 1 } : s));
    void createInterest(reqData.songId,reqData).catch(e=>setAuthError(e.message));

    addSystemLog({
      category: 'financial',
      title: 'Nova Proposta de Artista Recebida',
      description: `Proposta de ${reqData.buyerName} para a música "${reqData.songTitle}".`,
      user: reqData.buyerEmail,
      ip: '189.45.10.88',
      status: 'info'
    });
    
    return newReq;
  };

  const updateRequestStatus = (requestId: string, status: RequestStatus, extra?: Partial<InterestRequest>) => {
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
    void saveRequest(requestId,status,extra).catch(e=>setAuthError(e.message));
  };

  const issueRelease = (
    requestId: string, 
    releaseData: Omit<ReleaseDocument, 'id' | 'documentCode' | 'isDemonstrative'>
  ): ReleaseDocument => {
    const codeNumber = Math.floor(10000 + Math.random() * 90000);
    const newDoc: ReleaseDocument = {
      ...releaseData,
      id: crypto.randomUUID(),
      documentCode: `LIB-2026-${codeNumber}`,
      isDemonstrative: false
    };

    setReleases(prev => [newDoc, ...prev]);
    if(userId) void insertRelease(userId,newDoc).catch(e=>setAuthError(e.message));
    updateRequestStatus(requestId, 'liberacao_enviada', { releaseId: newDoc.id });

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

  const updateSubscriptionPlan = (planName: string, monthlyPrice: string) => {
    setSubscription(prev => {const next={...prev,planName,monthlyPrice};void saveSubscription(next).catch(e=>setAuthError(e.message));return next;});
  };

  const updateSubscriptionPaymentMethod = (method: 'Cartão de Crédito' | 'Pix', cardLast4?: string) => {
    setSubscription(prev => {const next={...prev,paymentMethod:method,cardLast4:cardLast4||prev.cardLast4};void saveSubscription(next).catch(e=>setAuthError(e.message));return next;});
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

  const updateAdminComposerStatus = (composerId: string, status: SubscriptionStatus) => {
    setAdminComposers(prev => prev.map(c => {
      if (c.id === composerId) {
        return { ...c, subscriptionStatus: status };
      }
      return c;
    }));
    void adminSetSubscription(composerId,status).catch(e=>setAuthError(e.message));

    addSystemLog({
      category: 'financial',
      title: 'Status de Assinatura Modificado',
      description: `Status do compositor #${composerId} alterado para "${status}" pelo administrador.`,
      user: 'Admin Master',
      ip: '201.55.190.8',
      status: 'warning'
    });
  };

  const toggleComposerVerified = (composerId: string) => {
    const target=adminComposers.find(c=>c.id===composerId);
    setAdminComposers(prev => prev.map(c => {
      if (c.id === composerId) {
        return { ...c, isVerified: !c.isVerified };
      }
      return c;
    }));
    if(target)void adminSetVerified(composerId,!target.isVerified).catch(e=>setAuthError(e.message));
  };

  const deleteAdminComposer = (composerId: string) => {
    setAuthError('Exclusão de contas exige uma função de servidor com a API administrativa do Supabase.');
  };

  const addAdminComposer = (_composerData: Omit<AdminComposer, 'id' | 'registeredAt' | 'songCount' | 'totalPlays' | 'totalReleases' | 'revenueGenerated'>) => {
    setAuthError('Crie novas contas pelo fluxo de cadastro para preservar confirmação de e-mail e senha segura.');
  };

  const updatePlatformSettings = (settings: Partial<PlatformSettings>) => {
    setPlatformSettings(prev => {const next={...prev,...settings};void savePlatformSettings(next).catch(e=>setAuthError(e.message));return next;});
    addSystemLog({
      category: 'system',
      title: 'Configurações da Plataforma Atualizadas',
      description: 'Parâmetros comerciais ou institucionais foram salvos com sucesso.',
      user: 'Admin Master',
      ip: '201.55.190.8',
      status: 'info'
    });
  };

  const resetPlatformSettings = () => {
    setPlatformSettings(DEFAULT_PLATFORM_SETTINGS);
    void savePlatformSettings(DEFAULT_PLATFORM_SETTINGS).catch(e=>setAuthError(e.message));
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

  const clearSystemLogs = () => {
    setSystemLogs([]);
    void deleteSystemLogs().catch(e=>setAuthError(e.message));
  };

  const toggleFeatureSong = (songId: string) => {
    const nextValue=!featuredSongIds.includes(songId);
    setFeaturedSongIds(prev => 
      prev.includes(songId) 
        ? prev.filter(id => id !== songId) 
        : [...prev, songId]
    );
    void adminFeatureSong(songId,nextValue).catch(e=>setAuthError(e.message));
  };

  return (
    <AppContext.Provider value={{
      profile,
      updateProfile,
      songs,
      addSong,
      updateSong,
      deleteSong,
      incrementPlayCount,
      requests,
      addInterestRequest,
      updateRequestStatus,
      releases,
      issueRelease,
      subscription,
      updateSubscriptionPlan,
      updateSubscriptionPaymentMethod,
      isAuthenticated,
      authLoading,
      authError,
      login,
      register,
      resetPassword,
      resendConfirmation,
      updatePassword,
      logout,
      
      // ADMIN
      isAdminAuthenticated,
      adminLogin,
      adminLogout,
      adminComposers,
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
