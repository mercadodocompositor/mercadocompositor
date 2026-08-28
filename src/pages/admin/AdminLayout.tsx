import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AdminSidebar } from '../../components/admin/AdminSidebar';
import { AdminOverviewTab } from './AdminOverviewTab';
import { AdminComposersTab } from './AdminComposersTab';
import { AdminSongsTab } from './AdminSongsTab';
import { AdminTransactionsTab } from './AdminTransactionsTab';
import { AdminSettingsTab } from './AdminSettingsTab';
import { AdminLogsTab } from './AdminLogsTab';
import { useApp } from '../../context/AppContext';
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
  const { isAdminAuthenticated } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Tab mapping from path or internal state
  const getCurrentTab = () => {
    const path = location.pathname.replace('/admin', '').replace('/', '');
    if (!path || path === '') return 'overview';
    return path;
  };

  const currentTab = getCurrentTab();

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
          {currentTab === 'overview' && <AdminOverviewTab onNavigateTab={handleSelectTab} />}
          {currentTab === 'compositores' && <AdminComposersTab />}
          {currentTab === 'musicas' && <AdminSongsTab />}
          {currentTab === 'transacoes' && <AdminTransactionsTab />}
          {currentTab === 'configuracoes' && <AdminSettingsTab />}
          {currentTab === 'logs' && <AdminLogsTab />}
        </main>
      </div>
    </div>
  );
};
