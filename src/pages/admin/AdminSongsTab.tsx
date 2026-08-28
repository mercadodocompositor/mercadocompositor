import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Song, SongStatus } from '../../types';
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
  AlertCircle
} from 'lucide-react';

export const AdminSongsTab: React.FC = () => {
  const { 
    adminSongs: songs,
    moderateSong,
    featuredSongIds, 
    toggleFeatureSong, 
    adminComposers
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [pendingSongId, setPendingSongId] = useState<string | null>(null);

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
        audio.play().catch(e => console.log("Audio play error", e));
        audio.onended = () => setPlayingSongId(null);
        setAudioElement(audio);
        setPlayingSongId(song.id);
      }
    }
  };

  React.useEffect(() => () => {
    audioElement?.pause();
  }, [audioElement]);

  const handleFeatureToggle = (song: Song) => {
    if (song.status !== 'published' && !featuredSongIds.includes(song.id)) {
      window.alert('Publique a música antes de colocá-la em destaque.');
      return;
    }
    toggleFeatureSong(song.id);
  };

  const handlePublicationToggle = async (song: Song) => {
    if (song.status !== 'published' && (!song.previewAudioUrl || !song.lyrics.trim())) {
      window.alert('A música precisa de prévia pública e letra antes de ser aprovada.');
      return;
    }
    if (song.status === 'published' && featuredSongIds.includes(song.id)) toggleFeatureSong(song.id);
    setPendingSongId(song.id);
    await moderateSong(song.id, song.status === 'published' ? 'draft' : 'published');
    setPendingSongId(null);
  };

  const handleReject = async (song: Song) => {
    setPendingSongId(song.id);
    await moderateSong(song.id, 'rejected');
    setPendingSongId(null);
  };

  // Filter songs
  const filteredSongs = songs.filter(song => {
    const matchesSearch = 
      song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.authors.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.genre.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesGenre = genreFilter === 'all' || song.genre === genreFilter;
    const matchesStatus = statusFilter === 'all' || song.status === statusFilter;

    return matchesSearch && matchesGenre && matchesStatus;
  });

  // Export CSV
  const handleExportCsv = () => {
    if (filteredSongs.length === 0) return;

    const headers = [
      'ID',
      'Titulo',
      'Genero',
      'Autores',
      'Data_Cadastro',
      'Status',
      'Audições',
      'Valor_Sugerido_BRL',
      'Em_Destaque'
    ];

    const rows = filteredSongs.map(s => [
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
            Supervisione novas composições cadastradas, execute audição e configure os destaques da vitrine pública.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-2 transition self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-amber-400" />
          <span>Exportar Acervo CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por título, compositor ou estilo musical..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={genreFilter}
            onChange={e => setGenreFilter(e.target.value)}
            aria-label="Filtrar por gênero"
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todos os Gêneros</option>
            {genresList.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filtrar por status"
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todos os Status</option>
            <option value="published">Publicadas (Ativas)</option>
            <option value="draft">Rascunhos</option>
            <option value="rejected">Rejeitadas</option>
          </select>
        </div>
      </div>

      {/* Songs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-4">Obra / Capa</th>
                <th className="p-4">Autoria / Gênero</th>
                <th className="p-4">Audições</th>
                <th className="p-4">Valor Sugerido</th>
                <th className="p-4">Moderação / Status</th>
                <th className="p-4">Destaque Home</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredSongs.map(song => {
                const isPlaying = playingSongId === song.id;
                const isFeatured = featuredSongIds.includes(song.id);

                return (
                  <tr key={song.id} className="hover:bg-slate-800/40 transition">
                    
                    {/* Song Cover & Play */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="relative group/play shrink-0">
                          <img 
                            src={song.coverUrl} 
                            alt={song.title} 
                            className="w-12 h-12 rounded-xl object-cover border border-slate-700"
                          />
                          <button
                            onClick={() => handlePlayToggle(song)}
                            aria-label={isPlaying ? 'Pausar áudio' : 'Ouvir prévia'}
                            className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center text-white opacity-0 group-hover/play:opacity-100 transition"
                          >
                            {isPlaying ? <Pause className="w-5 h-5 fill-amber-400 text-amber-400" /> : <Play className="w-5 h-5 fill-white" />}
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
                      <span className="text-slate-200 block">{song.authors}</span>
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
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition flex items-center gap-1.5 ${
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
                            <span>Aprovada</span>
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
                    <td className="p-4">
                      <button
                        onClick={() => handleFeatureToggle(song)}
                        className={`p-2 rounded-xl border transition ${
                          isFeatured 
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold' 
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                        title={isFeatured ? 'Remover dos destaques da Home' : 'Colocar em destaque na Home'}
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedSong(song)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                        title="Ver letra e detalhes"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SONG INSPECTION MODAL */}
      {selectedSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto animate-fadeIn">
            
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <img 
                  src={selectedSong.coverUrl} 
                  alt={selectedSong.title} 
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400"
                />
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    {selectedSong.genre}
                  </span>
                  <h3 className="text-xl font-bold text-white mt-1">“{selectedSong.title}”</h3>
                  <p className="text-xs text-slate-400">Autores: {selectedSong.authors}</p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedSong(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lyrics viewer */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                Letra Completa da Obra:
              </span>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto">
                {selectedSong.lyrics || 'Letra não informada pelo compositor.'}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                Status Atual: <strong className="text-white capitalize">{selectedSong.status}</strong>
              </span>

              <div className="flex items-center gap-2">
                {selectedSong.status !== 'published' ? (
                  <button
                    onClick={() => {
                      handlePublicationToggle(selectedSong);
                      setSelectedSong(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shadow-md transition"
                  >
                    Aprovar e Publicar Obra
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      handleReject(selectedSong);
                      setSelectedSong(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-md transition"
                  >
                    Rejeitar / Despublicar
                  </button>
                )}

                <button
                  onClick={() => setSelectedSong(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
