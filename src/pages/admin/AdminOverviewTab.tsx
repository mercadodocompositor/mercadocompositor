import React from 'react';
import { useApp } from '../../context/AppContext';
import { 
  DollarSign, 
  Users, 
  Music, 
  FileCheck2, 
  TrendingUp, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight,
  Sparkles,
  ExternalLink,
  PlusCircle,
  Settings,
  Activity
} from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';

interface AdminOverviewTabProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({ onNavigateTab }) => {
  const { 
    adminComposers, 
    songs, 
    requests, 
    releases, 
    platformSettings, 
    systemLogs 
  } = useApp();

  // Metrics Calculations
  const activeComposers = adminComposers.filter(c => c.subscriptionStatus === 'active');
  const pendingComposers = adminComposers.filter(c => c.subscriptionStatus === 'pending');
  const suspendedComposers = adminComposers.filter(c => c.subscriptionStatus === 'suspended');

  const mrr = activeComposers.reduce((acc, c) => acc + c.monthlyValue, 0);
  const arr = mrr * 12;

  const totalSongs = adminComposers.reduce((acc, c) => acc + c.songCount, 0);
  const totalPlays = adminComposers.reduce((acc, c) => acc + c.totalPlays, 0);

  const totalDealsValue = adminComposers.reduce((acc, c) => acc + c.revenueGenerated, 0);

  const totalReleasesCount = adminComposers.reduce((acc, c) => acc + c.totalReleases, 0);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-amber-500/20 p-6 md:p-8 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Painel Executivo do Dono
              </span>
              <span className="text-slate-400 text-xs">• Visão Geral da Plataforma SaaS</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Controle Geral do Mercado do Compositor
            </h1>
            <p className="text-slate-400 text-sm max-w-2xl">
              Consulte os dados consolidados de receita, assinantes, catálogo e liberações.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigateTab('configuracoes')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span>Ajustar Planos & SaaS</span>
            </button>
            <button
              onClick={() => onNavigateTab('compositores')}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
            >
              <Users className="w-4 h-4" />
              <span>Gerenciar Usuários</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Metric 1: MRR */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">MRR (Recorrência Mensal)</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-white">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-emerald-400 font-bold text-xs flex items-center">
                <Activity className="w-3.5 h-3.5 mr-1" /> Base local
              </span>
              <span className="text-slate-400 text-xs">vs mês anterior (ARR: R$ {arr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Compositores */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Compositores Ativos</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-white">
              {activeComposers.length} <span className="text-sm font-normal text-slate-400">/ {adminComposers.length} total</span>
            </h3>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {activeComposers.length} ativos
              </span>
              {pendingComposers.length > 0 && (
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {pendingComposers.length} pendentes
                </span>
              )}
              {suspendedComposers.length > 0 && (
                <span className="text-rose-400 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {suspendedComposers.length} suspensos
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Metric 3: Total Songs & Audições */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Acervo Musical Protegido</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Music className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-white">
              {totalSongs} <span className="text-sm font-normal text-slate-400">faixas</span>
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-purple-400 font-bold text-xs">
                {totalPlays.toLocaleString('pt-BR')} audições
              </span>
              <span className="text-slate-400 text-xs">• Guia de 35s</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Volume de Negociações */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Volume Transacionado (GMV)</span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-white">
              R$ {totalDealsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-blue-400 font-bold text-xs">
                {totalReleasesCount} autorizações emitidas
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* PLATFORM QUICK CONTROLS & RECENT STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Top Composers & Subscription Health (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Compositores em Destaque no SaaS</h3>
                <p className="text-slate-400 text-xs">Desempenho de catálogo, faturamento e status da assinatura.</p>
              </div>
              <button
                onClick={() => onNavigateTab('compositores')}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
              >
                <span>Ver todos ({adminComposers.length})</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-800/80">
              {adminComposers.slice(0, 5).map(composer => (
                <div key={composer.id} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <img 
                      src={composer.photo} 
                      alt={composer.name} 
                      className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-bold truncate">{composer.stageName}</span>
                        {composer.isVerified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{composer.email} • {composer.cityState}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-bold text-white">R$ {composer.revenueGenerated.toLocaleString('pt-BR')}</p>
                      <p className="text-[10px] text-slate-400">{composer.songCount} músicas • {composer.totalReleases} liberações</p>
                    </div>

                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      composer.subscriptionStatus === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : composer.subscriptionStatus === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {composer.subscriptionStatus === 'active' ? 'Ativo' : composer.subscriptionStatus === 'pending' ? 'Pendente' : 'Suspenso'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick SaaS Parameters Preview */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 rounded-3xl space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Parâmetros do Negócio
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl">
                <span className="text-[11px] text-slate-400 block">Planos publicados</span>
                <span className="text-base font-bold text-amber-400 mt-1 block">
                  {APP_CONFIG.plans.length} opções · R$ 24,90 a R$ 54,90
                </span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl">
                <span className="text-[11px] text-slate-400 block">Capacidade dos planos</span>
                <span className="text-base font-bold text-white mt-1 block">
                  100 · 200 · ilimitadas
                </span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl">
                <span className="text-[11px] text-slate-400 block">Taxa de Intermediação</span>
                <span className="text-base font-bold text-emerald-400 mt-1 block">
                  {platformSettings.platformFeePercentage}% (100% do Compositor)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Audit Stream & System Alerts (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <h3 className="text-base font-bold text-white tracking-tight">Atividades em Tempo Real</h3>
              </div>
              <button
                onClick={() => onNavigateTab('logs')}
                className="text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Ver todos os logs
              </button>
            </div>

            <div className="space-y-3.5">
              {systemLogs.slice(0, 6).map(log => (
                <div key={log.id} className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">{log.title}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{log.timestamp}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{log.description}</p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span>Usuário: {log.user}</span>
                    <span className="font-mono">{log.ip}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
