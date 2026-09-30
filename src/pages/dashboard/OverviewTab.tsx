import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { APP_CONFIG } from '../../config/appConfig';
import { SUBSCRIPTION_STATUS_META } from '../../lib/subscriptionStatus';
import { DashboardCard, DashboardSectionHeader } from '../../components/dashboard/DashboardUI';
import { MetricsHistory } from '../../components/dashboard/MetricsHistory';
import { 
  Music2, 
  Eye, 
  Headphones, 
  MessageSquare, 
  FileCheck, 
  TrendingUp, 
  ArrowUpRight, 
  AlertCircle,
  PlusCircle,
  Sparkles,
  CheckCircle2,
  Circle,
  CreditCard,
  UserRound,
  ListTodo,
  PenLine
} from 'lucide-react';

export const OverviewTab: React.FC = () => {
  const navigate = useNavigate();
  const { profile, songs, requests, releases, subscription, dashboardMetrics } = useApp();

  const totalPlays = songs.reduce((acc, song) => acc + song.playCount, 0);
  const pendingRequests = requests.filter(r => r.status === 'nova' || r.status === 'em_negociacao');
  const confirmedPaymentRequests = requests.filter(r => r.status === 'pagamento_confirmado');

  // Top songs
  const topSongs = [...songs].sort((a, b) => b.playCount - a.playCount).slice(0, 3);
  const subscriptionMeta = SUBSCRIPTION_STATUS_META[subscription.status];
  const rejectedSongs = songs.filter(song => song.status === 'rejected');
  const draftSongs = songs.filter(song => song.status === 'draft');

  const onboardingItems = [
    { label: 'Dados de contato e identificação', complete: Boolean(profile.name && profile.email && profile.whatsapp && profile.cpf), path: '/dashboard/perfil' },
    { label: 'Foto e apresentação artística', complete: Boolean(profile.photo && profile.bio.trim().length >= 40), path: '/dashboard/perfil' },
    { label: 'Localização e gêneros musicais', complete: Boolean(profile.city && profile.state && profile.genres.length), path: '/dashboard/perfil' },
    { label: 'Primeira música cadastrada', complete: songs.length > 0, path: '/dashboard/musicas/nova' },
    { label: 'Prévia de áudio adicionada', complete: songs.some(song => Boolean(song.previewAudioUrl)), path: '/dashboard/musicas' },
    { label: 'Música publicada no catálogo', complete: songs.some(song => song.status === 'published'), path: '/dashboard/musicas' },
  ];
  const completedOnboarding = onboardingItems.filter(item => item.complete).length;
  const onboardingPercent = Math.round((completedOnboarding / onboardingItems.length) * 100);

  const pendingActions = [
    ...(subscription.status !== 'active' ? [{
      id: 'subscription',
      title: subscriptionMeta.label,
      description: subscriptionMeta.nextStep,
      action: subscription.status === 'pending' ? 'Acompanhar' : 'Regularizar',
      path: '/dashboard/assinatura',
      tone: subscription.status === 'suspended' ? 'red' : 'amber',
      icon: CreditCard,
    }] : []),
    ...(confirmedPaymentRequests.length ? [{
      id: 'release',
      title: `${confirmedPaymentRequests.length} ${confirmedPaymentRequests.length === 1 ? 'liberação pronta para emitir' : 'liberações prontas para emitir'}`,
      description: 'O pagamento foi confirmado e o documento pode ser gerado.',
      action: 'Emitir agora',
      path: `/dashboard/solicitacoes/${confirmedPaymentRequests[0].id}`,
      tone: 'emerald',
      icon: FileCheck,
    }] : []),
    ...(pendingRequests.length ? [{
      id: 'requests',
      title: `${pendingRequests.length} ${pendingRequests.length === 1 ? 'solicitação precisa' : 'solicitações precisam'} de atenção`,
      description: 'Responda os interessados e mantenha as negociações atualizadas.',
      action: 'Responder',
      path: `/dashboard/solicitacoes/${pendingRequests[0].id}`,
      tone: 'amber',
      icon: MessageSquare,
    }] : []),
    ...(rejectedSongs.length ? [{
      id: 'rejected',
      title: `${rejectedSongs.length} ${rejectedSongs.length === 1 ? 'música rejeitada' : 'músicas rejeitadas'}`,
      description: 'Revise os dados da obra antes de publicá-la novamente.',
      action: 'Corrigir',
      path: `/dashboard/musicas/${rejectedSongs[0].id}/editar`,
      tone: 'red',
      icon: AlertCircle,
    }] : []),
    ...(onboardingPercent < 100 ? [{
      id: 'profile',
      title: `Configuração da conta em ${onboardingPercent}%`,
      description: 'Conclua as etapas essenciais para apresentar um catálogo profissional.',
      action: 'Continuar',
      path: onboardingItems.find(item => !item.complete)?.path || '/dashboard/perfil',
      tone: 'slate',
      icon: UserRound,
    }] : []),
    ...(draftSongs.length ? [{
      id: 'drafts',
      title: `${draftSongs.length} ${draftSongs.length === 1 ? 'rascunho não publicado' : 'rascunhos não publicados'}`,
      description: 'Continue a edição e publique quando a obra estiver pronta.',
      action: 'Revisar',
      path: `/dashboard/musicas/${draftSongs[0].id}/editar`,
      tone: 'slate',
      icon: PenLine,
    }] : []),
  ];

  const actionToneClasses: Record<string, string> = {
    emerald: 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    amber: 'border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    red: 'border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
    slate: 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  };

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      
      {/* Editorial Welcome Header */}
      <div className="order-1 flex flex-col justify-between gap-5 py-2 md:flex-row md:items-center">
        <div className="space-y-2 relative z-10">
          <h1 className="text-2xl font-bold tracking-tight text-[#0A1128] dark:text-white sm:text-3xl">
            Boa tarde, {profile.stageName}!
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            Aqui está um resumo do seu trabalho no Mercado do Compositor.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <button
            onClick={() => navigate('/dashboard/musicas/nova')}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-300 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:brightness-105"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Adicionar música</span>
          </button>
        </div>
      </div>

      {/* Subscription status */}
      {subscription.status !== 'active' && <section className={`order-2 rounded-2xl border p-4 ${subscriptionMeta.panelClass}`} aria-labelledby="subscription-status-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <CreditCard className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <h2 id="subscription-status-title" className="text-sm font-bold">{subscriptionMeta.label}{subscription.status === 'pending' ? '' : ` · ${subscription.planName}`}</h2>
            <p className="mt-0.5 text-xs opacity-80">{subscriptionMeta.description}</p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard/assinatura')} className="min-h-11 rounded-xl border border-current/20 px-4 py-2 text-xs font-bold hover:bg-white/50 dark:hover:bg-slate-800/60 transition">
            Ver assinatura
          </button>
        </div>
      </section>}

      {/* Prioritized work queue and onboarding */}
      <div className="order-4 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3"><MetricsHistory points={dashboardMetrics} /></div>
        <DashboardCard className="xl:col-span-2" aria-labelledby="pending-actions-title">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-5">
            <div>
              <h2 id="pending-actions-title" className="flex items-center gap-2 font-serif text-lg font-bold text-[#0A1128] dark:text-white"><ListTodo className="h-5 w-5 text-amber-600 dark:text-amber-400" /> Próximas ações</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Ações organizadas por impacto no seu catálogo.</p>
            </div>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">{pendingActions.length} {pendingActions.length === 1 ? 'ação' : 'ações'}</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 px-5">
            {pendingActions.slice(0, 5).map(item => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${actionToneClasses[item.tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
                  </div>
                  <button type="button" onClick={() => navigate(item.path)} className="min-h-11 shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 px-4 py-2 text-xs font-bold text-white dark:text-slate-950 transition">{item.action}</button>
                </div>
              );
            })}
            {pendingActions.length === 0 && (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Tudo em dia por aqui</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Não há ações urgentes no seu catálogo.</p>
              </div>
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="p-5 xl:col-span-5" aria-labelledby="onboarding-title">
          <div className="flex items-start justify-between gap-4">
            <div><h2 id="onboarding-title" className="font-serif text-lg font-bold text-[#0A1128] dark:text-white">Saúde do catálogo</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Qualidade e preparação da sua vitrine profissional.</p></div>
            <span className="text-sm font-extrabold text-amber-700 dark:text-amber-400">{onboardingPercent}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label="Progresso da configuração" aria-valuemin={0} aria-valuemax={100} aria-valuenow={onboardingPercent}>
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${onboardingPercent}%` }} />
          </div>
          {onboardingPercent === 100 ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/40 p-4">
              <div className="flex items-start gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /><div><p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Sua vitrine está pronta</p><p className="mt-1 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">Perfil e catálogo estão configurados para receber visitantes e propostas.</p></div></div>
              <button type="button" onClick={() => navigate(`/compositor/${profile.username}`)} className="mt-3 min-h-10 w-full rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800">Ver perfil público</button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                {onboardingItems.map(item => (
                  <button key={item.label} type="button" onClick={() => !item.complete && navigate(item.path)} disabled={item.complete} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:cursor-default transition">
                    {item.complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />}
                    <span className={`text-xs ${item.complete ? 'text-slate-400 dark:text-slate-500 line-through' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-950 dark:text-amber-200">
                <p className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-300"><Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />Como funciona o ciclo de liberação?</p>
                <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90 list-disc list-inside"><li>Publique sua obra com prévia de 85s protegida contra pirataria.</li><li>Compartilhe o link da sua vitrine com cantores e produtores.</li><li>Receba propostas e o valor <strong>100% direto no seu PIX</strong>, sem taxas retidas.</li></ul>
              </div>
            </>
          )}
        </DashboardCard>
      </div>

      {/* STATS SECTION - Editorial Cards */}
      <div className="order-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Músicas publicadas', value: songs.filter(song => song.status === 'published').length, detail: `${songs.length} no catálogo`, icon: Music2, color: 'text-blue-400' },
          { label: 'Reproduções', value: totalPlays.toLocaleString('pt-BR'), detail: 'Prévias ouvidas', icon: Headphones, color: 'text-indigo-400' },
          { label: 'Solicitações', value: requests.length, detail: `${pendingRequests.length} pendentes`, icon: MessageSquare, color: 'text-sky-400' },
          { label: 'Liberações', value: releases.length, detail: 'Total emitido', icon: FileCheck, color: 'text-emerald-400' },
        ].map(metric => { const Icon = metric.icon; return <div key={metric.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/80 dark:bg-[#0d1a2d]"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-[#162945] ${metric.color}`}><Icon className="h-6 w-6" /></span><div><p className="text-xs font-medium text-slate-500 dark:text-slate-300">{metric.label}</p><strong className="mt-1 block text-3xl font-bold text-slate-950 dark:text-white">{metric.value}</strong><span className="text-[11px] text-slate-400">{metric.detail}</span></div></div>; })}
      </div>

      {/* GRID: RECENT TRACKS TABLE + EDITORIAL PREVIEW PANEL */}
      <div className="order-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* RECENT TRACKS TABLE CONTAINER */}
        <DashboardCard className="flex flex-col overflow-hidden lg:col-span-8">
          <DashboardSectionHeader title="Catálogo de Obras" description="Visão geral de suas composições recentes" action={<button
              onClick={() => navigate('/dashboard/musicas')}
              className="min-h-11 rounded-xl px-3 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-800/60 transition"
            >
              Ver todas →
            </button>} />

          <div className="hidden overflow-x-auto sm:block flex-1 no-scrollbar">
            <table className="w-full text-left table-auto">
              <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3">Música</th>
                  <th className="px-3 py-3 whitespace-nowrap">Gênero</th>
                  <th className="px-3 py-3 whitespace-nowrap">Status</th>
                  <th className="px-3 py-3 whitespace-nowrap">Reproduções</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-600 dark:text-slate-300 divide-y divide-slate-100 dark:divide-slate-800">
                {songs.slice(0, 5).map(song => (
                  <tr key={song.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-[180px] sm:max-w-[220px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img src={song.coverUrl} alt={song.title} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        <span className="truncate">{song.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">{song.genre}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        song.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-transparent dark:border-emerald-800/40'
                          : song.status === 'pending_approval' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-transparent dark:border-amber-800/40'
                          : song.status === 'rejected' ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-transparent dark:border-red-800/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}>
                        {song.status === 'published' ? 'Publicada' : song.status === 'pending_approval' ? 'Em análise' : song.status === 'rejected' ? 'Rejeitada' : 'Rascunho'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{song.playCount} plays</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button 
                        onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)}
                        className="text-amber-600 dark:text-amber-400 font-bold hover:text-amber-700 dark:hover:text-amber-300 text-xs transition"
                      >
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                ))}
                {songs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <Music2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">Seu catálogo ainda está vazio.</p>
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard/musicas/nova')}
                        className="mt-3 text-amber-700 dark:text-amber-400 font-bold text-xs hover:text-amber-800 dark:hover:text-amber-300"
                      >
                        Cadastrar primeira música
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 sm:hidden">
            {songs.slice(0, 5).map(song => (
              <article key={song.id} className="p-4">
                <div className="flex items-start gap-3">
                  {song.coverUrl ? <img src={song.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"><Music2 className="h-5 w-5 text-slate-400" /></div>}
                  <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{song.title}</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{song.genre} · {song.playCount} reproduções</p></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${song.status === 'published' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : song.status === 'pending_approval' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' : song.status === 'rejected' ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{song.status === 'published' ? 'Publicada' : song.status === 'pending_approval' ? 'Em análise' : song.status === 'rejected' ? 'Rejeitada' : 'Rascunho'}</span>
                </div>
                <button type="button" onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)} className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition">Gerenciar música</button>
              </article>
            ))}
            {songs.length === 0 && <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Seu catálogo ainda está vazio.</div>}
          </div>
        </DashboardCard>

        {/* RIGHT PANEL: TOP SONGS */}
        <DashboardCard className="flex flex-col overflow-hidden lg:col-span-4">
          <DashboardSectionHeader title="Músicas em destaque" description="Obras com mais reproduções" action={<button type="button" onClick={() => navigate('/dashboard/musicas')} className="min-h-11 px-2 text-xs font-bold text-amber-700 dark:text-amber-400">Ver todas →</button>} />
          <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
            {topSongs.map((song, index) => (
              <button key={song.id} type="button" onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)} className="flex min-h-[84px] w-full items-center gap-3 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                {song.coverUrl ? <img src={song.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"><Music2 className="h-5 w-5 text-slate-400" /></div>}
                <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{song.title}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{song.genre} · {song.playCount.toLocaleString('pt-BR')} reproduções</p></div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-xs font-bold text-amber-600 dark:text-amber-400">{index + 1}</div>
              </button>
            ))}
            {topSongs.length === 0 && <div className="py-12 text-center"><Music2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Publique músicas para acompanhar os destaques.</p></div>}
          </div>
          <button type="button" onClick={() => navigate(`/compositor/${profile.username}`)} className="mx-5 mb-5 mt-auto min-h-11 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Visualizar perfil público</button>
        </DashboardCard>

      </div>

      {/* RECENT REQUESTS SECTION */}
      <DashboardCard className="order-7 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#0A1128] dark:text-white">Solicitações Recentes de Intérpretes</h3>
            <p className="text-xs text-slate-400">Propostas e contatos diretos recebidos de artistas</p>
          </div>
          <button
            onClick={() => navigate('/dashboard/solicitacoes')}
            className="text-xs text-amber-600 dark:text-amber-400 font-bold hover:text-amber-700 dark:hover:text-amber-300 transition flex items-center gap-1"
          >
            <span>Gerenciar todas</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {requests.slice(0, 4).map(req => (
            <div key={req.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0A1128] dark:bg-slate-800 text-amber-400 flex items-center justify-center font-bold shrink-0 shadow-sm border border-transparent dark:border-slate-700">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">{req.buyerName}{req.buyerStageName ? ` (${req.buyerStageName})` : ''}</h4>
                  <p className="text-slate-500 dark:text-slate-400">
                    Música: <strong className="text-amber-700 dark:text-amber-400">“{req.songTitle}”</strong> • {req.buyerCityState}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  req.status === 'pagamento_confirmado' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' :
                  req.status === 'em_negociacao' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' :
                  req.status === 'liberacao_enviada' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300' :
                  'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}>
                  {req.status === 'liberacao_enviada' ? 'liberação emitida' : req.status.replace('_', ' ')}
                </span>

                <button
                  onClick={() => navigate(`/dashboard/solicitacoes/${req.id}`)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition"
                >
                  Ver Detalhes
                </button>
              </div>
            </div>
          ))}
          {requests.length === 0 && (
            <div className="py-10 text-center">
              <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Nenhuma solicitação recebida.</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Compartilhe seu perfil público para divulgar o catálogo.</p>
            </div>
          )}
        </div>
      </DashboardCard>

    </div>
  );
};
