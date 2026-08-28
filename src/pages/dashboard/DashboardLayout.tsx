import React from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { OverviewTab } from './OverviewTab';
import { MySongsTab } from './MySongsTab';
import { AddSongTab } from './AddSongTab';
import { RequestsTab } from './RequestsTab';
import { ReleasesTab } from './ReleasesTab';
import { ProfileTab } from './ProfileTab';
import { SubscriptionTab } from './SubscriptionTab';
import { SettingsTab } from './SettingsTab';
import { APP_CONFIG } from '../../config/appConfig';
import { 
  LayoutDashboard, 
  Music2, 
  PlusCircle, 
  MessageSquare, 
  FileCheck, 
  User, 
  CreditCard, 
  Settings, 
  LogOut, 
  ExternalLink, 
  Menu, 
  X, 
  Sparkles
} from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, songs, logout, subscription, isAdminAuthenticated } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const currentPlan = APP_CONFIG.plans.find(plan => plan.name === subscription.planName) || APP_CONFIG.plans[0];
  const songUsagePercent = currentPlan.maxSongs ? Math.min(100, (songs.length / currentPlan.maxSongs) * 100) : 100;
  const publicProfilePath = `/compositor/${profile.username}`;

  const menuItems = [
    { path: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { path: '/dashboard/musicas', label: 'Minhas Músicas', icon: Music2 },
    { path: '/dashboard/musicas/nova', label: 'Adicionar Música', icon: PlusCircle },
    { path: '/dashboard/solicitacoes', label: 'Solicitações', icon: MessageSquare },
    { path: '/dashboard/liberacoes', label: 'Liberações', icon: FileCheck },
    { path: '/dashboard/perfil', label: 'Meu Perfil', icon: User },
    { path: '/dashboard/assinatura', label: 'Assinatura', icon: CreditCard },
    { path: '/dashboard/configuracoes', label: 'Configurações', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isMenuItemActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === path;
    if (path === '/dashboard/musicas') {
      return location.pathname.startsWith(path) && location.pathname !== '/dashboard/musicas/nova';
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 flex flex-col font-sans selection:bg-amber-500 selection:text-white">
      
      {/* Top Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition">
                <img src="/logo.webp" alt="Mercado do Compositor" className="w-full h-full object-contain" />
              </div>
              <div>
                <span className="text-amber-600 font-serif text-xl italic tracking-tighter block leading-none">
                  Mercado do
                </span>
                <span className="text-[#0A1128] font-serif text-xl font-bold tracking-tight block leading-none">
                  Compositor
                </span>
              </div>
            </Link>

            <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-widest text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              Painel Editorial
            </span>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-4">
            
            {/* Quick Add Song CTA */}
            <Link
              to="/dashboard/musicas/nova"
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-lg shadow-amber-500/20 transition transform hover:-translate-y-0.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nova Música</span>
            </Link>

            {/* View Public Profile Link */}
            <Link
              to={publicProfilePath}
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
            >
              <span>Perfil Público</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            {/* Profile Avatar */}
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
              <div className="relative">
                <img 
                  src={profile.photo} 
                  alt={profile.stageName} 
                  className="w-10 h-10 rounded-full object-cover border-2 border-amber-400 shadow-sm"
                />
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
              </div>
              <div className="hidden md:block text-left">
                <span className="text-xs font-bold text-slate-900 block leading-none">{profile.stageName}</span>
                <span className={`text-[10px] font-medium capitalize ${
                  subscription.status === 'active' ? 'text-amber-600' : 'text-red-500'
                }`}>
                  Plano {subscription.status === 'active' ? 'Ativo' : 'Suspenso'}
                </span>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
              aria-expanded={mobileMenuOpen}
              aria-controls="dashboard-mobile-menu"
              className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-slate-100 border border-slate-200"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

          </div>

        </div>
      </header>

      {/* Main Container with Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* DESKTOP SIDEBAR MENU - Editorial Navy Theme */}
        <aside className="hidden md:block md:col-span-3 space-y-6">
          <div className="bg-[#0A1128] text-white rounded-3xl p-5 shadow-xl border border-amber-500/20 sticky top-28 space-y-4">
            
            <div className="px-3 pt-2 text-[10px] uppercase font-bold text-slate-400 tracking-widest">
              Navegação
            </div>

            <nav className="space-y-1">
              {menuItems.map(item => {
                const Icon = item.icon;
                const isActive = isMenuItemActive(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition-all ${
                      isActive 
                        ? 'bg-amber-500/15 text-amber-400 border-l-4 border-amber-500 font-bold' 
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-amber-500' : 'bg-slate-600'}`} />
                    <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Editorial Plan Summary Block */}
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Plano Atual</p>
               <p className="text-white font-serif font-bold text-sm">{currentPlan.name}</p>
               <p className="text-amber-400 text-xs font-semibold">
                 R$ {currentPlan.priceMonthly}/mês
               </p>
               <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${songUsagePercent}%` }} />
               </div>
              <p className="text-[11px] text-slate-400 pt-1">
                {currentPlan.maxSongs ? `${songs.length} / ${currentPlan.maxSongs} músicas no catálogo` : `${songs.length} músicas • uso ilimitado`}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              {isAdminAuthenticated && (
                <Link
                  to="/admin"
                  className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-xs font-bold text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Painel do Dono (Admin)</span>
                </Link>
              )}

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da Conta</span>
              </button>
            </div>

          </div>
        </aside>

        {/* MOBILE MENU DROPDOWN */}
        {mobileMenuOpen && (
          <div id="dashboard-mobile-menu" className="md:hidden bg-[#0A1128] text-white border border-amber-500/20 rounded-3xl p-4 space-y-2 shadow-2xl">
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = isMenuItemActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition ${
                    isActive ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-red-400 hover:bg-red-500/10 rounded-xl"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da Conta</span>
            </button>
          </div>
        )}

        {/* MAIN DASHBOARD CONTENT ROUTE VIEW */}
        <main className="md:col-span-9 pb-24 md:pb-12">
          <Routes>
            <Route path="/" element={<OverviewTab />} />
            <Route path="/musicas" element={<MySongsTab />} />
            <Route path="/musicas/nova" element={<AddSongTab />} />
            <Route path="/musicas/:songId/editar" element={<AddSongTab />} />
            <Route path="/solicitacoes" element={<RequestsTab />} />
            <Route path="/solicitacoes/:requestId" element={<RequestsTab />} />
            <Route path="/liberacoes" element={<ReleasesTab />} />
            <Route path="/perfil" element={<ProfileTab />} />
            <Route path="/assinatura" element={<SubscriptionTab />} />
            <Route path="/configuracoes" element={<SettingsTab />} />
          </Routes>
        </main>

      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR required by Section 6 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-2 flex items-center justify-around">
        {[
          { path: '/dashboard', label: 'Início', icon: LayoutDashboard },
          { path: '/dashboard/musicas', label: 'Músicas', icon: Music2 },
          { path: '/dashboard/solicitacoes', label: 'Pedidos', icon: MessageSquare },
          { path: '/dashboard/liberacoes', label: 'Termos', icon: FileCheck },
          { path: '/dashboard/perfil', label: 'Perfil', icon: User },
        ].map(nav => {
          const Icon = nav.icon;
          const isActive = nav.path === '/dashboard'
            ? location.pathname === nav.path
            : location.pathname === nav.path || location.pathname.startsWith(`${nav.path}/`);
          return (
            <Link
              key={nav.path}
              to={nav.path}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-bold transition ${
                isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{nav.label}</span>
            </Link>
          );
        })}
      </nav>

    </div>
  );
};
