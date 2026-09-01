import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Song, SongStatus } from '../../types';
import { MusicPlayer } from '../../components/dashboard/MusicPlayer';
import { 
  Music2, 
  Search, 
  LayoutGrid, 
  List, 
  Edit3, 
  Trash2, 
  Eye, 
  Share2, 
  Check, 
  Lock, 
  Globe, 
  PlusCircle,
  Radio,
  X,
  LoaderCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { APP_URL } from '../../config/appConfig';
import { getSongToggleStatus } from '../../lib/songWorkflow';
import { SUBSCRIPTION_STATUS_META } from '../../lib/subscriptionStatus';

type Notice = { type: 'success' | 'error'; message: string } | null;

const songStatusLabel: Record<SongStatus, string> = {
  draft: 'Rascunho', pending_approval: 'Em análise', published: 'Publicada', rejected: 'Rejeitada'
};

const songStatusClass: Record<SongStatus, string> = {
  draft: 'bg-slate-800 text-slate-400 border-slate-700',
  pending_approval: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  published: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/40'
};

export const MySongsTab: React.FC = () => {
  const navigate = useNavigate();
  const { profile, songs, requests, releases, subscription, deleteSong, updateSong, queryMySongs, platformSettings, isAdminAuthenticated } = useApp();
  const subscriptionMeta = SUBSCRIPTION_STATUS_META[subscription.status];

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'plays' | 'interest' | 'title'>('recent');
  const [copiedSongId, setCopiedSongId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState<boolean>(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingSongId, setPendingSongId] = useState<string | null>(null);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);
  const [page, setPage] = useState(1);
  const [pageSongs, setPageSongs] = useState<Song[]>(songs.slice(0, 12));
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [totalSongs, setTotalSongs] = useState(0);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [catalogStats, setCatalogStats] = useState({ published: 0, drafts: 0, pending: 0, rejected: 0, plays: 0, interests: 0, genres: [] as string[] });
  const pageSize = 12;
  const STORAGE_KEY = 'compositor-my-songs-filters-v1';

  // Available genres from current songs
  const genresList = useMemo(() => [...catalogStats.genres].sort((a, b) => a.localeCompare(b, 'pt-BR')), [catalogStats.genres]);
  const filteredSongs = pageSongs;
  const totalPages = Math.max(1, Math.ceil(totalSongs / pageSize));
  const catalogTotal = catalogStats.published + catalogStats.drafts + catalogStats.pending + catalogStats.rejected;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setIsPageLoading(true);
      queryMySongs({ page, pageSize, search: searchTerm, genre: genreFilter, status: statusFilter, sort: sortBy })
        .then(result => {
          if (!active) return;
          setPageSongs(result.songs); setTotalSongs(result.total); setCatalogStats(result.stats);
          const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
          if (page > lastPage) setPage(lastPage);
        })
        .catch(() => active && setNotice({ type: 'error', message: 'Não foi possível carregar esta página do catálogo.' }))
        .finally(() => active && setIsPageLoading(false));
    }, searchTerm ? 300 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [genreFilter, page, queryMySongs, refreshVersion, searchTerm, sortBy, statusFilter]);

  const hasActiveFilters = Boolean(searchTerm) || genreFilter !== 'all' || statusFilter !== 'all';

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { searchTerm?: string; genreFilter?: string; statusFilter?: string; sortBy?: typeof sortBy; viewMode?: 'grid' | 'table' };
      if (typeof parsed.searchTerm === 'string') setSearchTerm(parsed.searchTerm);
      if (typeof parsed.genreFilter === 'string') setGenreFilter(parsed.genreFilter);
      if (typeof parsed.statusFilter === 'string') setStatusFilter(parsed.statusFilter);
      if (parsed.sortBy === 'recent' || parsed.sortBy === 'plays' || parsed.sortBy === 'interest' || parsed.sortBy === 'title') setSortBy(parsed.sortBy);
      if (parsed.viewMode === 'grid' || parsed.viewMode === 'table') setViewMode(parsed.viewMode);
    } catch {
      // Ignora estado salvo inválido e usa valores padrões.
    }
  }, []);

  useEffect(() => {
    const payload = { searchTerm, genreFilter, statusFilter, sortBy, viewMode };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [genreFilter, searchTerm, sortBy, statusFilter, viewMode]);

  useEffect(() => {
    setSelectedSongIds(current => current.filter(id => pageSongs.some(song => song.id === id)));
  }, [pageSongs]);

  const clearFilters = () => {
    setSearchTerm('');
    setGenreFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const toggleSongSelection = (songId: string) => {
    setSelectedSongIds(current => current.includes(songId) ? current.filter(id => id !== songId) : [...current, songId]);
  };

  const selectVisibleSongs = () => {
    setSelectedSongIds(Array.from(new Set([...selectedSongIds, ...filteredSongs.map(song => song.id)])));
  };

  const clearSelection = () => setSelectedSongIds([]);

  const handleBulkStatusChange = async (nextStatus: SongStatus) => {
    if (selectedSongIds.length === 0) {
      showNotice('Selecione ao menos uma música para aplicar a ação.', 'error');
      return;
    }

    const selectedSongs = selectedSongIds
      .map(id => pageSongs.find(song => song.id === id))
      .filter((song): song is Song => Boolean(song));

    if (selectedSongs.length === 0) {
      showNotice('Músicas selecionadas não estão mais disponíveis nesta página.', 'error');
      return;
    }

    if (nextStatus === 'published') {
      const blocked = selectedSongs.filter(song => !getSongReadiness(song).isReady);
      if (blocked.length > 0) {
        showNotice(`Algumas músicas não estão prontas: ${blocked.map(song => song.title).join(', ')}`, 'error');
        return;
      }
    }

    let updatedCount = 0;
    for (const song of selectedSongs) {
      const targetStatus = nextStatus === 'published'
        ? getSongToggleStatus(song.status, platformSettings.requireApprovalForNewSongs, isAdminAuthenticated)
        : 'draft';

      if (targetStatus === song.status) continue;
      const success = await updateSong(song.id, { status: targetStatus });
      if (success) updatedCount += 1;
    }

    setSelectedSongIds([]);
    setRefreshVersion(value => value + 1);

    if (updatedCount > 0) {
      showNotice(nextStatus === 'published'
        ? `${updatedCount} música(s) foram publicadas.`
        : `${updatedCount} música(s) foram movidas para rascunho.`, 'success');
      return;
    }

    showNotice('Nenhuma música foi atualizada.', 'error');
  };

  const showNotice = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3000);
  };

  const handleShareSong = async (song: Song) => {
    if (song.status !== 'published') {
      showNotice('Publique a música antes de compartilhar o link público.', 'error');
      return;
    }
    const link = `${APP_URL}/compositor/${profile.username}?musica=${song.id}`;
    try {
      if (navigator.share) await navigator.share({ title: song.title, text: `Ouça ${song.title}`, url: link });
      else await navigator.clipboard.writeText(link);
      setCopiedSongId(song.id);
      showNotice(navigator.share ? `Link de “${song.title}” compartilhado.` : `Link de “${song.title}” copiado.`);
      setTimeout(() => setCopiedSongId(null), 3000);
    } catch {
      showNotice('Não foi possível compartilhar o link. Tente novamente.', 'error');
    }
  };

  const requestDeleteSong = (song: Song) => {
    const hasHistory = requests.some(request => request.songId === song.id) || releases.some(release => release.songId === song.id);
    if (hasHistory) {
      showNotice(`“${song.title}” possui solicitações ou liberações e não pode ser excluída. Mova-a para rascunho.`, 'error');
      return;
    }
    setSongToDelete(song);
  };

  const confirmDeleteSong = async () => {
    if (!songToDelete) return;
    const song = songToDelete;
    setPendingSongId(song.id);
    const deleted = await deleteSong(song.id);
    setPendingSongId(null); setSongToDelete(null);
    if (deleted) setRefreshVersion(value => value + 1);
    showNotice(deleted ? `“${song.title}” foi excluída.` : `Não foi possível excluir “${song.title}”.`, deleted ? 'success' : 'error');
  };

  const toggleStatus = async (song: Song) => {
    if (song.status !== 'published' && song.status !== 'pending_approval') {
      const readiness = getSongReadiness(song);
      if (!readiness.isReady) {
        const missingText = readiness.missing.map(item => item).join(', ');
        showNotice(`Não foi possível publicar “${song.title}”: faltam ${missingText}.`, 'error');
        return;
      }
    }
    const newStatus = getSongToggleStatus(song.status, platformSettings.requireApprovalForNewSongs, isAdminAuthenticated);
    setPendingSongId(song.id);
    const updated = await updateSong(song.id, { status: newStatus });
    setPendingSongId(null);
    if (updated) setRefreshVersion(value => value + 1);
    const successMessage = newStatus === 'published' ? `“${song.title}” foi publicada.`
      : newStatus === 'pending_approval' ? `“${song.title}” foi enviada para aprovação.`
      : `“${song.title}” foi movida para rascunho.`;
    showNotice(updated ? successMessage : `Não foi possível atualizar “${song.title}”.`, updated ? 'success' : 'error');
  };

  const formatDate = (date: string) => {
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

  const getSongReadiness = (song: Song) => {
    const missing: string[] = [];
    if (!song.title.trim()) missing.push('título');
    if (!song.lyrics.trim()) missing.push('letra');
    if (!song.audioUrl && !song.originalAudioPath) missing.push('áudio original');
    if (!song.previewAudioUrl) missing.push('prévia pública');
    return {
      isReady: missing.length === 0,
      missing
    };
  };

  const readyToPublishCount = useMemo(
    () => pageSongs.filter(song => getSongReadiness(song).isReady).length,
    [pageSongs]
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Minhas Músicas
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Gerencie e organize todo o seu acervo de composições
          </p>
        </div>

        <div className="flex flex-col xs:flex-row sm:items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPlayer(!showPlayer)}
            aria-expanded={showPlayer}
            className={`px-4 py-3 rounded-full border text-xs font-bold flex items-center gap-2 transition ${
              showPlayer 
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>{showPlayer ? 'Ocultar Player Studio' : 'Abrir Player Studio'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/dashboard/musicas/nova')}
            className="px-5 py-3 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Cadastrar Nova Música</span>
          </button>
        </div>
      </div>

      {subscription.status !== 'active' && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div><strong className="block">{subscriptionMeta.label} — catálogo público indisponível</strong><span className="text-xs text-amber-200/80">{subscriptionMeta.description} Você pode continuar organizando seus rascunhos pelo painel.</span></div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Publicadas', catalogStats.published.toLocaleString('pt-BR')],
          ['Rascunhos', catalogStats.drafts.toLocaleString('pt-BR')],
          ['Em análise', catalogStats.pending.toLocaleString('pt-BR')],
          ['Reproduções', catalogStats.plays.toLocaleString('pt-BR')],
          ['Prontas p/ publicar', readyToPublishCount.toLocaleString('pt-BR')]
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3"><span className="block text-[11px] uppercase tracking-wider text-slate-500">{label}</span><strong className="mt-1 block text-xl text-white">{value}</strong></div>)}
      </div>

      {pageSongs.some(song => !getSongReadiness(song).isReady) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong className="block">Checklist de publicação:</strong>
          <span className="text-xs text-amber-200/80">
            {pageSongs.filter(song => !getSongReadiness(song).isReady).length} música(s) ainda precisam de dados antes de entrar no perfil público.
          </span>
        </div>
      )}

      {notice && (
        <div role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-sm flex items-center justify-between gap-3 ${notice.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MUSIC PLAYER STUDIO SECTION */}
      {showPlayer && (
        <MusicPlayer />
      )}

      {/* Filters and Controls */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            aria-label="Buscar músicas"
            type="text"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Buscar por título ou autor..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Dropdowns & View Mode */}
        <div className="flex items-center gap-2 flex-wrap">
          
          <select
            aria-label="Filtrar por gênero"
            value={genreFilter}
            onChange={e => { setGenreFilter(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todos os Gêneros</option>
            {genresList.map((g, idx) => (
              <option key={idx} value={g}>{g}</option>
            ))}
          </select>

          <select
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todos os Status</option>
            <option value="published">Publicada</option>
            <option value="pending_approval">Em análise</option>
            <option value="rejected">Rejeitada</option>
            <option value="draft">Rascunho</option>
          </select>

          <select
            aria-label="Ordenar músicas"
            value={sortBy}
            onChange={e => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="recent">Mais recentes</option>
            <option value="plays">Mais reproduzidas</option>
            <option value="interest">Mais interessados</option>
            <option value="title">Título A–Z</option>
          </select>

          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="px-3 py-2 text-xs font-semibold text-amber-400 hover:text-amber-300">
              Limpar filtros
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Visualizar em cards"
              aria-pressed={viewMode === 'grid'}
              className={`p-1.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
              title="Visualizar em Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-label="Visualizar em tabela"
              aria-pressed={viewMode === 'table'}
              className={`p-1.5 rounded-lg transition ${viewMode === 'table' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
              title="Visualizar em Tabela"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {selectedSongIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3">
          <span className="text-xs text-slate-300">
            {selectedSongIds.length} selecionada{selectedSongIds.length > 1 ? 's' : ''}
          </span>
          <button type="button" onClick={selectVisibleSongs} className="rounded-xl border border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-slate-800">
            Selecionar visíveis
          </button>
          <button type="button" onClick={() => void handleBulkStatusChange('published')} className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-500">
            Publicar seleção
          </button>
          <button type="button" onClick={() => void handleBulkStatusChange('draft')} className="rounded-xl bg-slate-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-slate-600">
            Mover para rascunho
          </button>
          <button type="button" onClick={clearSelection} className="rounded-xl border border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-300 hover:bg-slate-800">
            Limpar seleção
          </button>
        </div>
      )}

      {/* Songs Display */}
      {isPageLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-3xl border border-slate-800 bg-slate-900"><LoaderCircle className="h-7 w-7 animate-spin text-amber-400" /></div>
      ) : filteredSongs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <Music2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">
            {catalogTotal === 0 ? 'Seu catálogo ainda está vazio' : 'Nenhuma música encontrada'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {catalogTotal === 0
              ? 'Cadastre sua primeira composição para começar a montar o perfil público.'
              : 'Tente alterar os termos de busca ou limpar os filtros aplicados.'}
          </p>
          <button
            type="button"
            onClick={() => catalogTotal === 0 ? navigate('/dashboard/musicas/nova') : clearFilters()}
            className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
          >
            {catalogTotal === 0 ? 'Cadastrar primeira música' : 'Limpar filtros'}
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSongs.map(song => (
            <div 
              key={song.id}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl hover:border-slate-700 transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedSongIds.includes(song.id)}
                      onChange={() => toggleSongSelection(song.id)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                    />
                    Selecionar
                  </label>
                </div>

                {/* Top Card Image & Badge */}
                <div className="relative rounded-2xl overflow-hidden h-40 bg-slate-950 border border-slate-800">
                  <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                  
                  <span className={`absolute top-3 right-3 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border shadow-md ${songStatusClass[song.status]}`}>
                    {songStatusLabel[song.status]}
                  </span>

                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                    <div>
                      <span className="text-[10px] text-amber-300 bg-slate-950/80 px-2 py-0.5 rounded uppercase font-semibold">
                        {song.genre}
                      </span>
                      <h3 className="font-bold text-white text-lg leading-tight mt-1 truncate max-w-[200px]">
                        {song.title}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-1.5 text-xs text-slate-400">
                  <p>Autores: <strong className="text-slate-200">{song.authors}</strong></p>
                  <p>Cadastro: <strong className="text-slate-200">{formatDate(song.dateRegistered)}</strong></p>
                  <div className="flex items-center gap-4 pt-1 font-semibold">
                    <span className="text-amber-400">{song.playCount} reproduções</span>
                    <span className="text-emerald-400">{song.interestedCount} interessados</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className={`px-2 py-1 rounded-lg text-[11px] ${song.audioUrl || song.originalAudioPath ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                      {song.audioUrl || song.originalAudioPath ? 'Original protegido' : 'Sem original'}
                    </span>
                    <span className={`px-2 py-1 rounded-lg text-[11px] ${song.previewAudioUrl ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                      {song.previewAudioUrl ? 'Prévia pública pronta' : 'Sem prévia pública'}
                    </span>
                    <span className={`px-2 py-1 rounded-lg text-[11px] ${song.isAvailableForRelease ? 'bg-blue-500/10 text-blue-300' : 'bg-slate-800 text-slate-400'}`}>
                      {song.isAvailableForRelease ? 'Aceita propostas' : 'Indisponível para liberação'}
                    </span>
                    <span className="px-2 py-1 rounded-lg text-[11px] bg-slate-800 text-slate-300">
                      {song.valueType === 'suggested' && song.suggestedValue
                        ? `R$ ${song.suggestedValue.toLocaleString('pt-BR')}`
                        : 'Valor sob consulta'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px]">
                  <span className={getSongReadiness(song).isReady ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
                    {getSongReadiness(song).isReady ? 'Pronta para publicar' : `Falta: ${getSongReadiness(song).missing.slice(0, 2).join(', ')}`}
                  </span>
                  {!getSongReadiness(song).isReady && (
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)}
                      className="text-[10px] uppercase tracking-wide text-amber-300 hover:text-amber-200"
                    >
                      Completar
                    </button>
                  )}
                </div>

              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)}
                    aria-label={`Editar ${song.title}`}
                    className="p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                    title="Editar música"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/compositor/${profile.username}?musica=${song.id}`)}
                    disabled={song.status !== 'published'}
                    aria-label={`Visualizar ${song.title} no perfil público`}
                    className="p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40"
                    title="Visualizar no perfil público"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleShareSong(song)}
                    disabled={pendingSongId === song.id || song.status !== 'published'}
                    aria-label={`Compartilhar ${song.title}`}
                    className="p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40"
                    title="Compartilhar link da música"
                  >
                    {copiedSongId === song.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => void toggleStatus(song)}
                    disabled={pendingSongId === song.id}
                    aria-label={song.status === 'published' || song.status === 'pending_approval' ? `Mover ${song.title} para rascunho` : `Enviar ${song.title} para publicação`}
                    className="p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition disabled:cursor-wait disabled:opacity-50"
                    title={song.status === 'pending_approval' ? 'Cancelar análise' : song.status === 'published' ? 'Mudar para rascunho' : 'Enviar para publicação'}
                  >
                    {pendingSongId === song.id ? <LoaderCircle className="w-4 h-4 animate-spin" /> : song.status === 'published' ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => requestDeleteSong(song)}
                    disabled={pendingSongId === song.id}
                    aria-label={`Excluir ${song.title}`}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition disabled:cursor-wait disabled:opacity-50"
                    title="Excluir música"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="p-4">Música</th>
                  <th className="p-4">Gênero</th>
                  <th className="p-4">Data</th>
                  <th className="p-4">Reproduções</th>
                  <th className="p-4">Interessados</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredSongs.map(song => (
                  <tr key={song.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedSongIds.includes(song.id)}
                          onChange={() => toggleSongSelection(song.id)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                        />
                        <img src={song.coverUrl} alt={song.title} className="w-10 h-10 rounded-xl object-cover" />
                        <div>
                          <strong className="text-white text-sm block">{song.title}</strong>
                          <span className="text-[11px] text-slate-400">{song.authors}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-amber-400">{song.genre}</td>
                    <td className="p-4 text-slate-400">{formatDate(song.dateRegistered)}</td>
                    <td className="p-4 font-mono">{song.playCount}</td>
                    <td className="p-4 font-mono text-emerald-400">{song.interestedCount}</td>
                    <td className="p-4">
                      <span className={`border px-2 py-0.5 rounded text-[10px] font-bold uppercase ${songStatusClass[song.status]}`}>
                        {songStatusLabel[song.status]}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)}
                        aria-label={`Editar ${song.title}`}
                        className="p-1.5 text-slate-400 hover:text-amber-400"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/compositor/${profile.username}?musica=${song.id}`)}
                        disabled={song.status !== 'published'}
                        aria-label={`Visualizar ${song.title} no perfil público`}
                        className="p-1.5 text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        title="Ver no perfil"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareSong(song)}
                        disabled={pendingSongId === song.id || song.status !== 'published'}
                        aria-label={`Compartilhar ${song.title}`}
                        className="p-1.5 text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        title="Compartilhar"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleStatus(song)}
                        disabled={pendingSongId === song.id}
                        aria-label={song.status === 'published' || song.status === 'pending_approval' ? `Mover ${song.title} para rascunho` : `Enviar ${song.title} para publicação`}
                        className="p-1.5 text-slate-400 hover:text-amber-400 disabled:cursor-wait disabled:opacity-50"
                        title={song.status === 'pending_approval' ? 'Cancelar análise' : song.status === 'published' ? 'Mover para rascunho' : 'Enviar para publicação'}
                      >
                        {pendingSongId === song.id ? <LoaderCircle className="w-4 h-4 animate-spin" /> : song.status === 'published' ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDeleteSong(song)}
                        disabled={pendingSongId === song.id}
                        aria-label={`Excluir ${song.title}`}
                        className="p-1.5 text-slate-400 hover:text-red-400 disabled:cursor-wait disabled:opacity-50"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isPageLoading && totalSongs > 0 && (
        <nav aria-label="Paginação do catálogo" className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 sm:flex-row">
          <p className="text-xs text-slate-400">
            Exibindo <strong className="text-white">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalSongs)}</strong> de <strong className="text-white">{totalSongs}</strong> músicas
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1} className="flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Anterior</button>
            <span className="min-w-24 text-center text-xs text-slate-400">Página <strong className="text-white">{page}</strong> de <strong className="text-white">{totalPages}</strong></span>
            <button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Próxima<ChevronRight className="h-4 w-4" /></button>
          </div>
        </nav>
      )}

      {songToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-song-title">
          <div className="w-full max-w-md rounded-3xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-red-500/10 p-2 text-red-400"><AlertTriangle className="h-5 w-5" /></div><div><h2 id="delete-song-title" className="font-bold text-white">Excluir música definitivamente?</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">“{songToDelete.title}” será removida do catálogo. Essa ação não pode ser desfeita.</p></div></div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setSongToDelete(null)} disabled={pendingSongId === songToDelete.id} className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancelar</button><button type="button" onClick={() => void confirmDeleteSong()} disabled={pendingSongId === songToDelete.id} className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-400 disabled:cursor-wait disabled:opacity-60">{pendingSongId === songToDelete.id && <LoaderCircle className="h-4 w-4 animate-spin" />}Excluir música</button></div>
          </div>
        </div>
      )}

    </div>
  );
};
