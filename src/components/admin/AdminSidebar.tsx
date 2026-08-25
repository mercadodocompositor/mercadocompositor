import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { APP_CONFIG } from '../../config/appConfig';
import { 
  LayoutDashboard, 
  Users, 
  Music, 
  FileCheck2, 
  Settings, 
  Activity, 
  ShieldCheck, 
  ArrowLeft, 
  LogOut,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface AdminSidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile
}) => {
  const navigate = useNavigate();
  const { adminComposers, songs, requests, adminLogout } = useApp();

  const navItems = [
    {
      id: 'overview',
      label: 'Visão Geral Executiva',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'compositores',
      label: 'Compositores & Planos',
      icon: Users,
      badge: adminComposers.length.toString()
    },
    {
      id: 'musicas',
      label: 'Acervo & Moderação',
      icon: Music,
      badge: songs.length.toString()
    },
    {
      id: 'transacoes',
      label: 'Propostas & Liberações',
      icon: FileCheck2,
      badge: requests.length.toString()
    },
    {
      id: 'configuracoes',
      label: 'Configurações SaaS',
      icon: Settings,
      badge: null
    },
    {
      id: 'logs',
      label: 'Logs de Auditoria',
      icon: Activity,
      badge: null
    }
  ];

  const handleTabClick = (tabId: string) => {
    onSelectTab(tabId);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-72 bg-slate-950 border-r border-slate-800 flex flex-col justify-between transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:z-auto
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Top brand */}
        <div>
          <div className="p-6 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center">
                <img src="/logo.webp" alt="Mercado do Compositor" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-bold text-base tracking-tight">Master Admin</span>
                  <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                    DONO
                  </span>
                </div>
                <p className="text-slate-400 text-xs truncate">{APP_CONFIG.name}</p>
              </div>
            </div>
          </div>

          {/* Nav List */}
          <div className="px-3 py-6 space-y-1.5">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Gestão da Plataforma
            </div>

            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-slate-800/80 space-y-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-amber-400 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
          >
            <div className="flex items-center gap-2.5">
              <ArrowLeft className="w-4 h-4" />
              <span>Painel do Compositor</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Ir para Página Inicial</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </button>

          <div className="pt-2">
            <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
                OA
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">Owner Admin</p>
                <p className="text-[10px] text-slate-400 truncate">admin@mercadodocompositor.com.br</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { adminLogout(); navigate('/autenticacao?modo=admin'); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair do Painel Administrativo</span>
          </button>
        </div>
      </aside>
    </>
  );
};
