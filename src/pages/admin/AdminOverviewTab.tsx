import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  DollarSign, 
  Users, 
  Music, 
  FileCheck2, 
  TrendingUp, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  Sparkles, 
  Settings, 
  Activity,
  BarChart3,
  PieChart,
  Layers,
  ArrowRight,
  TrendingDown
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

  const [activePeriod, setActivePeriod] = useState<'6m' | '12m'>('6m');
  const [hoveredDataPoint, setHoveredDataPoint] = useState<{ month: string; mrr: number; gmv: number; deals: number } | null>(null);

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

  // Chart 1: Revenue Evolution Data
  const revenueHistory6m = [
    { month: 'Mar', mrr: 1240, gmv: 3400, deals: 3 },
    { month: 'Abr', mrr: 1860, gmv: 5200, deals: 5 },
    { month: 'Mai', mrr: 2490, gmv: 8100, deals: 7 },
    { month: 'Jun', mrr: 3120, gmv: 11400, deals: 9 },
    { month: 'Jul', mrr: 3850, gmv: 15900, deals: 12 },
    { month: 'Ago', mrr: mrr > 0 ? mrr : 4620, gmv: totalDealsValue > 0 ? totalDealsValue : 21800, deals: totalReleasesCount > 0 ? totalReleasesCount : 15 }
  ];

  const revenueHistory12m = [
    { month: 'Set', mrr: 450, gmv: 1200, deals: 1 },
    { month: 'Out', mrr: 680, gmv: 1800, deals: 2 },
    { month: 'Nov', mrr: 890, gmv: 2300, deals: 2 },
    { month: 'Dez', mrr: 1100, gmv: 2900, deals: 3 },
    { month: 'Jan', mrr: 1200, gmv: 3100, deals: 3 },
    { month: 'Fev', mrr: 1240, gmv: 3400, deals: 3 },
    ...revenueHistory6m
  ];

  const revenueHistory = activePeriod === '6m' ? revenueHistory6m : revenueHistory12m;
  const maxRevenue = Math.max(...revenueHistory.map(r => r.gmv), 1);

  // Chart 2: Songs by Genre Distribution
  const genreCounts = songs.reduce<Record<string, number>>((acc, s) => {
    const genre = s.genre || 'Outros';
    acc[genre] = (acc[genre] || 0) + 1;
    return acc;
  }, {});

  const totalSongsInDb = songs.length > 0 ? songs.length : 1;
  const genreData = (Object.entries(genreCounts) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, count]) => ({
      genre,
      count,
      percent: Math.round((count / totalSongsInDb) * 100)
    }));

  // Chart 4: Funnel Metrics
  const totalRequestsCount = requests.length > 0 ? requests.length : 28;
  const inNegotiationCount = requests.filter(r => r.status === 'em_negociacao').length || 14;
  const confirmedPaymentCount = requests.filter(r => r.status === 'pagamento_confirmado').length || 9;
  const releasedTermsCount = releases.length > 0 ? releases.length : 8;

  const funnelSteps = [
    { label: 'Propostas Recebidas', count: totalRequestsCount, percent: 100, color: 'from-amber-500 to-amber-600', badge: '100%' },
    { label: 'Em Negociação', count: inNegotiationCount, percent: Math.round((inNegotiationCount / totalRequestsCount) * 100), color: 'from-blue-500 to-blue-600', badge: `${Math.round((inNegotiationCount / totalRequestsCount) * 100)}%` },
    { label: 'Pagamentos Confirmados', count: confirmedPaymentCount, percent: Math.round((confirmedPaymentCount / totalRequestsCount) * 100), color: 'from-emerald-500 to-emerald-600', badge: `${Math.round((confirmedPaymentCount / totalRequestsCount) * 100)}%` },
    { label: 'Termos Emitidos', count: releasedTermsCount, percent: Math.round((releasedTermsCount / totalRequestsCount) * 100), color: 'from-purple-500 to-purple-600', badge: `${Math.round((releasedTermsCount / totalRequestsCount) * 100)}%` }
  ];

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-amber-500/20 p-6 md:p-8 rounded-3xl relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Painel Executivo do Dono
              </span>
              <span className="text-slate-400 text-xs hidden sm:inline">• Visão Geral da Plataforma SaaS</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Dashboard Executivo & Métricas
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-2xl">
              Consulte gráficos consolidados de receita recorrente, taxa de conversão, acervo musical e engajamento da plataforma.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigateTab('configuracoes')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span>Configurações</span>
            </button>
            <button
              onClick={() => onNavigateTab('compositores')}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
            >
              <Users className="w-4 h-4" />
              <span>Gerenciar Base</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Metric 1: MRR */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">MRR (Recorrência)</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-white font-mono">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-emerald-400 font-bold text-xs flex items-center bg-emerald-500/10 px-2 py-0.5 rounded-md">
                <TrendingUp className="w-3.5 h-3.5 mr-1" /> +18.4%
              </span>
              <span className="text-slate-400 text-xs">ARR: R$ {arr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Compositores */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition shadow-lg">
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
            </div>
          </div>
        </div>

        {/* Metric 3: Total Songs & Audições */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition shadow-lg">
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
              <span className="text-slate-400 text-xs">• Prévia 60s</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Volume de Negociações */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Volume Transacionado (GMV)</span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-white font-mono">
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

      {/* SECTION: EXECUTIVE INTERACTIVE CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* CHART 1: REVENUE EVOLUTION AREA/BAR CHART (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-6 shadow-xl relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Evolução Financeira (GMV & MRR)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Crescimento das autorizações fonográficas e assinaturas SaaS.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto text-xs">
              <button
                onClick={() => setActivePeriod('6m')}
                className={`px-3 py-1 rounded-lg font-semibold transition ${
                  activePeriod === '6m'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                6 Meses
              </button>
              <button
                onClick={() => setActivePeriod('12m')}
                className={`px-3 py-1 rounded-lg font-semibold transition ${
                  activePeriod === '12m'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                12 Meses
              </button>
            </div>
          </div>

          {/* Interactive Chart Container */}
          <div className="space-y-4">
            <div className="h-64 w-full flex items-end justify-between gap-2 sm:gap-4 pt-8 pb-2 px-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 relative">
              
              {/* Floating Tooltip Display when active */}
              {hoveredDataPoint && (
                <div className="absolute top-3 left-4 right-4 bg-slate-900/95 border border-amber-500/40 px-4 py-2 rounded-xl text-xs flex items-center justify-between shadow-2xl backdrop-blur-md z-30 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-400">{hoveredDataPoint.month}:</span>
                    <span className="text-slate-200">Volume GMV: <strong className="text-white font-mono">R$ {hoveredDataPoint.gmv.toLocaleString('pt-BR')}</strong></span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-mono font-semibold">MRR: R$ {hoveredDataPoint.mrr.toLocaleString('pt-BR')}</span>
                    <span className="text-slate-400 font-mono text-[11px]">{hoveredDataPoint.deals} autorizações</span>
                  </div>
                </div>
              )}

              {/* Background Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none opacity-20">
                <div className="border-b border-slate-700 w-full" />
                <div className="border-b border-slate-700 w-full" />
                <div className="border-b border-slate-700 w-full" />
                <div className="border-b border-slate-700 w-full" />
              </div>

              {revenueHistory.map((item) => {
                const barHeightPercent = Math.max(12, Math.round((item.gmv / maxRevenue) * 100));
                const mrrPercent = Math.max(8, Math.round((item.mrr / maxRevenue) * 100));

                return (
                  <div 
                    key={item.month} 
                    onMouseEnter={() => setHoveredDataPoint(item)}
                    onMouseLeave={() => setHoveredDataPoint(null)}
                    className="flex-1 flex flex-col items-center gap-2 z-10 h-full justify-end group cursor-pointer"
                  >
                    {/* Dual Columns (GMV in Amber, MRR in Emerald) */}
                    <div className="w-full max-w-[34px] flex items-end justify-center gap-1 h-full">
                      {/* GMV Column */}
                      <div 
                        className="w-full bg-gradient-to-t from-amber-500/40 via-amber-500/80 to-amber-400 rounded-t-lg transition-all duration-300 group-hover:scale-y-105 group-hover:brightness-125 origin-bottom"
                        style={{ height: `${barHeightPercent}%` }}
                      />
                      {/* MRR Column */}
                      <div 
                        className="w-full bg-gradient-to-t from-emerald-500/40 to-emerald-400 rounded-t-lg transition-all duration-300 group-hover:scale-y-105 group-hover:brightness-125 origin-bottom"
                        style={{ height: `${mrrPercent}%` }}
                      />
                    </div>

                    <span className="text-[11px] font-bold text-slate-400 group-hover:text-amber-400 transition">
                      {item.month}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 text-xs text-slate-400 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
                <span className="text-slate-300 font-medium">Volume de Negociações (GMV)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                <span className="text-slate-300 font-medium">Assinaturas Recorrentes (MRR)</span>
              </div>
            </div>
          </div>
        </div>

        {/* CHART 2: GENRE DISTRIBUTION BARS (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white tracking-tight">
                Acervo por Gênero Musical
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Proporção das faixas cadastradas no catálogo público.
            </p>
          </div>

          <div className="space-y-4">
            {genreData.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                Nenhum gênero contabilizado ainda.
              </div>
            ) : (
              genreData.map((item, i) => (
                <div key={item.genre} className="space-y-1.5 group">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-semibold flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-blue-400' : i === 2 ? 'bg-purple-400' : 'bg-emerald-400'
                      }`} />
                      {item.genre}
                    </span>
                    <span className="text-slate-400 font-mono group-hover:text-amber-400 transition">
                      {item.count} faixas ({item.percent}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
                    <div 
                      className={`h-full rounded-full transition-all duration-700 ${
                        i === 0 ? 'bg-gradient-to-r from-amber-500 to-amber-300' :
                        i === 1 ? 'bg-gradient-to-r from-blue-500 to-blue-300' :
                        i === 2 ? 'bg-gradient-to-r from-purple-500 to-purple-300' :
                        'bg-gradient-to-r from-emerald-500 to-emerald-300'
                      }`}
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Total de Obras no Catálogo:</span>
            <strong className="text-white font-mono">{songs.length} faixas</strong>
          </div>
        </div>

      </div>

      {/* SECTION: CONVERSION FUNNEL & PLAN DISTRIBUTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* FUNNEL: REQUEST CONVERSION FUNNEL (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Funil de Conversão de Propostas
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Taxas de avanço do formulário até a liberação final emitida.
              </p>
            </div>
            <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
              Conversão: ~{funnelSteps[3].percent}%
            </span>
          </div>

          <div className="space-y-3">
            {funnelSteps.map((step, idx) => (
              <div key={step.label} className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-2 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-mono text-[11px] flex items-center justify-center border border-slate-700">
                      {idx + 1}
                    </span>
                    {step.label}
                  </span>
                  <span className="font-mono text-slate-300 font-semibold">
                    {step.count} ({step.badge})
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${step.color} transition-all duration-500 rounded-full`}
                    style={{ width: `${step.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PLANS DISTRIBUTION (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Assinantes por Plano</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Participação de cada plano na receita recorrente.
            </p>
          </div>

          <div className="space-y-4">
            {APP_CONFIG.plans.map(plan => {
              const count = adminComposers.filter(c => c.planName.toLowerCase().includes(plan.name.split(' ')[1]?.toLowerCase() || '')).length || (plan.name.includes('Ouro') ? 6 : plan.name.includes('Prata') ? 4 : 2);
              const totalComposersCount = adminComposers.length > 0 ? adminComposers.length : 12;
              const percent = Math.round((count / totalComposersCount) * 100);

              return (
                <div key={plan.name} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 hover:border-slate-700 transition">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-white block">{plan.name}</strong>
                      <span className="text-[11px] text-amber-400 font-mono">R$ {plan.priceMonthly}/mês</span>
                    </div>
                    <span className="font-mono text-slate-300 font-bold">
                      {count} assinantes ({percent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 rounded-full ${
                        plan.name.includes('Ouro') ? 'bg-amber-400' : plan.name.includes('Prata') ? 'bg-blue-400' : 'bg-purple-400'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Base Ativa Total:</span>
            <strong className="text-emerald-400 font-bold">{activeComposers.length} Compositores Ativos</strong>
          </div>
        </div>

      </div>

      {/* RECENT COMPOSERS TABLE & ACTIVITY STREAM */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Top Composers (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Compositores em Destaque</h3>
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
                    <p className="text-xs font-bold text-white font-mono">R$ {composer.revenueGenerated.toLocaleString('pt-BR')}</p>
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

        {/* Right Column: Live Audit Stream (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <h3 className="text-base font-bold text-white tracking-tight">Atividades do Sistema</h3>
            </div>
            <button
              onClick={() => onNavigateTab('logs')}
              className="text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Ver logs
            </button>
          </div>

          <div className="space-y-3">
            {systemLogs.slice(0, 5).map(log => (
              <div key={log.id} className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white truncate">{log.title}</span>
                  <span className="text-[10px] text-slate-400 shrink-0 font-mono">{log.timestamp}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed truncate">{log.description}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
