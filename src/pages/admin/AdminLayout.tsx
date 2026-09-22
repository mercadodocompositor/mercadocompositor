import React, { Suspense, lazy, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AdminSidebar } from '../../components/admin/AdminSidebar';
import { AdminToastProvider } from '../../components/admin/AdminToast';
import { ThemeToggle } from '../../components/common/ThemeToggle';
import { useApp } from '../../context/AppContext';

const AdminOverviewTab = lazy(() => import('./AdminOverviewTab').then(m => ({ default: m.AdminOverviewTab })));
const AdminComposersTab = lazy(() => import('./AdminComposersTab').then(m => ({ default: m.AdminComposersTab })));
const AdminSongsTab = lazy(() => import('./AdminSongsTab').then(m => ({ default: m.AdminSongsTab })));
const AdminTransactionsTab = lazy(() => import('./AdminTransactionsTab').then(m => ({ default: m.AdminTransactionsTab })));
const AdminSettingsTab = lazy(() => import('./AdminSettingsTab').then(m => ({ default: m.AdminSettingsTab })));
const AdminLogsTab = lazy(() => import('./AdminLogsTab').then(m => ({ default: m.AdminLogsTab })));

const preloadAdminTabs = () => {
  import('./AdminOverviewTab');
  import('./AdminComposersTab');
  import('./AdminSongsTab');
  import('./AdminTransactionsTab');
  import('./AdminSettingsTab');
  import('./AdminLogsTab');
};

const AdminTabSkeleton = () => (
  <div className="space-y-6 skeleton-delayed" role="status" aria-label="Carregando painel administrativo">
    <div className="h-10 w-72 bg-slate-800/60 rounded-2xl animate-pulse" />
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
      <div className="h-24 bg-slate-900/60 border border-slate-800 rounded-3xl animate-pulse" />
      <div className="h-24 bg-slate-900/60 border border-slate-800 rounded-3xl animate-pulse" />
      <div className="h-24 bg-slate-900/60 border border-slate-800 rounded-3xl animate-pulse" />
      <div className="h-24 bg-slate-900/60 border border-slate-800 rounded-3xl animate-pulse" />
    </div>
    <div className="h-96 bg-slate-900/60 border border-slate-800 rounded-3xl animate-pulse" />
  </div>
);
import { 
  Menu, 
  ShieldCheck, 
  Bell, 
  ExternalLink, 
  Lock, 
  Search, 
  LogOut,
  Sparkles,
  ArrowLeft
} from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdminAuthenticated, adminRole } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(preloadAdminTabs, 100);
    return () => clearTimeout(timer);
  }, []);

  const TAB_ROLES: Record<string, Array<'master' | 'moderator' | 'financial'>> = {
    overview: ['master', 'moderator', 'financial'],
    musicas: ['master', 'moderator'],
    compositores: ['master', 'financial'],
    transacoes: ['master', 'financial'],
    configuracoes: ['master'],
    logs: ['master', 'financial']
  };

  const validTabs = ['overview', 'compositores', 'musicas', 'transacoes', 'configuracoes', 'logs'];
  // Tab mapping from path or internal state
  const getCurrentTab = () => {
    const path = location.pathname.replace('/admin', '').replace('/', '');
    if (!path || path === '' || !validTabs.includes(path)) return 'overview';
    return path;
  };

  const currentTab = getCurrentTab();
  const isTabAllowed = (TAB_ROLES[currentTab] || ['master']).includes(adminRole);

  const handleSelectTab = (tabId: string) => {
    if (tabId === 'overview') {
      navigate('/admin');
    } else {
      navigate(`/admin/${tabId}`);
    }
  };

  // If not admin authenticated in strict mode (toggleable)
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0A1128] text-white flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Acesso Master / Dono</h2>
            <p className="text-slate-400 text-xs mt-1">
              Esta área é restrita aos proprietários e administradores do Mercado do Compositor.
            </p>
          </div>

          <button
            onClick={() => navigate('/autenticacao?modo=admin')}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition"
          >
            Ir para Autenticação Administrativa
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 mx-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Painel do Compositor</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminToastProvider>
      <div className="min-h-screen bg-[#0A1128] text-slate-100 flex">
        {/* Admin Sidebar */}
        <AdminSidebar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Admin Top Header */}
          <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
                aria-label="Abrir Menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-400 hidden sm:inline">Mercado do Compositor</span>
                <span className="text-slate-400 hidden sm:inline">/</span>
                <span className="text-xs font-semibold text-white capitalize">
                  {currentTab === 'overview' ? 'Visão Geral Executiva' : currentTab}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-[11px]">Painel Master Administrativo</span>
              </div>

              <ThemeToggle />

              <button
                onClick={() => navigate('/dashboard')}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <span>Ver App do Compositor</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </header>

          {/* Content Tabs */}
          <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto flex-1">
            {!isTabAllowed ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4 my-12 shadow-2xl">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                  <Lock className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-white">Acesso Restrito ao Perfil</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Seu perfil de equipe atual (<strong className="text-amber-400 uppercase">{adminRole}</strong>) não possui permissão para acessar a área <strong className="text-white capitalize">{currentTab}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => handleSelectTab('overview')}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-amber-500/20"
                >
                  Voltar à Visão Geral
                </button>
              </div>
            ) : (
              <Suspense fallback={<AdminTabSkeleton />}>
                <div key={currentTab} className="tab-content-enter">
                  {currentTab === 'overview' && <AdminOverviewTab onNavigateTab={handleSelectTab} />}
                  {currentTab === 'compositores' && <AdminComposersTab />}
                  {currentTab === 'musicas' && <AdminSongsTab />}
                  {currentTab === 'transacoes' && <AdminTransactionsTab />}
                  {currentTab === 'configuracoes' && <AdminSettingsTab />}
                  {currentTab === 'logs' && <AdminLogsTab />}
                </div>
              </Suspense>
            )}
          </main>
        </div>
      </div>
    </AdminToastProvider>
  );
};
