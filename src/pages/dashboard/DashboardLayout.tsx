import React, { Suspense, lazy } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { DashboardErrorBoundary } from '../../components/dashboard/DashboardErrorBoundary';
import { SUBSCRIPTION_STATUS_META } from '../../lib/subscriptionStatus';
import { formatMoneyBR, resolvePlan } from '../../lib/plans';
import { ThemeToggle } from '../../components/common/ThemeToggle';

const OverviewTab = lazy(() => import('./OverviewTab').then(m => ({ default: m.OverviewTab })));
const MySongsTab = lazy(() => import('./MySongsTab').then(m => ({ default: m.MySongsTab })));
const AddSongTab = lazy(() => import('./AddSongTab').then(m => ({ default: m.AddSongTab })));
const RequestsTab = lazy(() => import('./RequestsTab').then(m => ({ default: m.RequestsTab })));
const ReleasesTab = lazy(() => import('./ReleasesTab').then(m => ({ default: m.ReleasesTab })));
const ProfileTab = lazy(() => import('./ProfileTab').then(m => ({ default: m.ProfileTab })));
const SubscriptionTab = lazy(() => import('./SubscriptionTab').then(m => ({ default: m.SubscriptionTab })));
const SettingsTab = lazy(() => import('./SettingsTab').then(m => ({ default: m.SettingsTab })));

const TAB_PRELOADERS: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('./OverviewTab'),
  '/dashboard/musicas': () => import('./MySongsTab'),
  '/dashboard/musicas/nova': () => import('./AddSongTab'),
  '/dashboard/solicitacoes': () => import('./RequestsTab'),
  '/dashboard/liberacoes': () => import('./ReleasesTab'),
  '/dashboard/perfil': () => import('./ProfileTab'),
  '/dashboard/assinatura': () => import('./SubscriptionTab'),
  '/dashboard/configuracoes': () => import('./SettingsTab'),
};

const preloadTab = (path: string) => {
  TAB_PRELOADERS[path]?.();
};

const preloadAllDashboardTabs = () => {
  Object.values(TAB_PRELOADERS).forEach(preload => preload());
};

const TabLoadingSkeleton = () => (
  <div className="space-y-6 skeleton-delayed" role="status" aria-label="Carregando seção">
    {/* Subtle animated top shimmer */}
    <div className="h-1 w-full bg-slate-200/80 dark:bg-slate-800/80 rounded-full overflow-hidden">
      <div className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 w-1/3 animate-[shimmer_1.2s_infinite]" />
    </div>

    {/* Section Header skeleton */}
    <div className="h-9 w-64 bg-slate-200/80 dark:bg-slate-800/60 rounded-2xl animate-pulse" />

    {/* Top metric cards skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="h-28 bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3 animate-pulse shadow-sm">
        <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg" />
      </div>
      <div className="h-28 bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3 animate-pulse shadow-sm">
        <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg" />
      </div>
      <div className="h-28 bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-3 animate-pulse shadow-sm">
        <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg" />
      </div>
    </div>

    {/* Main content card skeleton */}
    <div className="h-80 bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 animate-pulse shadow-sm">
      <div className="h-5 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
      <div className="space-y-3 pt-2">
        <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
        <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
        <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
      </div>
    </div>
  </div>
);
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
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Bell,
  CheckCheck
} from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    profile, songs, logout, subscription, isAdminAuthenticated, authError, clearAuthError,
    notifications, unreadNotificationCount, markNotificationRead, markAllNotificationsRead,
    subscriptionPlans
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isNotifOpen, setIsNotifOpen] = React.useState(false);
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  React.useEffect(() => setAvatarFailed(false), [profile.photo]);
  const notifRef = React.useRef<HTMLDivElement>(null);
  const notifButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    if (isNotifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setIsNotifOpen(false);
          notifButtonRef.current?.focus();
        }
      };
      document.addEventListener('keydown', closeOnEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', closeOnEscape);
      };
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotifOpen]);
  const mobileMenuRef = React.useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = React.useRef<HTMLButtonElement>(null);
  const currentPlan = resolvePlan(subscriptionPlans, subscription.planName);
  const songUsagePercent = currentPlan.maxSongs ? Math.min(100, (songs.length / currentPlan.maxSongs) * 100) : 100;
  const publicProfilePath = `/compositor/${profile.username}`;
  const subscriptionMeta = SUBSCRIPTION_STATUS_META[subscription.status];

  const menuItems = [
    { path: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { path: '/dashboard/musicas/nova', label: 'Adicionar Música', icon: PlusCircle },
    { path: '/dashboard/musicas', label: 'Minhas Músicas', icon: Music2 },
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
    const timer = setTimeout(preloadAllDashboardTabs, 100);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = Array.from(mobileMenuRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || []) as HTMLElement[];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    const firstFocusable = mobileMenuRef.current?.querySelector<HTMLElement>('a, button');
    firstFocusable?.focus();
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
      mobileMenuButtonRef.current?.focus();
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#F1F5F9] dark:bg-[#070D1B] text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-white transition-colors duration-200">
      <a href="#dashboard-main" className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition-transform focus:translate-y-0">Pular para o conteúdo</a>

      {/* Top Navigation Header */}
      <header className="bg-white dark:bg-[#0A1128] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">

          {/* Logo & Brand */}
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition">
                <img src="/logo.webp" alt="Mercado do Compositor" className="w-full h-full object-contain" />
              </div>
              <div>
                <span className="text-amber-600 dark:text-amber-400 font-serif text-xl italic tracking-tighter block leading-none">
                  Mercado do
                </span>
                <span className="text-[#0A1128] dark:text-white font-serif text-xl font-bold tracking-tight block leading-none">
                  Compositor
                </span>
              </div>
            </Link>

            <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-widest text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-500/20">
              Painel Editorial
            </span>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3 sm:gap-4">

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
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition"
            >
              <span>Perfil Público</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                ref={notifButtonRef}
                type="button"
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                aria-label={`Notificações: ${unreadNotificationCount} não lidas`}
                aria-expanded={isNotifOpen}
                aria-controls="dashboard-notifications"
                aria-haspopup="dialog"
                className="relative p-2 rounded-full text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[9px] flex items-center justify-center animate-pulse">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {isNotifOpen && (
                <div id="dashboard-notifications" role="dialog" aria-label="Central de notificações" className="absolute right-0 sm:-right-12 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-scaleUp text-slate-800 dark:text-slate-200">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <strong className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Notificações</strong>
                      {unreadNotificationCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold">
                          {unreadNotificationCount} nova{unreadNotificationCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {unreadNotificationCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllNotificationsRead()}
                        className="text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 font-semibold flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Marcar lidas</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                        Nenhuma notificação por enquanto.
                      </div>
                    ) : (
                      notifications.map(n => (
                        <button
                          type="button"
                          key={n.id}
                          onClick={() => {
                            if (!n.read) markNotificationRead(n.id);
                            if (n.link) {
                              setIsNotifOpen(false);
                              navigate(n.link);
                            }
                          }}
                          className={`w-full p-4 flex items-start gap-3 text-left transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 ${
                            !n.read ? 'bg-amber-50/40 dark:bg-amber-500/10' : ''
                          }`}
                        >
                          <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${!n.read ? 'bg-amber-500' : 'bg-transparent'}`} />
                          <div className="flex-1 space-y-1">
                            <strong className={`block text-xs leading-snug ${!n.read ? 'text-slate-950 dark:text-white font-bold' : 'text-slate-700 dark:text-slate-300 font-semibold'}`}>
                              {n.title}
                            </strong>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                              {n.message}
                            </p>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block pt-0.5">
                              {new Date(n.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar */}
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800">
              <div className="relative">
                {profile.photo && !avatarFailed ? (
                  <img
                    src={profile.photo}
                    alt={profile.stageName}
                    onError={() => setAvatarFailed(true)}
                    className="w-10 h-10 rounded-full object-cover border-2 border-amber-400 shadow-sm"
                  />
                ) : (
                  // Sem foto (ou com URL quebrada) o navegador exibia o texto alternativo cortado.
                  <div role="img" aria-label={profile.stageName} className="flex w-10 h-10 items-center justify-center rounded-full border-2 border-amber-400 bg-slate-900 text-xs font-bold text-amber-400 shadow-sm">
                    {(profile.stageName || profile.name || 'MC').split(/\s+/).map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
              </div>
              <div className="hidden md:block text-left">
                <span className="text-xs font-bold text-slate-900 dark:text-white block leading-none">{profile.stageName}</span>
                <span className={`text-[10px] font-medium ${subscriptionMeta.textClass}`}>
                  {subscriptionMeta.shortLabel}
                </span>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              ref={mobileMenuButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
              aria-expanded={mobileMenuOpen}
              aria-controls="dashboard-mobile-menu"
              className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
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

            <nav aria-label="Navegação do dashboard" className="space-y-1">
              {menuItems.map(item => {
                const Icon = item.icon;
                const isActive = isMenuItemActive(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onMouseEnter={() => preloadTab(item.path)}
                    onTouchStart={() => preloadTab(item.path)}
                    aria-current={isActive ? 'page' : undefined}
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
            {subscription.status === 'pending' ? (
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-amber-500/30 space-y-2">
              <p className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">Sem assinatura ativa</p>
              <p className="text-[11px] leading-relaxed text-slate-300">Escolha um plano e comece com 7 dias grátis para publicar suas músicas.</p>
              <Link to="/dashboard/assinatura" className="mt-1 inline-flex w-full justify-center rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">Ver planos</Link>
            </div>
            ) : (
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{subscription.status === 'active' ? 'Plano atual' : 'Plano contratado'}</p>
               <p className="text-white font-serif font-bold text-sm">{currentPlan.name}</p>
               <p className="text-amber-400 text-xs font-semibold">
                 R$ {formatMoneyBR(currentPlan.monthlyPrice)}/mês
               </p>
               <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${songUsagePercent}%` }} />
               </div>
              <p className="text-[11px] text-slate-400 pt-1">
                {currentPlan.maxSongs ? `${songs.length} / ${currentPlan.maxSongs} músicas no catálogo` : `${songs.length} músicas • uso ilimitado`}
              </p>
            </div>
            )}

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
          <div className="fixed inset-0 z-50 bg-slate-950/70 p-4 backdrop-blur-sm md:hidden" onMouseDown={event => { if (event.target === event.currentTarget) setMobileMenuOpen(false); }}>
          <div ref={mobileMenuRef} id="dashboard-mobile-menu" role="dialog" aria-modal="true" aria-label="Navegação do dashboard" className="ml-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-amber-500/20 bg-[#0A1128] p-4 text-white shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3"><span className="text-sm font-bold">Menu</span><button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
            <div className="mb-3 py-2 px-1 flex items-center justify-between border-b border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Tema da interface</span>
              <ThemeToggle variant="segmented" />
            </div>
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = isMenuItemActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  onTouchStart={() => preloadTab(item.path)}
                  onMouseEnter={() => preloadTab(item.path)}
                  aria-current={isActive ? 'page' : undefined}
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
          </div>
        )}

        {/* MAIN DASHBOARD CONTENT ROUTE VIEW */}
        <main id="dashboard-main" tabIndex={-1} className="dashboard-safe-bottom min-w-0 md:col-span-9 md:pb-12">
          {authError && (
            <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              <p className="flex-1"><strong>Não foi possível concluir a operação.</strong> {authError}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
                </button>
                <button type="button" onClick={clearAuthError} className="min-h-11 rounded-xl px-4 py-2 text-xs font-bold text-red-800 hover:bg-red-100">Fechar</button>
              </div>
            </div>
          )}
          <DashboardErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<TabLoadingSkeleton />}>
              <div key={location.pathname} className="tab-content-enter">
                <Routes>
                  <Route path="/" element={<OverviewTab />} />
                  <Route path="/musicas" element={<MySongsTab />} />
                  <Route path="/musicas/nova" element={<AddSongTab />} />
                  <Route path="/musicas/:songId/editar" element={<AddSongTab />} />
                  <Route path="/adicionar-musica" element={<AddSongTab />} />
                  <Route path="/musicas/adicionar" element={<AddSongTab />} />
                  <Route path="/solicitacoes" element={<RequestsTab />} />
                  <Route path="/solicitacoes/:requestId" element={<RequestsTab />} />
                  <Route path="/liberacoes" element={<ReleasesTab />} />
                  <Route path="/perfil" element={<ProfileTab />} />
                  <Route path="/assinatura" element={<SubscriptionTab />} />
                  <Route path="/configuracoes" element={<SettingsTab />} />
                </Routes>
              </div>
            </Suspense>
          </DashboardErrorBoundary>
        </main>

      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR required by Section 6 */}
      <nav aria-label="Navegação principal do dashboard" className="dashboard-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 pt-2 flex items-center justify-around">
        {[
          { path: '/dashboard', label: 'Início', icon: LayoutDashboard, featured: false },
          { path: '/dashboard/musicas', label: 'Músicas', icon: Music2, featured: false },
          { path: '/dashboard/musicas/nova', label: 'Nova', icon: PlusCircle, featured: true },
          { path: '/dashboard/solicitacoes', label: 'Pedidos', icon: MessageSquare, featured: false },
          { path: '/dashboard/perfil', label: 'Conta', icon: User, featured: false },
        ].map(nav => {
          const Icon = nav.icon;
          const isActive = nav.path === '/dashboard'
            ? location.pathname === nav.path
            : nav.path === '/dashboard/musicas'
              ? location.pathname.startsWith(nav.path) && location.pathname !== '/dashboard/musicas/nova'
            : location.pathname === nav.path || location.pathname.startsWith(`${nav.path}/`);
          return (
            <Link
              key={nav.path}
              to={nav.path}
              onMouseEnter={() => preloadTab(nav.path)}
              onTouchStart={() => preloadTab(nav.path)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={nav.featured ? 'Cadastrar nova música' : undefined}
              className={`flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition ${
                nav.featured
                  ? '-mt-7 text-amber-300'
                  : isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className={nav.featured ? `flex h-12 w-12 items-center justify-center rounded-full border-4 border-slate-900 shadow-lg ${isActive ? 'bg-amber-300 text-slate-950' : 'bg-amber-500 text-slate-950'}` : ''}>
                <Icon className={nav.featured ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
              </span>
              <span>{nav.label}</span>
            </Link>
          );
        })}
      </nav>

    </div>
  );
};
