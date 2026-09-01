import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { APP_CONFIG } from '../../config/appConfig';
import { MusicPlayer } from '../../components/dashboard/MusicPlayer';
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
  const featuredSong = topSongs[0];
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
      description: 'Revise os dados da obra antes de enviá-la novamente para análise.',
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
      description: 'Continue a edição quando estiver pronto para enviar as obras à análise.',
      action: 'Revisar',
      path: `/dashboard/musicas/${draftSongs[0].id}/editar`,
      tone: 'slate',
      icon: PenLine,
    }] : []),
  ];

  const actionToneClasses: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* Editorial Welcome Header */}
      <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Visão Geral do Catálogo
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif italic text-[#0A1128]">
            Olá, {profile.stageName}!
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
            Acompanhe seu catálogo, as reproduções e as solicitações que precisam da sua atenção.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <button
            onClick={() => navigate('/dashboard/musicas/nova')}
            className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nova Música</span>
          </button>
        </div>
      </div>

      {/* Subscription status */}
      <section className={`rounded-2xl border p-4 ${subscriptionMeta.panelClass}`} aria-labelledby="subscription-status-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <CreditCard className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <h2 id="subscription-status-title" className="text-sm font-bold">{subscriptionMeta.label} · {subscription.planName}</h2>
            <p className="mt-0.5 text-xs opacity-80">{subscriptionMeta.description}</p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard/assinatura')} className="min-h-11 rounded-xl border border-current/20 px-4 py-2 text-xs font-bold hover:bg-white/50">
            Ver assinatura
          </button>
        </div>
      </section>

      {/* Prioritized work queue and onboarding */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <DashboardCard className="xl:col-span-3" aria-labelledby="pending-actions-title">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div>
              <h2 id="pending-actions-title" className="flex items-center gap-2 font-serif text-lg font-bold text-[#0A1128]"><ListTodo className="h-5 w-5 text-amber-600" /> Central de pendências</h2>
              <p className="mt-0.5 text-xs text-slate-500">Ações organizadas por impacto no seu catálogo.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{pendingActions.length} {pendingActions.length === 1 ? 'ação' : 'ações'}</span>
          </div>
          <div className="divide-y divide-slate-100 px-5">
            {pendingActions.slice(0, 5).map(item => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${actionToneClasses[item.tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.description}</p>
                  </div>
                  <button type="button" onClick={() => navigate(item.path)} className="min-h-11 shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">{item.action}</button>
                </div>
              );
            })}
            {pendingActions.length === 0 && (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-slate-800">Tudo em dia por aqui</p>
                <p className="mt-1 text-xs text-slate-500">Não há ações urgentes no seu catálogo.</p>
              </div>
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="p-5 xl:col-span-2" aria-labelledby="onboarding-title">
          <div className="flex items-start justify-between gap-4">
            <div><h2 id="onboarding-title" className="font-serif text-lg font-bold text-[#0A1128]">Primeiros passos</h2><p className="mt-0.5 text-xs text-slate-500">Prepare sua vitrine para receber interessados.</p></div>
            <span className="text-sm font-extrabold text-amber-700">{onboardingPercent}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Progresso da configuração" aria-valuemin={0} aria-valuemax={100} aria-valuenow={onboardingPercent}>
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${onboardingPercent}%` }} />
          </div>
          <div className="mt-4 space-y-1">
            {onboardingItems.map(item => (
              <button key={item.label} type="button" onClick={() => !item.complete && navigate(item.path)} disabled={item.complete} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50 disabled:cursor-default">
                {item.complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />}
                <span className={`text-xs ${item.complete ? 'text-slate-400 line-through' : 'font-semibold text-slate-700'}`}>{item.label}</span>
              </button>
            ))}
          </div>
        </DashboardCard>
      </div>

      <MetricsHistory points={dashboardMetrics} />

      {/* STATS SECTION - Editorial Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* Total Songs */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-1">
          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Músicas</p>
          <p className="text-3xl font-serif italic text-[#0A1128]">{songs.length}</p>
          <div className="mt-1 flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
            <TrendingUp className="w-3 h-3" />
            <span>No catálogo</span>
          </div>
        </div>

        {/* Profile Views */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-1">
          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Visualizações</p>
          <p className="text-3xl font-serif italic text-[#0A1128]">{profile.viewsCount}</p>
          <div className="mt-1 flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
            <span>Total acumulado</span>
          </div>
        </div>

        {/* Plays */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-1">
          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Reproduções</p>
          <p className="text-3xl font-serif italic text-[#0A1128]">{totalPlays}</p>
          <div className="mt-1 flex items-center gap-1 text-slate-400 text-[10px]">
            <span>Prévias ouvidas</span>
          </div>
        </div>

        {/* Requests */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-1">
          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Solicitações</p>
          <p className="text-3xl font-serif italic text-[#0A1128]">{requests.length}</p>
          <div className="mt-1 flex items-center gap-1 text-amber-600 text-[10px] font-bold">
            <span>{pendingRequests.length} pendentes</span>
          </div>
        </div>

        {/* Releases */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-1">
          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Liberações</p>
          <p className="text-3xl font-serif italic text-[#0A1128]">{releases.length}</p>
          <div className="mt-1 flex items-center gap-1 text-slate-400 text-[10px]">
            <span>Total emitido</span>
          </div>
        </div>

        {/* Subscription Status */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-1">
          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Assinatura</p>
          <p className={`text-xl font-serif italic ${subscriptionMeta.textClass}`}>
            {subscription.status === 'active' ? 'Ativa' : subscription.status === 'pending' ? 'Pendente' : subscription.status === 'suspended' ? 'Suspensa' : 'Cancelada'}
          </p>
          <span className="text-[10px] text-slate-400 block truncate">
            {subscriptionMeta.shortLabel}
          </span>
        </div>

      </div>

      {/* GRID: RECENT TRACKS TABLE + EDITORIAL PREVIEW PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* RECENT TRACKS TABLE CONTAINER */}
        <DashboardCard className="flex flex-col overflow-hidden lg:col-span-8">
          <DashboardSectionHeader title="Catálogo de Obras" description="Visão geral de suas composições recentes" action={<button
              onClick={() => navigate('/dashboard/musicas')}
              className="min-h-11 rounded-xl px-3 text-xs font-bold text-amber-700 hover:bg-amber-50"
            >
              Ver todas →
            </button>} />

          <div className="hidden overflow-x-auto sm:block flex-1">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-3">Música</th>
                  <th className="px-6 py-3">Gênero</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Reproduções</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-600 divide-y divide-slate-100">
                {songs.slice(0, 5).map(song => (
                  <tr key={song.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                      <img src={song.coverUrl} alt={song.title} className="w-8 h-8 rounded-lg object-cover" />
                      <span>{song.title}</span>
                    </td>
                    <td className="px-6 py-4 text-xs">{song.genre}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        song.status === 'published' ? 'bg-emerald-100 text-emerald-700'
                          : song.status === 'pending_approval' ? 'bg-amber-100 text-amber-700'
                          : song.status === 'rejected' ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {song.status === 'published' ? 'Publicada' : song.status === 'pending_approval' ? 'Em análise' : song.status === 'rejected' ? 'Rejeitada' : 'Rascunho'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-700">{song.playCount} plays</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)}
                        className="text-amber-600 font-bold hover:text-amber-700 text-xs"
                      >
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                ))}
                {songs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <Music2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="font-semibold text-slate-700">Seu catálogo ainda está vazio.</p>
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard/musicas/nova')}
                        className="mt-3 text-amber-700 font-bold text-xs hover:text-amber-800"
                      >
                        Cadastrar primeira música
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 sm:hidden">
            {songs.slice(0, 5).map(song => (
              <article key={song.id} className="p-4">
                <div className="flex items-start gap-3">
                  {song.coverUrl ? <img src={song.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Music2 className="h-5 w-5 text-slate-400" /></div>}
                  <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-900">{song.title}</h3><p className="mt-0.5 text-xs text-slate-500">{song.genre} · {song.playCount} reproduções</p></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${song.status === 'published' ? 'bg-emerald-100 text-emerald-700' : song.status === 'pending_approval' ? 'bg-amber-100 text-amber-700' : song.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{song.status === 'published' ? 'Publicada' : song.status === 'pending_approval' ? 'Em análise' : song.status === 'rejected' ? 'Rejeitada' : 'Rascunho'}</span>
                </div>
                <button type="button" onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)} className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50">Gerenciar música</button>
              </article>
            ))}
            {songs.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Seu catálogo ainda está vazio.</div>}
          </div>
        </DashboardCard>

        {/* RIGHT PANEL: EDITORIAL PREVIEW CARD */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="bg-[#0A1128] text-white p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-2xl h-full border border-amber-500/20">
            {/* Ambient Blur */}
            <div className="absolute top-[-20px] right-[-20px] w-40 h-40 bg-amber-500/20 rounded-full blur-3xl" />
            
            <div>
              <h4 className="text-[10px] uppercase tracking-widest text-amber-500 font-bold mb-6">
                Visualização Pública
              </h4>
              
              <div className="flex flex-col items-center justify-center text-center my-4">
                {featuredSong?.coverUrl ? (
                  <img src={featuredSong.coverUrl} alt={`Capa de ${featuredSong.title}`} className="mb-4 h-28 w-28 rounded-2xl object-cover shadow-xl" />
                ) : (
                  <div className="mb-4 flex h-28 w-28 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
                    <Music2 className="h-9 w-9" aria-hidden="true" />
                  </div>
                )}
                <h5 className="text-xl font-serif italic mb-1">{featuredSong?.title || 'Seu perfil público'}</h5>
                <p className="text-slate-400 text-xs">{profile.stageName}{featuredSong ? ` • ${featuredSong.genre}` : ''}</p>
                <div className="my-6 w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-left">
                  <p className="text-xs font-semibold text-white">{featuredSong?.previewAudioUrl ? 'Prévia pública disponível' : 'Nenhuma prévia pública disponível'}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{featuredSong?.previewAudioUrl ? 'O visitante poderá ouvir a prévia protegida desta música.' : 'Adicione uma prévia a uma música publicada para habilitar a audição.'}</p>
                </div>

                <div className="flex flex-col w-full gap-2.5">
                  <button 
                    onClick={() => navigate(`/compositor/${profile.username}`)}
                    className="w-full py-3 bg-white hover:bg-slate-100 text-[#0A1128] font-bold rounded-xl text-xs transition shadow-md"
                  >
                    Visualizar como visitante
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* RECENT REQUESTS SECTION */}
      <DashboardCard className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-[#0A1128]">Solicitações Recentes de Intérpretes</h3>
            <p className="text-xs text-slate-400">Propostas e contatos diretos recebidos de artistas</p>
          </div>
          <button
            onClick={() => navigate('/dashboard/solicitacoes')}
            className="text-xs text-amber-600 font-bold hover:text-amber-700 transition flex items-center gap-1"
          >
            <span>Gerenciar todas</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {requests.slice(0, 4).map(req => (
            <div key={req.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-bold shrink-0 shadow-sm">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{req.buyerName}{req.buyerStageName ? ` (${req.buyerStageName})` : ''}</h4>
                  <p className="text-slate-500">
                    Música: <strong className="text-amber-700">“{req.songTitle}”</strong> • {req.buyerCityState}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  req.status === 'pagamento_confirmado' ? 'bg-emerald-100 text-emerald-800' :
                  req.status === 'em_negociacao' ? 'bg-amber-100 text-amber-800' :
                  req.status === 'liberacao_enviada' ? 'bg-blue-100 text-blue-800' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {req.status.replace('_', ' ')}
                </span>

                <button
                  onClick={() => navigate(`/dashboard/solicitacoes/${req.id}`)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition"
                >
                  Ver Detalhes
                </button>
              </div>
            </div>
          ))}
          {requests.length === 0 && (
            <div className="py-10 text-center">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-700 text-sm">Nenhuma solicitação recebida.</p>
              <p className="text-xs text-slate-500 mt-1">Compartilhe seu perfil público para divulgar o catálogo.</p>
            </div>
          )}
        </div>
      </DashboardCard>

      {/* Ferramenta secundária: fica após os dados comerciais do catálogo. */}
      <MusicPlayer />

    </div>
  );
};
