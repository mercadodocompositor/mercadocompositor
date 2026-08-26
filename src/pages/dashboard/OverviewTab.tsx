import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { APP_CONFIG } from '../../config/appConfig';
import { MusicPlayer } from '../../components/dashboard/MusicPlayer';
import { 
  Music2, 
  Eye, 
  Headphones, 
  MessageSquare, 
  FileCheck, 
  ShieldCheck, 
  TrendingUp, 
  ArrowUpRight, 
  Clock, 
  AlertCircle,
  PlusCircle,
  ChevronRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

export const OverviewTab: React.FC = () => {
  const navigate = useNavigate();
  const { profile, songs, requests, releases, subscription } = useApp();

  const totalPlays = songs.reduce((acc, song) => acc + song.playCount, 0);
  const pendingRequests = requests.filter(r => r.status === 'nova' || r.status === 'em_negociacao');
  const confirmedPaymentRequests = requests.filter(r => r.status === 'pagamento_confirmado');

  // Top songs
  const topSongs = [...songs].sort((a, b) => b.playCount - a.playCount).slice(0, 3);

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

      {/* Action Alerts / Notices */}
      {confirmedPaymentRequests.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-start sm:items-center justify-between gap-4 text-xs text-emerald-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">
                {confirmedPaymentRequests.length} Pagamento(s) Confirmado(s) Aguardando Liberação!
              </p>
              <p className="text-slate-600 text-xs">
                O comprador efetuou o pagamento direto. Emita o termo de liberação agora.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard/solicitacoes')}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shrink-0 hover:bg-emerald-700 transition"
          >
            Emitir Liberação
          </button>
        </div>
      )}

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
          <p className={`text-xl font-serif italic capitalize ${
            subscription.status === 'active' ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {subscription.status === 'active' ? 'Ativa' : 'Suspensa'}
          </p>
          <span className="text-[10px] text-slate-400 block truncate">
            {subscription.planName}
          </span>
        </div>

      </div>

      {/* GRID: RECENT TRACKS TABLE + EDITORIAL PREVIEW PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* RECENT TRACKS TABLE CONTAINER */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#0A1128]">Catálogo de Obras</h3>
              <p className="text-xs text-slate-400">Visão geral de suas composições recentes</p>
            </div>
            <button
              onClick={() => navigate('/dashboard/musicas')}
              className="text-xs text-amber-600 font-bold hover:text-amber-700 transition"
            >
              Ver todas →
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
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
                        onClick={() => navigate('/dashboard/musicas')}
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
        </div>

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
                <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 mb-4 shadow-xl flex items-center justify-center text-3xl font-serif italic font-bold text-[#0A1128]">
                  {topSongs[0]?.title?.slice(0, 2) || profile.stageName.slice(0, 2)}
                </div>
                <h5 className="text-xl font-serif italic mb-1">{topSongs[0]?.title || 'Seu perfil público'}</h5>
                <p className="text-slate-400 text-xs">{profile.stageName}{topSongs[0] ? ` • ${topSongs[0].genre}` : ''}</p>
                
                {/* Mock Waveform Bars */}
                <div className="flex items-end justify-center gap-1.5 h-12 my-6 w-full">
                  <div className="w-1 bg-amber-500 h-[25%] rounded-full opacity-40" />
                  <div className="w-1 bg-amber-500 h-[45%] rounded-full opacity-60" />
                  <div className="w-1 bg-amber-500 h-[75%] rounded-full" />
                  <div className="w-1 bg-amber-500 h-[95%] rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse" />
                  <div className="w-1 bg-amber-500 h-[65%] rounded-full" />
                  <div className="w-1 bg-amber-500 h-[85%] rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                  <div className="w-1 bg-amber-500 h-[35%] rounded-full opacity-50" />
                  <div className="w-1 bg-amber-500 h-[55%] rounded-full opacity-60" />
                  <div className="w-1 bg-amber-500 h-[80%] rounded-full" />
                  <div className="w-1 bg-amber-500 h-[40%] rounded-full opacity-40" />
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

            <div className="mt-6 pt-4 border-t border-slate-800/80 flex justify-between items-center">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Duração Prévia</p>
                <p className="text-xs text-white font-mono">0:35 / 3:42</p>
              </div>
              <div className="w-8 h-8 rounded-full border border-amber-500/50 flex items-center justify-center text-amber-400">
                <div className="w-2 h-2 bg-amber-500 transform rotate-45 ml-0.5" />
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* RECENT REQUESTS SECTION */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
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
                  <h4 className="font-bold text-slate-900 text-sm">{req.buyerName} ({req.buyerStageName})</h4>
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
                  onClick={() => navigate('/dashboard/solicitacoes')}
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
      </div>

      {/* Ferramenta secundária: fica após os dados comerciais do catálogo. */}
      <MusicPlayer />

    </div>
  );
};
