import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { RequestStatus, Song, SongStatus } from '../../types';
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
import { getSongToggleStatus, validateSongSubmission } from '../../lib/songWorkflow';
import { SUBSCRIPTION_STATUS_META } from '../../lib/subscriptionStatus';
import { loadSongDraft, type SongDraftPayload } from '../../lib/database';

type Notice = { type: 'success' | 'error'; message: string } | null;
type SongStatusFilter = 'all' | 'pending_action' | SongStatus;

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
  const { currentUserId, profile, songs, requests, releases, subscription, deleteSong, updateSong, queryMySongs, platformSettings, isAdminAuthenticated } = useApp();
  const subscriptionMeta = SUBSCRIPTION_STATUS_META[subscription.status];

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<SongStatusFilter>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'plays' | 'interest' | 'title'>('recent');
  const [copiedSongId, setCopiedSongId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState<boolean>(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingSongId, setPendingSongId] = useState<string | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const bulkOperationRef = useRef(false);
  const pendingSongIdRef = useRef<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const [expandedHistorySongId, setExpandedHistorySongId] = useState<string | null>(null);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);
  const [page, setPage] = useState(1);
  const [pageSongs, setPageSongs] = useState<Song[]>(songs.slice(0, 12));
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [totalSongs, setTotalSongs] = useState(0);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [unfinishedForm, setUnfinishedForm] = useState<SongDraftPayload | null>(null);
  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    const localKey = `composer-song-draft-${currentUserId}-new`;
    void loadSongDraft(currentUserId, 'new').then(cloudDraft => {
      let draft = cloudDraft;
      try {
        const local = window.localStorage.getItem(localKey);
        if (local) draft = JSON.parse(local) as SongDraftPayload;
      } catch { /* A cópia sincronizada continua disponível. */ }
      if (active) setUnfinishedForm(draft && (draft.title?.trim() || draft.lyrics?.trim()) ? draft : null);
    }).catch(() => {
      try {
        const local = window.localStorage.getItem(localKey);
        const draft = local ? JSON.parse(local) as SongDraftPayload : null;
        if (active) setUnfinishedForm(draft && (draft.title?.trim() || draft.lyrics?.trim()) ? draft : null);
      } catch { if (active) setUnfinishedForm(null); }
    });
    return () => { active = false; };
  }, [currentUserId]);
  const [catalogStats, setCatalogStats] = useState({ published: 0, drafts: 0, pending: 0, rejected: 0, plays: 0, interests: 0, genres: [] as string[] });
  const pageSize = 12;
  const STORAGE_KEY = 'compositor-my-songs-filters-v1';

  // Available genres from current songs
  const genresList = useMemo(() => [...catalogStats.genres].sort((a, b) => a.localeCompare(b, 'pt-BR')), [catalogStats.genres]);
  const filteredSongs = useMemo(() => {
    if (statusFilter !== 'pending_action') return pageSongs;
    return pageSongs.filter(song => song.status === 'pending_approval' || song.status === 'rejected' || !getSongReadiness(song).isReady);
  }, [pageSongs, statusFilter]);
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
      if (parsed.statusFilter === 'all' || parsed.statusFilter === 'pending_action' || parsed.statusFilter === 'draft' || parsed.statusFilter === 'pending_approval' || parsed.statusFilter === 'published' || parsed.statusFilter === 'rejected') {
        setStatusFilter(parsed.statusFilter);
      }
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

  pendingSongIdRef.current = pendingSongId;

  useEffect(() => {
    if (!songToDelete) return;
    const dialog = deleteDialogRef.current;
    const focusable = (): HTMLElement[] => dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'))
      : [];
    window.requestAnimationFrame(() => focusable()[0]?.focus());

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingSongIdRef.current) {
        event.preventDefault();
        setSongToDelete(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown);
      deleteTriggerRef.current?.focus();
    };
  }, [songToDelete]);

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
    if (bulkOperationRef.current || pendingSongId) return;
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

    const songsToUpdate = nextStatus === 'published'
      ? selectedSongs.filter(song => song.status === 'draft' || song.status === 'rejected')
      : selectedSongs.filter(song => song.status !== 'draft');

    if (nextStatus === 'published') {
      const blocked = songsToUpdate.filter(song => !getSongReadiness(song).isReady);
      if (blocked.length > 0) {
        showNotice(`Algumas músicas não estão prontas: ${blocked.map(song => song.title).join(', ')}`, 'error');
        return;
      }
    }

    bulkOperationRef.current = true;
    setIsBulkUpdating(true);
    const failedSongIds: string[] = [];
    let updatedCount = 0;

    try {
      for (const song of songsToUpdate) {
        const targetStatus = nextStatus === 'published'
          ? platformSettings.requireApprovalForNewSongs && !isAdminAuthenticated
            ? 'pending_approval'
            : 'published'
          : 'draft';

        const success = await updateSong(song.id, { status: targetStatus });
        if (success) updatedCount += 1;
        else failedSongIds.push(song.id);
      }

      const skippedCount = selectedSongs.length - songsToUpdate.length;
      const actionDescription = nextStatus === 'draft'
        ? 'movida(s) para rascunho'
        : platformSettings.requireApprovalForNewSongs && !isAdminAuthenticated
          ? 'enviada(s) para aprovação'
          : 'publicada(s)';
      const resultParts = [
        `${updatedCount} ${actionDescription}`,
        skippedCount > 0 ? `${skippedCount} ignorada(s), pois já estavam no status esperado` : '',
        failedSongIds.length > 0 ? `${failedSongIds.length} com falha` : '',
      ].filter(Boolean);

      setSelectedSongIds(failedSongIds);
      if (updatedCount > 0) setRefreshVersion(value => value + 1);
      showNotice(resultParts.join('; ') + '.', failedSongIds.length > 0 ? 'error' : 'success');
    } finally {
      bulkOperationRef.current = false;
      setIsBulkUpdating(false);
    }
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
    const canShare = typeof navigator.share === 'function';
    try {
      if (canShare) await navigator.share({ title: song.title, text: `Ouça ${song.title}`, url: link });
      else await navigator.clipboard.writeText(link);
      setCopiedSongId(song.id);
      showNotice(canShare ? `Link de “${song.title}” compartilhado.` : `Link de “${song.title}” copiado.`);
      setTimeout(() => setCopiedSongId(null), 3000);
    } catch {
      showNotice('Não foi possível compartilhar o link. Tente novamente.', 'error');
    }
  };

  const requestDeleteSong = (song: Song) => {
    if (bulkOperationRef.current) return;
    const hasHistory = requests.some(request => request.songId === song.id) || releases.some(release => release.songId === song.id);
    if (hasHistory) {
      showNotice(`“${song.title}” possui solicitações ou liberações e não pode ser excluída. Mova-a para rascunho.`, 'error');
      return;
    }
    deleteTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSongToDelete(song);
  };

  const confirmDeleteSong = async () => {
    if (!songToDelete || pendingSongId || bulkOperationRef.current) return;
    const song = songToDelete;
    setPendingSongId(song.id);
    try {
      const deleted = await deleteSong(song.id);
      setSongToDelete(null);
      if (deleted) setRefreshVersion(value => value + 1);
      showNotice(deleted ? `“${song.title}” foi excluída.` : `Não foi possível excluir “${song.title}”.`, deleted ? 'success' : 'error');
    } catch {
      showNotice(`Não foi possível excluir “${song.title}”.`, 'error');
    } finally {
      setPendingSongId(null);
    }
  };

  const toggleStatus = async (song: Song) => {
    if (pendingSongId || bulkOperationRef.current) return;
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
    try {
      const updated = await updateSong(song.id, { status: newStatus });
      if (updated) setRefreshVersion(value => value + 1);
      const successMessage = newStatus === 'published' ? `“${song.title}” foi publicada.`
        : newStatus === 'pending_approval' ? `“${song.title}” foi enviada para aprovação.`
        : `“${song.title}” foi movida para rascunho.`;
      showNotice(updated ? successMessage : `Não foi possível atualizar “${song.title}”.`, updated ? 'success' : 'error');
    } catch {
      showNotice(`Não foi possível atualizar “${song.title}”.`, 'error');
    } finally {
      setPendingSongId(null);
    }
  };

  const formatDate = (date: string) => {
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

  const getSongReadiness = (song: Song) => {
    const validation = validateSongSubmission({
      title: song.title,
      authors: song.authors,
      lyrics: song.lyrics,
      dateComposed: song.dateComposed,
      status: 'published',
      valueType: song.valueType,
      suggestedValue: song.suggestedValue,
      previewAudioUrl: song.previewAudioUrl,
    });
    const fieldLabels = {
      title: 'título',
      authors: 'autores',
      lyrics: 'letra',
      dateComposed: 'data da composição válida',
      suggestedValue: 'valor sugerido válido',
      previewAudioUrl: 'prévia pública',
    } as const;
    const missing: string[] = [];

    if (!validation.isValid) {
      missing.push(validation.field ? fieldLabels[validation.field] : 'dados obrigatórios válidos');
    }
    if (subscription.status !== 'active') missing.push('assinatura ativa');

    return {
      isReady: missing.length === 0,
      missing,
      validationMessage: validation.error,
    };
  };

  const getSongStatusGuidance = (song: Song) => {
    const readiness = getSongReadiness(song);
    if (!readiness.isReady) {
      return {
        title: 'Complete o cadastro',
        description: readiness.validationMessage || `Falta adicionar: ${readiness.missing.join(', ')}.`,
        action: 'Resolver pendências',
        tone: 'warning' as const,
      };
    }
    if (song.status === 'pending_approval') {
      return {
        title: 'Aguardando análise',
        description: 'A música será publicada após a revisão da equipe. Você pode conferir os dados enviados.',
        action: 'Conferir cadastro',
        tone: 'info' as const,
      };
    }
    if (song.status === 'rejected') {
      return {
        title: 'Revisão necessária',
        description: song.notes
          ? `Parecer da moderação: "${song.notes}"`
          : 'Revise os dados e arquivos da música antes de enviá-la novamente para análise.',
        action: 'Revisar e reenviar',
        tone: 'danger' as const,
      };
    }
    if (song.status === 'published') {
      return {
        title: 'Visível no perfil público',
        description: 'A música já pode ser ouvida e compartilhada com intérpretes.',
        action: 'Ver no perfil',
        tone: 'success' as const,
      };
    }
    return {
      title: 'Pronta para publicação',
      description: platformSettings.requireApprovalForNewSongs && !isAdminAuthenticated
        ? 'Todos os dados estão completos. Envie a música para análise.'
        : 'Todos os dados estão completos. Publique a música no perfil.',
      action: platformSettings.requireApprovalForNewSongs && !isAdminAuthenticated ? 'Enviar para análise' : 'Publicar agora',
      tone: 'neutral' as const,
    };
  };

  const handlePrimarySongAction = (song: Song) => {
    const readiness = getSongReadiness(song);
    if (song.status === 'published') {
      navigate(`/compositor/${profile.username}?musica=${song.id}`);
      return;
    }
    if (song.status === 'draft' && readiness.isReady) {
      void toggleStatus(song);
      return;
    }
    navigate(`/dashboard/musicas/${song.id}/editar`);
  };

  const getSongHistory = (song: Song) => {
    const requestStatusLabel: Record<RequestStatus, string> = {
      nova: 'Nova solicitação',
      em_negociacao: 'Em negociação',
      pagamento_pendente: 'Pagamento pendente',
      pagamento_confirmado: 'Pagamento confirmado',
      liberacao_enviada: 'Liberação emitida',
      arquivada: 'Arquivada'
    };

    const events: Array<{ label: string; date: string | null; sortTime: number; tone: 'neutral' | 'info' | 'success' | 'warning' }> = [
      { label: 'Cadastrada', date: formatDate(song.dateRegistered), sortTime: new Date(song.dateRegistered).getTime(), tone: 'neutral' }
    ];

    const latestRequest = requests
      .filter(request => request.songId === song.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (latestRequest) {
      const eventDate = latestRequest.paymentReceivedAt || latestRequest.createdAt;
      events.push({
        label: requestStatusLabel[latestRequest.status],
        date: formatDate(eventDate.slice(0, 10)),
        sortTime: new Date(eventDate).getTime(),
        tone: latestRequest.status === 'pagamento_confirmado' || latestRequest.status === 'liberacao_enviada' ? 'success' : latestRequest.status === 'arquivada' ? 'warning' : 'info'
      });
    }

    const latestRelease = releases
      .filter(release => release.songId === song.id)
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())[0];

    if (latestRelease) {
      events.push({
        label: 'Liberada',
        date: formatDate(latestRelease.issueDate),
        sortTime: new Date(latestRelease.issueDate).getTime(),
        tone: 'success'
      });
    }

    if (song.status === 'pending_approval') {
      events.push({ label: 'Status atual: em análise', date: null, sortTime: Number.POSITIVE_INFINITY, tone: 'info' });
    }

    if (song.status === 'published') {
      events.push({ label: 'Status atual: publicada', date: null, sortTime: Number.POSITIVE_INFINITY, tone: 'success' });
    }

    if (song.status === 'rejected') {
      events.push({ label: 'Status atual: rejeitada', date: null, sortTime: Number.POSITIVE_INFINITY, tone: 'warning' });
    }

    if (song.status === 'draft') {
      events.push({ label: 'Status atual: rascunho', date: null, sortTime: Number.POSITIVE_INFINITY, tone: 'neutral' });
    }

    return events
      .sort((a, b) => a.sortTime - b.sortTime)
      .slice(-4);
  };

  const blockedSongs = useMemo(
    () => pageSongs
      .map(song => ({ song, readiness: getSongReadiness(song) }))
      .filter(({ readiness }) => !readiness.isReady)
      .slice(0, 4),
    [pageSongs, subscription.status]
  );

  const actionableCount = useMemo(
    () => pageSongs.filter(song => song.status === 'pending_approval' || song.status === 'rejected' || !getSongReadiness(song).isReady).length,
    [pageSongs, subscription.status]
  );

  const missingCriticalCount = useMemo(
    () => pageSongs.filter(song => !getSongReadiness(song).isReady).length,
    [pageSongs, subscription.status]
  );

  const pendingApprovalCount = useMemo(
    () => pageSongs.filter(song => song.status === 'pending_approval').length,
    [pageSongs]
  );

  const readyToPublishCount = useMemo(
    () => pageSongs.filter(song =>
      (song.status === 'draft' || song.status === 'rejected') && getSongReadiness(song).isReady
    ).length,
    [pageSongs, subscription.status]
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
          ['Prontas nesta página', readyToPublishCount.toLocaleString('pt-BR')]
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3"><span className="block text-[11px] uppercase tracking-wider text-slate-500">{label}</span><strong className="mt-1 block text-xl text-white">{value}</strong></div>)}
      </div>
      {unfinishedForm && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong className="text-sm text-amber-100">Cadastro não concluído: {unfinishedForm.title?.trim() || 'Sem título'}</strong>
            <p className="mt-1 text-xs text-amber-100/80">O formulário é recuperável, mas esta música ainda não foi salva no catálogo. Por isso não entra em “Rascunhos” nem em “Em análise”. O áudio pode precisar ser selecionado novamente.</p>
          </div>
          <button type="button" onClick={() => navigate('/dashboard/musicas/nova')} className="shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300">Continuar cadastro</button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Ações recomendadas</p>
            <h2 className="mt-1 text-base font-bold text-white">Próximo passo do catálogo</h2>
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
            prioridade
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-emerald-300">Publicar agora</p>
            <strong className="mt-2 block text-2xl text-white">{readyToPublishCount}</strong>
            <span className="text-xs text-slate-400">músicas prontas nesta página</span>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-amber-300">Completar dados</p>
            <strong className="mt-2 block text-2xl text-white">{missingCriticalCount}</strong>
            <span className="text-xs text-slate-400">cadastros incompletos nesta página</span>
          </div>

          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-sky-300">Em análise</p>
            <strong className="mt-2 block text-2xl text-white">{pendingApprovalCount}</strong>
            <span className="text-xs text-slate-400">aguardando revisão nesta página</span>
          </div>
        </div>
      </div>

      {actionableCount > 0 && (
        <div className="rounded-2xl border-2 border-amber-500/60 bg-slate-900 p-5 shadow-2xl space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border-2 border-amber-500/50 text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <strong className="text-base md:text-lg font-black text-white block tracking-tight">
                  Visão operacional de pendências
                </strong>
                <p className="text-xs md:text-sm font-semibold text-slate-200">
                  {actionableCount} {actionableCount === 1 ? 'item pede' : 'itens pedem'} atenção antes do próximo ciclo de publicação.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-slate-950 shadow-md uppercase tracking-wider">
                {pageSongs.filter(song => song.status === 'pending_approval').length} em análise
              </span>
              <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-black text-white shadow-md uppercase tracking-wider">
                {pageSongs.filter(song => !getSongReadiness(song).isReady).length} sem dados críticos
              </span>
            </div>
          </div>

          {blockedSongs.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {blockedSongs.map(({ song, readiness }) => (
                <div
                  key={song.id}
                  onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)}
                  className="group rounded-xl border-2 border-slate-700 bg-slate-950 p-4 hover:border-amber-400 hover:bg-slate-950 transition cursor-pointer shadow-lg"
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(`/dashboard/musicas/${song.id}/editar`); }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-black text-white group-hover:text-amber-300 transition-colors">
                      {song.title}
                    </span>
                    <span className="rounded-md bg-amber-400 px-2.5 py-1 text-xs font-black text-slate-950 uppercase tracking-wider shadow">
                      FALTAM {readiness.missing.length}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {readiness.missing.map(item => (
                      <span key={item} className="inline-flex items-center rounded-md bg-rose-600 px-2.5 py-1 text-xs font-black text-white uppercase tracking-wider shadow">
                        Falta: {item}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/musicas/${song.id}/editar`);
                      }}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950 transition shadow cursor-pointer"
                    >
                      Completar dados →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`rounded-2xl border-2 p-4 text-sm flex items-center justify-between gap-4 shadow-xl ${
            notice.type === 'error'
              ? 'bg-slate-900 border-red-500 text-white'
              : 'bg-slate-900 border-emerald-500 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border-2 flex-shrink-0 ${
                notice.type === 'error'
                  ? 'bg-red-500/20 border-red-500/60 text-red-400'
                  : 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
              }`}
            >
              {notice.type === 'error' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <Check className="w-5 h-5" />
              )}
            </div>
            <div>
              <span className={`text-xs font-black uppercase tracking-wider block ${notice.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                {notice.type === 'error' ? 'Não foi possível publicar' : 'Sucesso'}
              </span>
              <p className="text-sm md:text-base font-black text-white mt-0.5">
                {notice.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Fechar aviso"
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* MUSIC PLAYER STUDIO SECTION */}
      {showPlayer && (
        <MusicPlayer onCatalogChange={() => setRefreshVersion(value => value + 1)} />
      )}

      {/* Filters and Controls */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setStatusFilter('all'); setPage(1); }}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${statusFilter === 'all' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'}`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter('pending_action'); setPage(1); }}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${statusFilter === 'pending_action' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-950 text-slate-300 hover:text-white'}`}
            >
              Pendências
            </button>
            {readyToPublishCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setSearchTerm('');
                  setGenreFilter('all');
                  setPage(1);
                }}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-500/15"
              >
                Prontas: {readyToPublishCount}
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-end sm:self-auto">
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

        {/* Search & Dropdowns Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
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

          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Filtrar por gênero"
              value={genreFilter}
              onChange={e => { setGenreFilter(e.target.value); setPage(1); }}
              className="flex-1 sm:flex-none bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="all">Todos os Gêneros</option>
              {genresList.map((g, idx) => (
                <option key={idx} value={g}>{g}</option>
              ))}
            </select>

            <select
              aria-label="Filtrar por status"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as SongStatusFilter); setPage(1); }}
              className="flex-1 sm:flex-none bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="all">Todos os Status</option>
              <option value="pending_action">Pendências</option>
              <option value="published">Publicada</option>
              <option value="pending_approval">Em análise</option>
              <option value="rejected">Rejeitada</option>
              <option value="draft">Rascunho</option>
            </select>

            <select
              aria-label="Ordenar músicas"
              value={sortBy}
              onChange={e => { setSortBy(e.target.value as typeof sortBy); setPage(1); }}
              className="flex-1 sm:flex-none bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="recent">Mais recentes</option>
              <option value="plays">Mais reproduzidas</option>
              <option value="interest">Mais interessados</option>
              <option value="title">Título A–Z</option>
            </select>

            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="px-3 py-2 text-xs font-semibold text-amber-400 hover:text-amber-300 shrink-0">
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {selectedSongIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3">
          <span className="text-xs text-slate-300">
            {selectedSongIds.length} selecionada{selectedSongIds.length > 1 ? 's' : ''}
          </span>
          <button type="button" onClick={selectVisibleSongs} disabled={isBulkUpdating} className="rounded-xl border border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50">
            Selecionar visíveis
          </button>
          <button type="button" onClick={() => void handleBulkStatusChange('published')} disabled={isBulkUpdating || Boolean(pendingSongId)} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-50">
            {isBulkUpdating && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {isBulkUpdating ? 'Atualizando...' : 'Publicar seleção'}
          </button>
          <button type="button" onClick={() => void handleBulkStatusChange('draft')} disabled={isBulkUpdating || Boolean(pendingSongId)} className="rounded-xl bg-slate-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-slate-600 disabled:cursor-wait disabled:opacity-50">
            Mover para rascunho
          </button>
          <button type="button" onClick={clearSelection} disabled={isBulkUpdating} className="rounded-xl border border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50">
            Limpar seleção
          </button>
        </div>
      )}

      {/* Songs Display */}
      {isPageLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-label="Carregando catálogo de músicas">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 animate-pulse">
              <div className="rounded-2xl h-40 bg-slate-950 border border-slate-800 flex items-center justify-center">
                <LoaderCircle className="w-6 h-6 text-amber-500/60 dark:text-amber-400/80 animate-spin" />
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-slate-800 rounded w-3/4" />
                <div className="h-3 bg-slate-800/60 rounded w-1/2" />
              </div>
              <div className="pt-2 flex gap-2">
                <div className="h-5 w-20 bg-slate-800/80 rounded-md" />
                <div className="h-5 w-24 bg-slate-800/80 rounded-md" />
              </div>
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="h-7 w-28 bg-slate-800 rounded-lg" />
                <div className="h-7 w-12 bg-slate-800 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
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
                      disabled={isBulkUpdating}
                      aria-label={`Selecionar ${song.title}`}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 disabled:cursor-wait disabled:opacity-50"
                    />
                    Selecionar
                  </label>
                </div>

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

                <div className="space-y-1.5 text-xs text-slate-400">
                  <p>Autores: <strong className="text-slate-200">{song.authors}</strong></p>
                  <p>Cadastro: <strong className="text-slate-200">{formatDate(song.dateRegistered)}</strong></p>
                  <div className="flex items-center gap-4 pt-1 font-semibold">
                    <span className="text-amber-400">{song.playCount} reproduções</span>
                    <span className="text-emerald-400">{song.interestedCount} interessados</span>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">Histórico</span>
                      <button
                        type="button"
                        onClick={() => setExpandedHistorySongId(current => current === song.id ? null : song.id)}
                        className="text-[10px] font-semibold text-amber-300 hover:text-amber-200"
                      >
                        {expandedHistorySongId === song.id ? 'Ocultar' : 'Detalhes'}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {getSongHistory(song).map(event => (
                        <div key={`${song.id}-${event.label}-${event.date}`} className="flex items-start gap-2 text-[10px] text-slate-300">
                          <span className={`mt-0.5 h-2 w-2 rounded-full ${
                            event.tone === 'success' ? 'bg-emerald-400' :
                            event.tone === 'warning' ? 'bg-red-400' :
                            event.tone === 'info' ? 'bg-amber-400' : 'bg-slate-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <span className="block truncate text-slate-200">{event.label}</span>
                            <span className="text-slate-500">{event.date || 'Data do evento não registrada'}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {expandedHistorySongId === song.id && (
                      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-[10px] text-slate-300">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="font-semibold uppercase tracking-wide text-amber-300">Pendências</span>
                          <span className={`font-semibold ${getSongReadiness(song).isReady ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {getSongReadiness(song).isReady ? 'Pronta' : `${getSongReadiness(song).missing.length} faltando`}
                          </span>
                        </div>
                        {getSongReadiness(song).isReady ? (
                          <p className="text-emerald-200">Tudo pronto para publicar e receber interessados.</p>
                        ) : (
                          <ul className="list-disc space-y-1 pl-4 text-amber-100/80">
                            {getSongReadiness(song).missing.map(item => (
                              <li key={`${song.id}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
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

                <div className={`rounded-xl border p-3 ${
                  getSongStatusGuidance(song).tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10' :
                  getSongStatusGuidance(song).tone === 'danger' ? 'border-red-500/30 bg-red-500/10' :
                  getSongStatusGuidance(song).tone === 'warning' ? 'border-amber-500/30 bg-amber-500/10' :
                  getSongStatusGuidance(song).tone === 'info' ? 'border-blue-500/30 bg-blue-500/10' :
                  'border-slate-700 bg-slate-950/70'
                }`}>
                  <p className={`text-xs font-bold ${
                    getSongStatusGuidance(song).tone === 'success' ? 'text-emerald-300' :
                    getSongStatusGuidance(song).tone === 'danger' ? 'text-red-300' :
                    getSongStatusGuidance(song).tone === 'warning' ? 'text-amber-300' :
                    getSongStatusGuidance(song).tone === 'info' ? 'text-blue-300' : 'text-white'
                  }`}>{getSongStatusGuidance(song).title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{getSongStatusGuidance(song).description}</p>
                  <button
                    type="button"
                    onClick={() => handlePrimarySongAction(song)}
                    disabled={isBulkUpdating || pendingSongId === song.id}
                    className="mt-3 min-h-9 w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:cursor-wait disabled:opacity-50"
                  >
                    {pendingSongId === song.id ? 'Atualizando...' : getSongStatusGuidance(song).action}
                  </button>
                </div>

                <div className="flex items-center justify-end border-t border-slate-800 pt-3 text-xs">
                  <details className="group relative">
                    <summary className="min-h-10 cursor-pointer list-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 font-bold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                      Mais opções
                    </summary>
                    <div className="absolute bottom-12 right-0 z-20 w-56 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-1.5 shadow-2xl">
                      <button type="button" onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-slate-200 hover:bg-slate-800"><Edit3 className="h-4 w-4" />Editar música</button>
                      <button type="button" onClick={() => navigate(`/compositor/${profile.username}?musica=${song.id}`)} disabled={song.status !== 'published'} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"><Eye className="h-4 w-4" />Ver no perfil</button>
                      <button type="button" onClick={() => handleShareSong(song)} disabled={pendingSongId === song.id || song.status !== 'published'} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{copiedSongId === song.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}{copiedSongId === song.id ? 'Link copiado' : 'Compartilhar'}</button>
                      <button type="button" onClick={() => void toggleStatus(song)} disabled={isBulkUpdating || pendingSongId === song.id} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50">{song.status === 'published' ? <Globe className="h-4 w-4 text-emerald-400" /> : <Lock className="h-4 w-4" />}{song.status === 'pending_approval' ? 'Cancelar análise' : song.status === 'published' ? 'Mover para rascunho' : 'Enviar para publicação'}</button>
                      <button type="button" onClick={() => requestDeleteSong(song)} disabled={isBulkUpdating || pendingSongId === song.id} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-red-300 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50"><Trash2 className="h-4 w-4" />Excluir música</button>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto no-scrollbar">
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
                          disabled={isBulkUpdating}
                          aria-label={`Selecionar ${song.title}`}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 disabled:cursor-wait disabled:opacity-50"
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
                      <div className="max-w-44">
                        <span className={`inline-block border px-2 py-0.5 rounded text-[10px] font-bold uppercase ${songStatusClass[song.status]}`}>
                          {songStatusLabel[song.status]}
                        </span>
                        <span className="mt-1.5 block text-[10px] leading-snug text-slate-400">{getSongStatusGuidance(song).title}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right space-x-1">
                      {!getSongReadiness(song).isReady && (
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/musicas/${song.id}/editar`)}
                          aria-label={`Resolver pendências de ${song.title}`}
                          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300 hover:bg-amber-500/20"
                          title="Resolver pendências"
                        >
                          Resolver
                        </button>
                      )}
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
                        disabled={isBulkUpdating || pendingSongId === song.id}
                        aria-label={song.status === 'published' || song.status === 'pending_approval' ? `Mover ${song.title} para rascunho` : `Enviar ${song.title} para publicação`}
                        className="p-1.5 text-slate-400 hover:text-amber-400 disabled:cursor-wait disabled:opacity-50"
                        title={song.status === 'pending_approval' ? 'Cancelar análise' : song.status === 'published' ? 'Mover para rascunho' : 'Enviar para publicação'}
                      >
                        {pendingSongId === song.id ? <LoaderCircle className="w-4 h-4 animate-spin" /> : song.status === 'published' ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDeleteSong(song)}
                        disabled={isBulkUpdating || pendingSongId === song.id}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-song-title" aria-describedby="delete-song-description">
          <div ref={deleteDialogRef} className="w-full max-w-md rounded-3xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-red-500/10 p-2 text-red-400"><AlertTriangle className="h-5 w-5" /></div><div><h2 id="delete-song-title" className="font-bold text-white">Excluir música definitivamente?</h2><p id="delete-song-description" className="mt-2 text-sm leading-relaxed text-slate-400">“{songToDelete.title}” será removida do catálogo. Essa ação não pode ser desfeita.</p></div></div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setSongToDelete(null)} disabled={pendingSongId === songToDelete.id} className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancelar</button><button type="button" onClick={() => void confirmDeleteSong()} disabled={pendingSongId === songToDelete.id} className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-400 disabled:cursor-wait disabled:opacity-60">{pendingSongId === songToDelete.id && <LoaderCircle className="h-4 w-4 animate-spin" />}Excluir música</button></div>
          </div>
        </div>
      )}

    </div>
  );
};
