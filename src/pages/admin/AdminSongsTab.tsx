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

  // Audio Playback state
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const genresList = Array.from(new Set(songs.map(s => s.genre)));

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
        audio.play().catch(e => {
          console.log("Audio play error", e);
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

  const handleFeatureToggle = (song: Song) => {
    if (song.status !== 'published' && !featuredSongIds.includes(song.id)) {
      toast.warning('Ação Necessária', 'Publique a música antes de colocá-la em destaque na Vitrine.');
      return;
    }
    toggleFeatureSong(song.id);
    const willBeFeatured = !featuredSongIds.includes(song.id);
    if (willBeFeatured) {
      toast.success('Em Destaque!', `"${song.title}" foi adicionada aos destaques da Home.`);
    } else {
      toast.info('Destaque Removido', `"${song.title}" foi removida dos destaques.`);
    }
  };

  const handlePublicationToggle = async (song: Song) => {
    if (song.status !== 'published' && (!song.previewAudioUrl || !song.lyrics.trim())) {
      toast.warning('Pré-requisitos Pendentes', 'A música precisa de prévia pública de áudio e letra antes de ser aprovada.');
      return;
    }
    if (song.status === 'published' && featuredSongIds.includes(song.id)) {
      toggleFeatureSong(song.id);
    }
    
    setPendingSongId(song.id);
    const nextStatus = song.status === 'published' ? 'draft' : 'published';
    await moderateSong(song.id, nextStatus);
    setPendingSongId(null);

    if (nextStatus === 'published') {
      toast.success('Música Aprovada!', `"${song.title}" agora está visível no catálogo público.`);
    } else {
      toast.info('Status Alterado', `"${song.title}" retornou ao modo rascunho.`);
    }

    if (selectedSong?.id === song.id) {
      setSelectedSong(prev => prev ? { ...prev, status: nextStatus } : null);
    }
  };

  const handleConfirmReject = async () => {
    if (!songToReject) return;
    setPendingSongId(songToReject.id);
    await moderateSong(songToReject.id, 'rejected');
    setPendingSongId(null);
    toast.error('Música Rejeitada', `"${songToReject.title}" foi marcada como rejeitada.`);
    if (selectedSong?.id === songToReject.id) {
      setSelectedSong(prev => prev ? { ...prev, status: 'rejected' } : null);
    }
    setSongToReject(null);
  };

  // Filter and Sort logic
  const filteredAndSortedSongs = useMemo(() => {
    const result = songs.filter(song => {
      const matchesSearch = 
        song.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        song.authors.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        song.genre.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

      const matchesGenre = genreFilter === 'all' || song.genre === genreFilter;
      const matchesStatus = statusFilter === 'all' || song.status === statusFilter;
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
  }, [songs, debouncedSearchTerm, genreFilter, statusFilter, datePreset, sortField, sortOrder]);

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

  // Bulk Execution
  const handleBulkApprove = async () => {
    for (const id of selectedSongIds) {
      await moderateSong(id, 'published');
    }
    toast.success('Obras Aprovadas em Lote!', `${selectedSongIds.length} músicas foram publicadas.`);
    setSelectedSongIds([]);
    setBulkActionType(null);
  };

  const handleBulkReject = async () => {
    for (const id of selectedSongIds) {
      await moderateSong(id, 'rejected');
    }
    toast.error('Obras Rejeitadas em Lote', `${selectedSongIds.length} músicas foram marcadas como rejeitadas.`);
    setSelectedSongIds([]);
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

        <div className="flex items-center gap-3 self-start sm:self-auto">
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
            <option value="all">Todos os Gêneros ({songs.length})</option>
            {genresList.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            aria-label="Filtrar por status"
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">Todos os Status</option>
            <option value="published">Publicadas (Ativas)</option>
            <option value="draft">Rascunhos</option>
            <option value="rejected">Rejeitadas</option>
          </select>
        </div>
      </div>

      {/* Songs DataTable with Multi-select */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
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
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    Nenhuma música encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedSongs.map(song => {
                  const isPlaying = playingSongId === song.id;
                  const isFeatured = featuredSongIds.includes(song.id);
                  const isSelected = selectedSongIds.includes(song.id);

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
                            <button
                              onClick={() => handlePlayToggle(song)}
                              aria-label={isPlaying ? 'Pausar áudio' : 'Ouvir prévia'}
                              className={`absolute inset-0 rounded-xl flex items-center justify-center transition ${
                                isPlaying ? 'bg-black/70 opacity-100' : 'bg-black/60 opacity-0 group-hover/play:opacity-100 text-white'
                              }`}
                            >
                              {isPlaying ? (
                                <Pause className="w-5 h-5 fill-amber-400 text-amber-400" />
                              ) : (
                                <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                              )}
                            </button>
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
                      <td className="p-4 font-mono font-bold text-emerald-400">
                        {song.valueType === 'suggested' && song.suggestedValue 
                          ? `R$ ${song.suggestedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                          : 'Sob Consulta'}
                      </td>

                      {/* Status Toggle */}
                      <td className="p-4">
                        <button
                          onClick={() => handlePublicationToggle(song)}
                          disabled={pendingSongId === song.id}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition flex items-center gap-1.5 cursor-pointer ${
                            song.status === 'published'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : song.status === 'rejected'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                          }`}
                        >
                          {song.status === 'published' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Publicada</span>
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
                        </button>
                      </td>

                      {/* Featured Toggle */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleFeatureToggle(song)}
                          className={`p-2 rounded-xl border transition cursor-pointer ${
                            isFeatured 
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold' 
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700'
                          }`}
                          title={isFeatured ? 'Remover dos destaques da Home' : 'Colocar em destaque na Home'}
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedSong(song)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                          title="Abrir gaveta de moderação"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSongToReject(song)}
                          className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 transition"
                          title="Rejeitar obra"
                        >
                          <X className="w-4 h-4" />
                        </button>
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
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400 hidden sm:inline">
                Status: <strong className="text-white capitalize font-semibold">{selectedSong.status}</strong>
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {selectedSong.status !== 'published' ? (
                  <button
                    onClick={() => handlePublicationToggle(selectedSong)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar & Publicar Obra</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setSongToReject(selectedSong)}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 flex items-center gap-2 transition"
                  >
                    <X className="w-4 h-4" />
                    <span>Rejeitar Obra</span>
                  </button>
                )}

                <button
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

            {/* WAVEFORM AUDIO PLAYER */}
            <AdminWaveformPlayer
              audioUrl={selectedSong.previewAudioUrl || selectedSong.audioUrl}
              title={`Prévia: ${selectedSong.title}`}
              maxPreviewSeconds={60}
            />

            {/* Quick Financial & Performance Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[11px] block">Audições Acumuladas</span>
                <strong className="text-purple-400 text-base font-bold">{selectedSong.playCount} plays</strong>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[11px] block">Valor Sugerido</span>
                <strong className="text-emerald-400 text-base font-mono font-bold">
                  {selectedSong.valueType === 'suggested' && selectedSong.suggestedValue 
                    ? `R$ ${selectedSong.suggestedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                    : 'Sob Consulta'}
                </strong>
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
                <span className="text-slate-400 text-[11px]">Exibir esta música na seção VIP da página principal.</span>
              </div>
              <button
                onClick={() => handleFeatureToggle(selectedSong)}
                className={`p-2.5 rounded-xl border transition ${
                  featuredSongIds.includes(selectedSong.id)
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
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
        description="Esta obra será ocultada da vitrine pública e marcada com status de rejeitada para revisão pelo autor."
        confirmLabel="Sim, Rejeitar Obra"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={handleConfirmReject}
        onCancel={() => setSongToReject(null)}
      />

      {/* CONFIRM BULK ACTION DIALOG */}
      <AdminConfirmDialog
        isOpen={!!bulkActionType}
        title={bulkActionType === 'approve' ? `Aprovar ${selectedSongIds.length} músicas?` : `Rejeitar ${selectedSongIds.length} músicas?`}
        description={
          bulkActionType === 'approve'
            ? `Todas as ${selectedSongIds.length} músicas selecionadas serão publicadas e ficarão visíveis na vitrine pública do Mercado do Compositor.`
            : `Todas as ${selectedSongIds.length} músicas selecionadas serão despublicadas e marcadas como rejeitadas.`
        }
        confirmLabel={bulkActionType === 'approve' ? 'Sim, Aprovar Todas' : 'Sim, Rejeitar Todas'}
        cancelLabel="Cancelar"
        variant={bulkActionType === 'approve' ? 'info' : 'warning'}
        onConfirm={bulkActionType === 'approve' ? handleBulkApprove : handleBulkReject}
        onCancel={() => setBulkActionType(null)}
      />

    </div>
  );
};
