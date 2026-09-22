import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Song, SongStatus } from '../../types';
import { useAdminToast } from '../../components/admin/AdminToast';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AdminDrawer } from '../../components/admin/AdminDrawer';
import { AdminPagination } from '../../components/admin/AdminPagination';
import { AdminBulkBar } from '../../components/admin/AdminBulkBar';
import { AdminWaveformPlayer } from '../../components/admin/AdminWaveformPlayer';
import { AdminDateRangeFilter, DateFilterPreset, filterByDatePreset } from '../../components/admin/AdminDateRangeFilter';
import { useDebounce } from '../../hooks/useDebounce';
import { 
  Music, 
  Search, 
  Play, 
  Pause, 
  Sparkles, 
  Eye, 
  Trash2, 
  CheckCircle2, 
  Lock, 
  Globe, 
  FileText, 
  Tag, 
  X, 
  Volume2, 
  VolumeX,
  Download, 
  Check, 
  Clock, 
  AlertCircle, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  CheckSquare, 
  Square 
} from 'lucide-react';

type SortField = 'title' | 'authors' | 'genre' | 'playCount' | 'suggestedValue' | 'status' | 'dateRegistered';
type SortOrder = 'asc' | 'desc';

export const AdminSongsTab: React.FC = () => {
  const { 
    adminSongs: songs,
    moderateSong,
    featuredSongIds, 
    toggleFeatureSong, 
    adminComposers
  } = useApp();

  const toast = useAdminToast();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const [genreFilter, setGenreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [pendingSongId, setPendingSongId] = useState<string | null>(null);

  // Bulk Selection State
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [bulkActionType, setBulkActionType] = useState<'approve' | 'reject' | null>(null);

  // Sorting & Pagination
  const [sortField, setSortField] = useState<SortField>('dateRegistered');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Confirmation dialogs
  const [songToReject, setSongToReject] = useState<Song | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [bulkRejectionReason, setBulkRejectionReason] = useState('');

  // Audio Playback state
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const MAX_FEATURED_SONGS = 6;

  const genresList = Array.from(new Set(songs.map(s => s.genre)));

  const formatSongPrice = (song: Song) => {
    if (song.valueType === 'suggested' && song.suggestedValue != null) {
      const num = typeof song.suggestedValue === 'number' ? song.suggestedValue : parseFloat(String(song.suggestedValue));
      if (!isNaN(num) && num > 0) {
        return {
          formatted: `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          isFixed: true,
        };
      }
    }
    return {
      formatted: 'Sob Consulta',
      isFixed: false,
    };
  };

  const handleOpenDrawer = (song: Song) => {
    if (audioElement) {
      audioElement.pause();
      setPlayingSongId(null);
    }
    setSelectedSong(song);
  };

  const handlePlayToggle = (song: Song) => {
    if (playingSongId === song.id) {
      if (audioElement) {
        audioElement.pause();
      }
      setPlayingSongId(null);
    } else {
      if (audioElement) {
        audioElement.pause();
      }
      const activeUrl = song.previewAudioUrl || song.audioUrl;
      if (activeUrl) {
        const audio = new Audio(activeUrl);
        const stopAtPreviewLimit = () => {
          if (audio.currentTime >= 60) {
            audio.pause();
            audio.currentTime = 0;
            setPlayingSongId(null);
          }
        };
        audio.addEventListener('timeupdate', stopAtPreviewLimit);
        audio.play().catch(() => {
          toast.error("Erro no Áudio", "Não foi possível reproduzir a prévia da faixa.");
        });
        audio.onended = () => setPlayingSongId(null);
        setAudioElement(audio);
        setPlayingSongId(song.id);
      } else {
        toast.warning("Sem Áudio", "Esta obra não possui arquivo de áudio vinculado.");
      }
    }
  };

  React.useEffect(() => () => {
    audioElement?.pause();
  }, [audioElement]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const handleFeatureToggle = async (song: Song) => {
    const isCurrentlyFeatured = featuredSongIds.includes(song.id);

    if (!isCurrentlyFeatured) {
      if (song.status !== 'published') {
        toast.warning('Ação Necessária', 'Apenas músicas publicadas podem ser colocadas em destaque na Vitrine.');
        return;
      }
      if (!song.previewAudioUrl) {
        toast.warning('Áudio Necessário', 'A música precisa de um arquivo de áudio de prévia pública para ser ouvida na vitrine da Home.');
        return;
      }
      if (featuredSongIds.length >= MAX_FEATURED_SONGS) {
        toast.warning(
          'Limite de Destaques Atingido',
          `A Vitrine Home já possui o limite de ${MAX_FEATURED_SONGS} músicas em destaque. Remova uma das músicas em destaque para adicionar uma nova.`
        );
        return;
      }
    }

    const saved = await toggleFeatureSong(song.id);
    if (!saved) {
      toast.error('Falha ao atualizar', 'O estado anterior do destaque foi mantido.');
      return;
    }
    const willBeFeatured = !isCurrentlyFeatured;
    if (willBeFeatured) {
      toast.success('Em Destaque na Home!', `"${song.title}" foi adicionada à Vitrine Home (${featuredSongIds.length + 1}/${MAX_FEATURED_SONGS}).`);
    } else {
      toast.info('Destaque Removido', `"${song.title}" foi removida da Vitrine Home.`);
    }
  };

  const handleApproveSong = async (song: Song) => {
    if (pendingSongId) return;
    if (!song.previewAudioUrl || !song.lyrics?.trim()) {
      toast.warning('Pré-requisitos Pendentes', 'A música precisa de prévia pública de áudio e letra antes de ser aprovada.');
      return;
    }
    setPendingSongId(song.id);
    try {
      const res = await moderateSong(song.id, 'published');
      if (!res.ok) {
        toast.error('Erro de Moderação', res.error || 'Não foi possível aprovar a obra no banco de dados.');
        return;
      }
      toast.success('Música Aprovada!', `"${song.title}" agora está visível no catálogo público.`);
      if (selectedSong?.id === song.id) {
        setSelectedSong(prev => prev ? { ...prev, status: 'published' } : null);
      }
    } catch (err: any) {
      toast.error('Erro de Moderação', err?.message || 'Não foi possível aprovar a obra.');
    } finally {
      setPendingSongId(null);
    }
  };

  const handleMoveToDraft = async (song: Song) => {
    if (pendingSongId) return;
    setPendingSongId(song.id);
    try {
      const res = await moderateSong(song.id, 'draft');
      if (!res.ok) {
        toast.error('Erro de Moderação', res.error || 'Não foi possível alterar o status da obra no banco de dados.');
        return;
      }
      toast.info('Status Alterado', `"${song.title}" retornou ao modo rascunho.`);
      if (selectedSong?.id === song.id) {
        setSelectedSong(prev => prev ? { ...prev, status: 'draft' } : null);
      }
    } catch (err: any) {
      toast.error('Erro de Moderação', err?.message || 'Não foi possível alterar o status da obra.');
    } finally {
      setPendingSongId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!songToReject || pendingSongId) return;
    setPendingSongId(songToReject.id);
    try {
      const reason = rejectionReason.trim() || undefined;
      const res = await moderateSong(songToReject.id, 'rejected', reason);
      if (!res.ok) {
        toast.error('Erro de Moderação', res.error || 'Não foi possível rejeitar a obra no banco de dados.');
        return;
      }
      toast.error('Música Rejeitada', `"${songToReject.title}" foi marcada como rejeitada.`);
      if (selectedSong?.id === songToReject.id) {
        setSelectedSong(prev => prev ? { ...prev, status: 'rejected', notes: reason || prev.notes } : null);
      }
      setSongToReject(null);
      setRejectionReason('');
    } catch (err: any) {
      toast.error('Erro de Moderação', err?.message || 'Não foi possível rejeitar a obra.');
    } finally {
      setPendingSongId(null);
    }
  };

  // Filter and Sort logic
  const filteredAndSortedSongs = useMemo(() => {
    const result = songs.filter(song => {
      const matchesSearch = 
        song.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        song.authors.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        song.genre.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

      const matchesGenre = genreFilter === 'all' || song.genre === genreFilter;
      const matchesStatus = 
        statusFilter === 'all' 
          ? true 
          : statusFilter === 'featured' 
          ? featuredSongIds.includes(song.id) 
          : song.status === statusFilter;
      const matchesDate = filterByDatePreset(song.dateRegistered, datePreset);

      return matchesSearch && matchesGenre && matchesStatus && matchesDate;
    });

    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [songs, debouncedSearchTerm, genreFilter, statusFilter, datePreset, sortField, sortOrder, featuredSongIds]);

  const paginatedSongs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedSongs.slice(start, start + pageSize);
  }, [filteredAndSortedSongs, currentPage, pageSize]);

  // Bulk Selection Handlers
  const isAllSelected = paginatedSongs.length > 0 && paginatedSongs.every(s => selectedSongIds.includes(s.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const paginatedIds = paginatedSongs.map(s => s.id);
      setSelectedSongIds(prev => prev.filter(id => !paginatedIds.includes(id)));
    } else {
      const paginatedIds = paginatedSongs.map(s => s.id);
      setSelectedSongIds(prev => Array.from(new Set([...prev, ...paginatedIds])));
    }
  };

  const handleToggleSelectSong = (id: string) => {
    setSelectedSongIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Bulk Execution Data Helpers
  const selectedSongsList = useMemo(() => {
    return songs.filter(s => selectedSongIds.includes(s.id));
  }, [songs, selectedSongIds]);

  const validForBulkApproval = useMemo(() => {
    return selectedSongsList.filter(s => s.previewAudioUrl && s.lyrics?.trim());
  }, [selectedSongsList]);

  const invalidForBulkApproval = useMemo(() => {
    return selectedSongsList.filter(s => !s.previewAudioUrl || !s.lyrics?.trim());
  }, [selectedSongsList]);

  const handleBulkApprove = async () => {
    if (validForBulkApproval.length === 0) {
      toast.error('Nenhuma Obra Válida', 'Nenhuma das músicas selecionadas possui prévia de áudio e letra para aprovação.');
      setBulkActionType(null);
      return;
    }

    let successCount = 0;
    for (const song of validForBulkApproval) {
      const res = await moderateSong(song.id, 'published');
      if (res.ok) successCount++;
    }

    if (invalidForBulkApproval.length > 0) {
      toast.warning(
        'Aprovação Parcial Concluída',
        `${successCount} obra(s) publicada(s). ${invalidForBulkApproval.length} música(s) foram ignoradas por faltar áudio ou letra.`
      );
    } else {
      toast.success('Obras Aprovadas em Lote!', `${successCount} músicas foram publicadas com sucesso.`);
    }

    setSelectedSongIds([]);
    setBulkActionType(null);
  };

  const handleBulkReject = async () => {
    const reason = bulkRejectionReason.trim() || undefined;
    let count = 0;
    for (const id of selectedSongIds) {
      const res = await moderateSong(id, 'rejected', reason);
      if (res.ok) count++;
    }
    toast.error('Obras Rejeitadas em Lote', `${count} músicas foram marcadas como rejeitadas com justificativa.`);
    setSelectedSongIds([]);
    setBulkRejectionReason('');
    setBulkActionType(null);
  };

  // Export CSV (Full or Selected)
  const handleExportCsv = (onlySelected: boolean = false) => {
    const listToExport = onlySelected 
      ? songs.filter(s => selectedSongIds.includes(s.id))
      : filteredAndSortedSongs;

    if (listToExport.length === 0) {
      toast.warning('Nenhum dado', 'Não há músicas para exportar com os filtros atuais.');
      return;
    }

    const headers = [
      'ID',
      'Titulo',
      'Genero',
      'Autores',
      'Data_Cadastro',
      'Status',
      'Audicoes',
      'Valor_Sugerido_BRL',
      'Em_Destaque'
    ];

    const rows = listToExport.map(s => [
      `"${s.id}"`,
      `"${s.title.replace(/"/g, '""')}"`,
      `"${s.genre}"`,
      `"${s.authors.replace(/"/g, '""')}"`,
      s.dateRegistered,
      s.status,
      s.playCount,
      s.suggestedValue ? s.suggestedValue.toFixed(2) : 'Sob Consulta',
      featuredSongIds.includes(s.id) ? 'Sim' : 'Nao'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_acervo_musicas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório CSV Gerado', `${listToExport.length} músicas exportadas.`);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 inline ml-1 transition" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-amber-400 inline ml-1" />
      : <ArrowDown className="w-3 h-3 text-amber-400 inline ml-1" />;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Music className="w-5 h-5 text-amber-400" />
            <span>Moderação & Acervo Musical</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Supervisione novas composições cadastradas, execute audição com waveform e faça moderação em lote.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          {/* Vitrine Home Counter Badge & Filter Toggle */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter(prev => prev === 'featured' ? 'all' : 'featured');
              setCurrentPage(1);
            }}
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition shadow-sm cursor-pointer ${
              statusFilter === 'featured'
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-amber-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700'
            }`}
            title="Clique para filtrar apenas as músicas em destaque na Vitrine Home"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Vitrine Home: <strong>{featuredSongIds.length}/{MAX_FEATURED_SONGS}</strong></span>
          </button>

          <AdminDateRangeFilter
            activePreset={datePreset}
            onPresetChange={preset => { setDatePreset(preset); setCurrentPage(1); }}
          />

          <button
            onClick={() => handleExportCsv(false)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-2 transition shadow-sm"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar with Debounce */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-lg">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por título, compositor ou estilo musical (com busca instantânea)..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={genreFilter}
            onChange={e => { setGenreFilter(e.target.value); setCurrentPage(1); }}
            aria-label="Filtrar por gênero"
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">Todos os Gêneros ({songs.length} obras)</option>
            {genresList.map(g => {
              const count = songs.filter(s => s.genre === g).length;
              return (
                <option key={g} value={g}>{g} ({count})</option>
              );
            })}
          </select>

          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            aria-label="Filtrar por status"
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">Todos os Status ({songs.length})</option>
            <option value="featured">⭐ Em Destaque na Home ({featuredSongIds.length})</option>
            <option value="published">Publicadas ({songs.filter(s => s.status === 'published').length})</option>
            <option value="pending_approval">Em Análise ({songs.filter(s => s.status === 'pending_approval').length})</option>
            <option value="draft">Rascunhos ({songs.filter(s => s.status === 'draft').length})</option>
            <option value="rejected">Rejeitadas ({songs.filter(s => s.status === 'rejected').length})</option>
          </select>

          {(searchTerm || genreFilter !== 'all' || statusFilter !== 'all' || datePreset !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setGenreFilter('all');
                setStatusFilter('all');
                setDatePreset('all');
                setCurrentPage(1);
              }}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold px-2 py-1 underline transition cursor-pointer"
              title="Limpar todos os filtros ativos"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Songs DataTable with Multi-select */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
        
        {/* Across-page Selection Helper */}
        {isAllSelected && filteredAndSortedSongs.length > paginatedSongs.length && (
          <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-amber-300 animate-fadeIn">
            <span>
              Todas as <strong>{paginatedSongs.length}</strong> músicas desta página estão selecionadas.
              {selectedSongIds.length === filteredAndSortedSongs.length ? (
                <> Todas as <strong>{filteredAndSortedSongs.length}</strong> músicas do filtro atual estão selecionadas.</>
              ) : null}
            </span>
            {selectedSongIds.length < filteredAndSortedSongs.length ? (
              <button
                type="button"
                onClick={() => setSelectedSongIds(filteredAndSortedSongs.map(s => s.id))}
                className="font-bold underline hover:text-white transition cursor-pointer"
              >
                Selecionar todas as {filteredAndSortedSongs.length} músicas deste filtro
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedSongIds([])}
                className="font-bold underline hover:text-white transition cursor-pointer"
              >
                Limpar seleção geral
              </button>
            )}
          </div>
        )}

        <div className="overflow-x-auto touch-scroll [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
          <table className="w-full min-w-[840px] text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="text-slate-400 hover:text-white transition"
                    title={isAllSelected ? "Desmarcar todos" : "Selecionar todos da página"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                </th>
                <th 
                  onClick={() => handleSort('title')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Obra / Capa</span>
                  {renderSortIcon('title')}
                </th>
                <th 
                  onClick={() => handleSort('authors')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Autoria / Gênero</span>
                  {renderSortIcon('authors')}
                </th>
                <th 
                  onClick={() => handleSort('playCount')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Audições</span>
                  {renderSortIcon('playCount')}
                </th>
                <th 
                  onClick={() => handleSort('suggestedValue')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Valor Sugerido</span>
                  {renderSortIcon('suggestedValue')}
                </th>
                <th 
                  onClick={() => handleSort('status')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Moderação / Status</span>
                  {renderSortIcon('status')}
                </th>
                <th className="p-4 text-center">Destaque Home</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {paginatedSongs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <Music className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-300">Nenhuma música encontrada para os filtros selecionados.</p>
                    <p className="text-xs text-slate-500 mt-1">Tente ajustar a busca ou alterar os filtros de status e gênero.</p>
                    {(searchTerm || genreFilter !== 'all' || statusFilter !== 'all' || datePreset !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setGenreFilter('all');
                          setStatusFilter('all');
                          setDatePreset('all');
                          setCurrentPage(1);
                        }}
                        className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer inline-flex items-center gap-2"
                      >
                        <span>Limpar todos os filtros</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedSongs.map(song => {
                  const isPlaying = playingSongId === song.id;
                  const isFeatured = featuredSongIds.includes(song.id);
                  const isSelected = selectedSongIds.includes(song.id);
                  const hasAudio = Boolean(song.previewAudioUrl || song.audioUrl);
                  const price = formatSongPrice(song);

                  return (
                    <tr 
                      key={song.id} 
                      className={`transition ${isSelected ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-slate-800/40'}`}
                    >
                      {/* Checkbox */}
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectSong(song.id)}
                          className="text-slate-400 hover:text-white transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                      </td>
                      
                      {/* Song Cover & Play */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="relative group/play shrink-0">
                            <img 
                              src={song.coverUrl} 
                              alt={song.title} 
                              className="w-12 h-12 rounded-xl object-cover border border-slate-700 shadow-md"
                            />
                            {hasAudio ? (
                              <button
                                type="button"
                                onClick={() => handlePlayToggle(song)}
                                aria-label={isPlaying ? 'Pausar áudio' : 'Ouvir prévia'}
                                className={`absolute inset-0 rounded-xl flex items-center justify-center transition cursor-pointer ${
                                  isPlaying ? 'bg-black/75 opacity-100 ring-2 ring-amber-400' : 'bg-black/60 opacity-0 group-hover/play:opacity-100 text-white'
                                }`}
                              >
                                {isPlaying ? (
                                  <Pause className="w-5 h-5 fill-amber-400 text-amber-400 animate-pulse" />
                                ) : (
                                  <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                                )}
                              </button>
                            ) : (
                              <div 
                                className="absolute inset-0 rounded-xl bg-slate-950/75 backdrop-blur-[1px] flex flex-col items-center justify-center opacity-0 group-hover/play:opacity-100 transition cursor-not-allowed text-slate-400 p-1 text-center"
                                title="Obra sem arquivo de áudio cadastrado"
                              >
                                <VolumeX className="w-4 h-4 text-rose-400/80 mb-0.5" />
                                <span className="text-[8px] font-bold uppercase text-rose-300">Sem Áudio</span>
                              </div>
                            )}

                            {/* Discreet corner badge for songs without audio even when not hovering */}
                            {!hasAudio && (
                              <div 
                                className="absolute -top-1 -right-1 bg-slate-900 text-rose-400 p-0.5 rounded-full border border-rose-500/40 shadow"
                                title="Sem arquivo de áudio anexado"
                              >
                                <VolumeX className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </div>
                          <div>
                            <strong className="text-white text-sm block">“{song.title}”</strong>
                            <span className="text-[11px] text-slate-500 font-mono">Cadastrada em {song.dateRegistered}</span>
                          </div>
                        </div>
                      </td>

                      {/* Authors & Genre */}
                      <td className="p-4 space-y-1">
                        <span className="text-slate-200 block truncate max-w-xs">{song.authors}</span>
                        <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full inline-block">
                          {song.genre}
                        </span>
                      </td>

                      {/* Plays */}
                      <td className="p-4">
                        <span className="text-white font-bold block">{song.playCount}</span>
                        <span className="text-[10px] text-slate-500">audições</span>
                      </td>

                      {/* Price */}
                      <td className="p-4">
                        {price.isFixed ? (
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            {price.formatted}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-medium italic bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/50 inline-block">
                            Sob Consulta
                          </span>
                        )}
                      </td>

                      {/* Status Badge (Pure static indicator - no accidental click triggers) */}
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border select-none ${
                            song.status === 'published'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : song.status === 'pending_approval'
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                              : song.status === 'rejected'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}
                        >
                          {song.status === 'published' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Publicada</span>
                            </>
                          ) : song.status === 'pending_approval' ? (
                            <>
                              <Clock className="w-3 h-3 text-sky-400" />
                              <span>Em Análise</span>
                            </>
                          ) : song.status === 'rejected' ? (
                            <>
                              <X className="w-3 h-3 text-rose-400" />
                              <span>Rejeitada</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>Rascunho</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Featured Toggle */}
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleFeatureToggle(song)}
                          disabled={song.status !== 'published' || (!isFeatured && !song.previewAudioUrl)}
                          className={`p-2 rounded-xl border transition ${
                            song.status !== 'published' || (!isFeatured && !song.previewAudioUrl)
                              ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
                              : isFeatured 
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold cursor-pointer hover:bg-amber-400' 
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700 cursor-pointer'
                          }`}
                          title={
                            song.status !== 'published'
                              ? 'Apenas obras publicadas podem ser colocadas em destaque'
                              : !isFeatured && !song.previewAudioUrl
                              ? 'A obra precisa de áudio de prévia para ser destacada'
                              : isFeatured
                              ? 'Remover dos destaques da Home'
                              : `Colocar em destaque na Home (${featuredSongIds.length}/${MAX_FEATURED_SONGS})`
                          }
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                      </td>

                      {/* Actions - Perfectly balanced and contextual */}
                      <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                        {/* 1. Complete details / moderation drawer (Always present) */}
                        <button
                          type="button"
                          onClick={() => handleOpenDrawer(song)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                          title="Abrir detalhes & gaveta de moderação"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* 2. Primary moderation action based on status */}
                        {song.status === 'published' ? (
                          <button
                            type="button"
                            onClick={() => handleMoveToDraft(song)}
                            disabled={pendingSongId === song.id}
                            className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/30 transition disabled:opacity-50"
                            title="Despublicar (mover para rascunho)"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleApproveSong(song)}
                            disabled={pendingSongId === song.id}
                            className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 transition disabled:opacity-50"
                            title={song.status === 'rejected' ? 'Reavaliar e aprovar obra' : 'Aprovar e publicar obra'}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* 3. Secondary moderation action based on status */}
                        {song.status === 'rejected' ? (
                          <button
                            type="button"
                            onClick={() => handleMoveToDraft(song)}
                            disabled={pendingSongId === song.id}
                            className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/30 transition disabled:opacity-50"
                            title="Mover para rascunho (reabilitar para edição)"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectionReason('');
                              setSongToReject(song);
                            }}
                            disabled={pendingSongId === song.id}
                            className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 transition disabled:opacity-50"
                            title="Rejeitar obra com justificativa"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination */}
        <AdminPagination
          currentPage={currentPage}
          totalItems={filteredAndSortedSongs.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
        />
      </div>

      {/* FLOATING BULK ACTIONS BAR */}
      <AdminBulkBar
        selectedCount={selectedSongIds.length}
        onClearSelection={() => setSelectedSongIds([])}
        itemLabel="músicas"
        actions={[
          {
            id: 'approve',
            label: 'Aprovar Selecionadas',
            icon: <CheckCircle2 className="w-4 h-4" />,
            variant: 'success',
            onClick: () => setBulkActionType('approve')
          },
          {
            id: 'reject',
            label: 'Rejeitar Selecionadas',
            icon: <X className="w-4 h-4" />,
            variant: 'danger',
            onClick: () => setBulkActionType('reject')
          },
          {
            id: 'export',
            label: 'Exportar CSV',
            icon: <Download className="w-4 h-4" />,
            variant: 'secondary',
            onClick: () => handleExportCsv(true)
          }
        ]}
      />

      {/* SONG MODERATION SIDE DRAWER WITH WAVEFORM PLAYER */}
      <AdminDrawer
        isOpen={!!selectedSong}
        onClose={() => setSelectedSong(null)}
        title={selectedSong ? `“${selectedSong.title}”` : 'Moderação de Música'}
        subtitle={selectedSong?.authors}
        icon={<Music className="w-5 h-5" />}
        footer={
          selectedSong && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  Status atual:
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  selectedSong.status === 'published'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : selectedSong.status === 'pending_approval'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : selectedSong.status === 'rejected'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {selectedSong.status === 'published' ? 'Publicada' :
                   selectedSong.status === 'pending_approval' ? 'Em Análise' :
                   selectedSong.status === 'rejected' ? 'Rejeitada' : 'Rascunho'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-end">
                {selectedSong.status !== 'published' ? (
                  <button
                    type="button"
                    onClick={() => handleApproveSong(selectedSong)}
                    disabled={pendingSongId === selectedSong.id}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar & Publicar Obra</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMoveToDraft(selectedSong)}
                    disabled={pendingSongId === selectedSong.id}
                    className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-2 transition disabled:opacity-50"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Mover para Rascunho</span>
                  </button>
                )}

                {selectedSong.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRejectionReason('');
                      setSongToReject(selectedSong);
                    }}
                    disabled={pendingSongId === selectedSong.id}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 flex items-center gap-2 transition disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    <span>Rejeitar Obra</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedSong(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          )
        }
      >
        {selectedSong && (
          <div className="space-y-6 text-xs">
            {/* Song Header Card */}
            <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <img 
                src={selectedSong.coverUrl} 
                alt={selectedSong.title} 
                className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-400 shrink-0"
              />
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 inline-block mb-1">
                  {selectedSong.genre}
                </span>
                <h4 className="font-bold text-white text-base truncate">“{selectedSong.title}”</h4>
                <p className="text-slate-400 mt-0.5 truncate">Autores: {selectedSong.authors}</p>
                <p className="text-slate-500 text-[11px] font-mono mt-1">Registrada em {selectedSong.dateRegistered}</p>
              </div>
            </div>

            {/* Rejection / Moderation Notes if present */}
            {selectedSong.notes && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-1">
                <span className="text-rose-400 font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Observações / Parecer da Moderação:
                </span>
                <p className="text-slate-200 whitespace-pre-line leading-relaxed pl-5 font-medium">
                  {selectedSong.notes}
                </p>
              </div>
            )}

            {/* WAVEFORM AUDIO PLAYER */}
            <AdminWaveformPlayer
              audioUrl={selectedSong.previewAudioUrl || selectedSong.audioUrl}
              title={`Prévia: ${selectedSong.title}`}
              maxPreviewSeconds={60}
              externalStopTrigger={playingSongId}
              onPlayStateChange={(isPlaying) => {
                if (isPlaying && audioElement) {
                  audioElement.pause();
                  setPlayingSongId(null);
                }
              }}
            />

            {/* Quick Financial & Performance Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[11px] block">Audições Acumuladas</span>
                <strong className="text-purple-400 text-base font-bold">{selectedSong.playCount} plays</strong>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[11px] block">Valor Sugerido</span>
                {(() => {
                  const price = formatSongPrice(selectedSong);
                  return price.isFixed ? (
                    <strong className="text-emerald-400 text-base font-mono font-bold">
                      {price.formatted}
                    </strong>
                  ) : (
                    <strong className="text-slate-400 text-sm italic font-medium">
                      Sob Consulta
                    </strong>
                  );
                })()}
              </div>
            </div>

            {/* Full Lyrics View */}
            <div className="space-y-2">
              <span className="font-bold text-white uppercase tracking-wider text-slate-400 text-[11px] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>Letra Completa da Obra</span>
              </span>
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-line leading-relaxed max-h-72 overflow-y-auto">
                {selectedSong.lyrics || 'Letra não informada pelo compositor.'}
              </div>
            </div>

            {/* Destaque Home Shortcut */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <strong className="text-white block">Destaque na Vitrine Home</strong>
                <span className="text-slate-400 text-[11px]">
                  {selectedSong.status !== 'published'
                    ? 'Apenas obras publicadas podem ser colocadas em destaque.'
                    : !selectedSong.previewAudioUrl
                    ? 'A obra precisa de uma prévia de áudio pública para ser destacada.'
                    : `Exibir esta música na seção VIP da Home (${featuredSongIds.length}/${MAX_FEATURED_SONGS} vagas preenchidas).`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleFeatureToggle(selectedSong)}
                disabled={selectedSong.status !== 'published' || (!featuredSongIds.includes(selectedSong.id) && !selectedSong.previewAudioUrl)}
                className={`p-2.5 rounded-xl border transition ${
                  selectedSong.status !== 'published' || (!featuredSongIds.includes(selectedSong.id) && !selectedSong.previewAudioUrl)
                    ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
                    : featuredSongIds.includes(selectedSong.id)
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold cursor-pointer hover:bg-amber-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white cursor-pointer'
                }`}
                title={
                  featuredSongIds.includes(selectedSong.id)
                    ? 'Remover dos destaques da Home'
                    : `Colocar em destaque na Home (${featuredSongIds.length}/${MAX_FEATURED_SONGS})`
                }
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </AdminDrawer>

      {/* CONFIRM SINGLE REJECT DIALOG */}
      <AdminConfirmDialog
        isOpen={!!songToReject}
        title={`Rejeitar a música “${songToReject?.title}”?`}
        description="Esta obra será ocultada da vitrine pública e o autor receberá a notificação de revisão. Informe abaixo a justificativa:"
        confirmLabel="Sim, Rejeitar Obra"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={handleConfirmReject}
        onCancel={() => {
          setSongToReject(null);
          setRejectionReason('');
        }}
      >
        <div className="space-y-2 mt-4 text-left">
          <label className="text-[11px] font-semibold text-slate-300 block">
            Motivo da Rejeição / Instruções para o Compositor:
          </label>
          <textarea
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            placeholder="Ex: Áudio com ruído; letra incompleta; dados cadastrais inconsistentes..."
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none transition resize-none"
          />
        </div>
      </AdminConfirmDialog>

      {/* CONFIRM BULK ACTION DIALOG WITH BREAKDOWN & FEEDBACK */}
      <AdminConfirmDialog
        isOpen={!!bulkActionType}
        title={
          bulkActionType === 'approve'
            ? `Aprovar ${selectedSongIds.length} músicas em lote?`
            : `Rejeitar ${selectedSongIds.length} músicas em lote?`
        }
        description={
          bulkActionType === 'approve'
            ? `Você está prestes a publicar as obras selecionadas no catálogo público do Mercado do Compositor.`
            : `Você está prestes a despublicar e rejeitar ${selectedSongIds.length} músicas. Informe abaixo o parecer/motivo que será enviado aos compositores:`
        }
        confirmLabel={
          bulkActionType === 'approve'
            ? validForBulkApproval.length === 0
              ? 'Nenhuma obra elegível'
              : `Sim, Aprovar ${validForBulkApproval.length} Obra(s) Válida(s)`
            : 'Sim, Rejeitar Todas em Lote'
        }
        cancelLabel="Cancelar"
        variant={bulkActionType === 'approve' ? 'info' : 'warning'}
        onConfirm={bulkActionType === 'approve' ? handleBulkApprove : handleBulkReject}
        onCancel={() => {
          setBulkActionType(null);
          setBulkRejectionReason('');
        }}
      >
        {bulkActionType === 'approve' ? (
          <div className="space-y-3 mt-4 text-left text-xs">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center justify-between">
              <span className="font-semibold">Obras prontas para publicação:</span>
              <strong className="text-sm font-bold">{validForBulkApproval.length} de {selectedSongIds.length}</strong>
            </div>

            {invalidForBulkApproval.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 space-y-1.5">
                <span className="font-bold block text-[11px] uppercase tracking-wider">
                  ⚠️ {invalidForBulkApproval.length} obra(s) ignoradas por falta de áudio ou letra:
                </span>
                <ul className="list-disc pl-4 text-slate-300 space-y-0.5 text-[11px] max-h-24 overflow-y-auto">
                  {invalidForBulkApproval.map(s => (
                    <li key={s.id} className="truncate">
                      “{s.title}” — {s.authors} {!s.previewAudioUrl ? '(sem áudio)' : '(sem letra)'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 mt-4 text-left">
            <label className="text-[11px] font-semibold text-slate-300 block">
              Motivo da Rejeição em Lote / Feedback para os Compositores:
            </label>
            <textarea
              value={bulkRejectionReason}
              onChange={e => setBulkRejectionReason(e.target.value)}
              placeholder="Ex: Áudio com ruído ou fora dos padrões de prévia; dados cadastrais divergentes; necessidade de comprovação autoral..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none transition resize-none"
            />
          </div>
        )}
      </AdminConfirmDialog>

    </div>
  );
};
