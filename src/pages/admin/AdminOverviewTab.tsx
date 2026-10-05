import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  DollarSign, 
  Users, 
  Music, 
  FileCheck2, 
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
} from 'lucide-react';
import { isRemovedComposer } from '../../lib/adminComposerVisibility';
import { useNavigate } from 'react-router-dom';

interface AdminOverviewTabProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({ onNavigateTab }) => {
  const navigate = useNavigate();
  const { 
    adminComposers, 
    adminSongs,
    adminRequests,
    adminReleases,
    subscriptionPlans,
    systemLogs,
    adminRole
  } = useApp();

  const [activePeriod, setActivePeriod] = useState<'6m' | '12m'>('6m');
  const [hoveredDataPoint, setHoveredDataPoint] = useState<{ month: string; year: number; gmv: number; deals: number } | null>(null);

  // O moderador não recebe dados financeiros globais. Sua visão usa apenas o acervo.
  if (adminRole === 'moderator') {
    const published = adminSongs.filter(song => song.status === 'published');
    const pending = adminSongs.filter(song => song.status === 'pending_approval');
    return <div className="space-y-6 animate-fadeIn pb-12">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Visão Geral da Moderação</h1>
        <p className="mt-2 text-sm text-slate-400">Acompanhe o acervo e as obras aguardando análise.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><p className="text-xs text-slate-400">Obras cadastradas</p><strong className="mt-2 block text-2xl text-white">{adminSongs.length}</strong></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><p className="text-xs text-slate-400">Publicadas</p><strong className="mt-2 block text-2xl text-emerald-400">{published.length}</strong></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><p className="text-xs text-slate-400">Aguardando análise</p><strong className="mt-2 block text-2xl text-amber-400">{pending.length}</strong></div>
      </div>
      <button type="button" onClick={() => onNavigateTab('musicas')} className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400">Abrir acervo e moderação</button>
    </div>;
  }

  // Metrics Calculations
  const visibleComposers = adminComposers.filter(c => !isRemovedComposer(c));
  const activeComposers = visibleComposers.filter(c => c.subscriptionStatus === 'active');
  const pendingComposers = visibleComposers.filter(c => c.subscriptionStatus === 'pending');
  const operationalReleases = adminReleases.filter(release => !release.isDemonstrative);
  const demoRequestIds = new Set(adminReleases.filter(release => release.isDemonstrative).map(release => release.requestId));
  const operationalRequests = adminRequests.filter(request => !demoRequestIds.has(request.id));
  const mrr = activeComposers.reduce((acc, c) => acc + (c.monthlyValue || 0), 0);
  const publishedSongs = adminSongs.filter(song => song.status === 'published');
  const totalPlays = adminSongs.reduce((acc, song) => acc + (song.playCount || 0), 0);
  const totalDealsValue = operationalReleases.reduce((acc, release) => acc + (release.agreedValue || 0), 0);
  const totalReleasesCount = operationalReleases.length;
  const paidWithoutRelease = operationalRequests.filter(request => request.status === 'pagamento_confirmado' && !request.releaseId);
  const pendingAgreedValue = paidWithoutRelease.reduce((acc, request) => acc + (request.agreedValue || 0), 0);

  // Série de termos emitidos. Não reconstrói cobranças passadas a partir do status atual.
  const generateRevenueHistory = (monthCount: number) => {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    const result = [];

    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const monthLabel = monthNames[monthIndex];
      // issueDate é uma data civil (AAAA-MM-DD); new Date() a deslocaria pelo fuso.
      const matchingReleases = operationalReleases.filter(release => release.issueDate?.slice(0, 7) === `${year}-${String(monthIndex + 1).padStart(2, '0')}`);
      const releaseGmv = matchingReleases.reduce((sum, r) => sum + (r.agreedValue || 0), 0);

      result.push({
        month: monthLabel,
        year,
        gmv: releaseGmv,
        deals: matchingReleases.length
      });
    }

    return result;
  };

  const revenueHistory = generateRevenueHistory(activePeriod === '6m' ? 6 : 12);
  const maxRevenue = Math.max(...revenueHistory.map(r => r.gmv), 1);
  const hasAnyRevenueData = revenueHistory.some(r => r.gmv > 0);

  // Chart 2: Songs by Genre Distribution
  const genreCounts = publishedSongs.reduce<Record<string, number>>((acc, s) => {
    const genre = s.genre || 'Outros';
    acc[genre] = (acc[genre] || 0) + 1;
    return acc;
  }, {});

  const totalSongsInDb = publishedSongs.length || 1;
  const genreData = (Object.entries(genreCounts) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, count]) => ({
      genre,
      count,
      percent: Math.round((count / totalSongsInDb) * 100)
    }));

  const totalRequestsCount = operationalRequests.length;
  const requestStates = [
    { status: 'nova', label: 'Novas', color: 'from-amber-500 to-amber-600' },
    { status: 'em_negociacao', label: 'Em negociação', color: 'from-blue-500 to-blue-600' },
    { status: 'pagamento_pendente', label: 'Pagamento pendente', color: 'from-orange-500 to-orange-600' },
    { status: 'pagamento_confirmado', label: 'Pagamento confirmado, sem termo', color: 'from-emerald-500 to-emerald-600' },
    { status: 'liberacao_enviada', label: 'Liberação enviada', color: 'from-purple-500 to-purple-600' },
    { status: 'arquivada', label: 'Arquivadas', color: 'from-slate-500 to-slate-600' }
  ] as const;
  const funnelSteps = requestStates.map(step => {
    const count = operationalRequests.filter(request => request.status === step.status).length;
    const percent = totalRequestsCount ? Math.round(count / totalRequestsCount * 100) : 0;
    return { ...step, count, percent, badge: `${percent}%` };
  });
  const featuredComposers = activeComposers.filter(composer => composer.isFeatured || composer.planIncludesFeatured)
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated || b.totalPlays - a.totalPlays).slice(0, 5);
  const planGroups = activeComposers.reduce<Record<string, { count: number; value: number }>>((groups, composer) => {
    const name = composer.planName || 'Plano não informado';
    const group = groups[name] || { count: 0, value: 0 };
    group.count += 1;
    group.value += composer.monthlyValue || 0;
    groups[name] = group;
    return groups;
  }, {});
  const planNames = [...subscriptionPlans.map(plan => plan.name), ...Object.keys(planGroups).filter(name => !subscriptionPlans.some(plan => plan.name === name))];

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-amber-500/20 p-6 md:p-8 rounded-3xl relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> {adminRole === 'master' ? 'Painel Executivo do Dono' : 'Painel Financeiro'}
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

          <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
            {adminRole === 'master' && <button
              onClick={() => onNavigateTab('configuracoes')}
              className="min-h-11 flex-1 sm:flex-none justify-center whitespace-nowrap px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span>Configurações</span>
            </button>}
            <button
              onClick={() => onNavigateTab('compositores')}
              className="min-h-11 flex-1 sm:flex-none justify-center whitespace-nowrap px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400" title="Soma do valor do plano de todas as contas ativas, inclusive em teste grátis e cortesias. Para valores cobrados, use o painel do Stripe.">MRR estimado</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-white font-mono">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
            <p className="mt-2 text-xs text-slate-400">Valor nominal dos planos ativos hoje; inclui testes e cortesias. Cobranças efetivas: Stripe.</p>
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
              {activeComposers.length} <span className="text-sm font-normal text-slate-400">/ {visibleComposers.length} total</span>
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

        {/* Metric 3: Published songs (master only) */}
        {adminRole === 'master' &&
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Obras publicadas</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Music className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-white">
              {publishedSongs.length} <span className="text-sm font-normal text-slate-400">faixas</span>
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-purple-400 font-bold text-xs">
                {totalPlays.toLocaleString('pt-BR')} audições no acervo total
              </span>
              <span className="text-slate-400 text-xs">• Prévia 85s</span>
            </div>
          </div>
        </div>}

        {/* Metric 4: Volume de Negociações */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative group hover:border-amber-500/30 transition shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Valor acordado em termos</span>
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
            <p className="mt-2 text-xs text-slate-400">Inclui termos históricos e exclui simulações marcadas. Valores acordados não comprovam repasse ou receita da plataforma.</p>
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
                  Valor dos termos emitidos por mês
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Soma dos valores acordados nos termos, pela data de emissão.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto text-xs">
              <button
                type="button"
                aria-pressed={activePeriod === '6m'}
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
                type="button"
                aria-pressed={activePeriod === '12m'}
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
                    <span className="font-bold text-amber-400">{hoveredDataPoint.month}/{hoveredDataPoint.year}:</span>
                    <span className="text-slate-200">Valor dos termos: <strong className="text-white font-mono">R$ {hoveredDataPoint.gmv.toLocaleString('pt-BR')}</strong></span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-mono text-[11px]">{hoveredDataPoint.deals} autorizações</span>
                  </div>
                </div>
              )}

              {/* Notice when empty in production */}
              {!hasAnyRevenueData && (
                <div className="absolute inset-x-4 top-14 bottom-8 flex flex-col items-center justify-center pointer-events-none z-20">
                  <div className="bg-slate-900/95 border border-slate-700/60 rounded-xl px-4 py-2.5 text-center shadow-lg max-w-sm">
                    <p className="text-xs text-slate-200 font-medium">Nenhum termo emitido no período</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Os valores aparecem quando um termo é emitido.</p>
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
                const barHeightPercent = maxRevenue > 0 && item.gmv > 0 ? Math.max(8, Math.round((item.gmv / maxRevenue) * 100)) : 0;

                return (
                  <div 
                    key={`${item.year}-${item.month}`}
                    role="img"
                    tabIndex={0}
                    aria-label={`${item.month} de ${item.year}: R$ ${item.gmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${item.deals} termos emitidos`}
                    onMouseEnter={() => setHoveredDataPoint(item)}
                    onMouseLeave={() => setHoveredDataPoint(null)}
                    onFocus={() => setHoveredDataPoint(item)}
                    onBlur={() => setHoveredDataPoint(null)}
                    className="flex-1 flex flex-col items-center gap-2 z-10 h-full justify-end group cursor-pointer"
                  >
                    {/* Valor dos termos emitidos */}
                    <div className="w-full max-w-[34px] flex items-end justify-center gap-1 h-full">
                      <div 
                        className={`w-full bg-gradient-to-t from-amber-500/40 via-amber-500/80 to-amber-400 rounded-t-lg transition-all duration-300 group-hover:scale-y-105 group-hover:brightness-125 origin-bottom ${barHeightPercent > 0 ? 'min-h-[4px]' : 'h-0'}`}
                        style={{ height: `${barHeightPercent}%` }}
                      />
                    </div>

                    <span className="text-[11px] font-bold text-slate-400 group-hover:text-amber-400 transition">
                      {item.month}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-slate-400">Passe o mouse ou use Tab para consultar cada mês. O valor é acordado, não uma cobrança da plataforma.</p>
          </div>
        </div>

        {/* CHART 2: GENRE DISTRIBUTION BARS (5 Cols) */}
        {adminRole === 'master' &&
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white tracking-tight">
                Acervo por Gênero Musical
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Proporção das obras com status publicado.
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
            <strong className="text-white font-mono">{publishedSongs.length} faixas</strong>
          </div>
        </div>}

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
                  Situação atual das propostas
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Distribuição das propostas por status atual; cada proposta aparece uma vez.
              </p>
            </div>
            <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
              {totalRequestsCount} propostas
            </span>
          </div>

          <div className="space-y-3">
            {funnelSteps.map((step) => (
              <div key={step.label} className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-2 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-mono text-[11px] flex items-center justify-center border border-slate-700">
                      {step.count}
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
          <p className="text-xs text-slate-400">Pagamentos confirmados sem termo: <strong className="text-white">{paidWithoutRelease.length}</strong> · Valor acordado: <strong className="text-white">R$ {pendingAgreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
        </div>

        {/* PLANS DISTRIBUTION (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Assinantes por Plano</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Participação no valor nominal mensal dos planos ativos.
            </p>
          </div>

          <div className="space-y-4">
            {planNames.map(name => {
              const group = planGroups[name] || { count: 0, value: 0 };
              const percent = mrr > 0 ? Math.round((group.value / mrr) * 100) : 0;

              return (
                <div key={name} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 hover:border-slate-700 transition">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-white block">{name}</strong>
                      <span className="text-[11px] text-amber-400 font-mono">R$ {group.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês no grupo</span>
                    </div>
                    <span className="font-mono text-slate-300 font-bold">
                      {group.count} assinantes ({percent}% do valor)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-amber-400 transition-all duration-500"
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
              <span>Ver todos ({visibleComposers.length})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-800/80">
            {featuredComposers.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Nenhum compositor ativo em destaque no momento.
              </div>
            ) : (
              featuredComposers.map(composer => (
                <button type="button" key={composer.id} onClick={() => navigate(`/admin/compositores?composer=${encodeURIComponent(composer.id)}`)} className="w-full py-3.5 flex items-center justify-between gap-4 text-left hover:bg-slate-800/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    {composer.photo ? (
                      <img 
                        src={composer.photo} 
                        alt={composer.name} 
                        className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                        {composer.stageName?.slice(0, 2).toUpperCase() || 'MC'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-bold truncate">{composer.stageName}</span>
                        {composer.isVerified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{composer.cityState || 'Local não informado'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-bold text-white font-mono">R$ {(composer.revenueGenerated || 0).toLocaleString('pt-BR')}</p>
                      <p className="text-[10px] text-slate-400">{composer.songCount} músicas • {composer.totalReleases} liberações</p>
                    </div>

                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      composer.subscriptionStatus === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : composer.subscriptionStatus === 'pending'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {composer.subscriptionStatus === 'active' ? 'Ativo' : composer.subscriptionStatus === 'pending' ? 'Pendente' : composer.subscriptionStatus === 'cancelled' ? 'Cancelado' : 'Suspenso'}
                    </span>
                  </div>
                </button>
              ))
            )}
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
            {systemLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Nenhum registro de atividade recente no momento.
              </div>
            ) : (
              systemLogs.slice(0, 5).map(log => (
                <div key={log.id} className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">{log.title}</span>
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">{log.timestamp}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed truncate">{log.description}</p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
