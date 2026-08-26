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
  Volume2
} from 'lucide-react';

export const AdminSongsTab: React.FC = () => {
  const { 
    adminSongs: songs,
    moderateSong,
    featuredSongIds, 
    toggleFeatureSong, 
    adminComposers,
    requests,
    releases
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
      if (song.audioUrl) {
        const audio = new Audio(song.audioUrl);
        const stopAtPreviewLimit = () => {
          if (audio.currentTime >= 35) {
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
    if (song.status !== 'published' && (!song.audioUrl || !song.previewAudioUrl || !song.lyrics.trim())) {
      window.alert('A música precisa de áudio original, prévia pública e letra antes de ser aprovada.');
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

  const handleDelete = (song: Song) => {
    const hasHistory = requests.some(request => request.songId === song.id) || releases.some(release => release.songId === song.id);
    if (hasHistory) {
      window.alert('Esta música possui solicitações ou liberações e não pode ser excluída.');
      return;
    }
    if (window.confirm(`Deseja rejeitar a composição "${song.title}" e removê-la do catálogo público?`)) void handleReject(song);
  };

  const filteredSongs = songs.filter(song => {
    const matchesSearch = 
      song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.authors.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (song.registryCode && song.registryCode.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesGenre = genreFilter === 'all' || song.genre === genreFilter;
    const matchesStatus = statusFilter === 'all' || song.status === statusFilter;

    return matchesSearch && matchesGenre && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Music className="w-5 h-5 text-amber-400" />
            <span>Acervo Geral & Moderação de Obras</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Audite composições cadastradas, controle destaques na página inicial e verifique prévias sonoras com restrição de 35 segundos.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
          <span className="text-slate-400">Total no Catálogo:</span>
          <span className="font-bold text-white">{songs.length} faixas</span>
          <span className="text-amber-400 font-bold ml-2">({featuredSongIds.length} em destaque)</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por título da música, autores ou código de registro..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={genreFilter}
            onChange={e => setGenreFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todos os Gêneros</option>
            {genresList.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todos os Status</option>
            <option value="published">Publicadas</option>
            <option value="pending_approval">Aguardando aprovação</option>
            <option value="rejected">Rejeitadas</option>
            <option value="draft">Rascunhos</option>
          </select>
        </div>
      </div>

      {/* Songs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-4 px-6">Música / Capa</th>
                <th className="py-4 px-6">Gênero & Autoria</th>
                <th className="py-4 px-6">Valoração & Disponibilidade</th>
                <th className="py-4 px-6">Audições</th>
                <th className="py-4 px-6 text-center">Destaque Home</th>
                <th className="py-4 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs">
              {filteredSongs.map(song => {
                const isFeatured = featuredSongIds.includes(song.id);
                const isPlaying = playingSongId === song.id;

                return (
                  <tr key={song.id} className="hover:bg-slate-800/40 transition">
                    {/* Song info + Player trigger */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3.5">
                        <div className="relative shrink-0 group">
                          <img 
                            src={song.coverUrl} 
                            alt={song.title} 
                            className="w-12 h-12 rounded-xl object-cover border border-slate-700"
                          />
                          <button
                            onClick={() => handlePlayToggle(song)}
                            className={`absolute inset-0 rounded-xl flex items-center justify-center transition ${
                              isPlaying 
                                ? 'bg-amber-500 text-slate-950' 
                                : 'bg-black/60 opacity-0 group-hover:opacity-100 text-white'
                            }`}
                            title={isPlaying ? "Pausar Prévia" : "Ouvir Prévia (35s)"}
                          >
                            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                          </button>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm truncate">{song.title}</span>
                            <SongStatusBadge status={song.status} />
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{song.summary || song.notes || "Composição com guia acústica disponível."}</p>
                          {song.registryCode && (
                            <span className="text-[10px] text-amber-400 font-mono">Reg: {song.registryCode}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Genre & Authors */}
                    <td className="py-4 px-6">
                      <div>
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-700">
                          {song.genre}
                        </span>
                        <p className="text-slate-400 text-[11px] mt-1.5 truncate max-w-xs">{song.authors}</p>
                      </div>
                    </td>

                    {/* Value & Release Availability */}
                    <td className="py-4 px-6">
                      <div>
                        {song.valueType === 'suggested' && song.suggestedValue ? (
                          <span className="text-emerald-400 font-bold text-xs block">
                            R$ {song.suggestedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium text-xs block">
                            Sob Consulta
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold ${
                          song.isAvailableForRelease ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {song.isAvailableForRelease ? '• Disponível para Gravação' : '• Bloqueada temporariamente'}
                        </span>
                      </div>
                    </td>

                    {/* Audições */}
                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                          <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                          <span>{song.playCount}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">{song.interestedCount} interessados</p>
                      </div>
                    </td>

                    {/* Spotlight toggle */}
                    <td className="py-4 px-6 text-center">
                      <button
                            onClick={() => handleFeatureToggle(song)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 mx-auto transition ${
                          isFeatured
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                        title="Destacar esta composição na página inicial da plataforma"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isFeatured ? 'Destaque ON' : 'Destacar'}</span>
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedSong(song)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                          title="Ver letra completa e detalhes"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => void handlePublicationToggle(song)}
                          disabled={pendingSongId === song.id}
                          className={`p-2 rounded-lg border transition ${
                            song.status === 'published'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                          title={song.status === 'published' ? "Retirar do catálogo público" : "Aprovar e publicar"}
                        >
                          {song.status === 'published' ? <Globe className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </button>

                        {song.status === 'pending_approval' && (
                          <button
                            onClick={() => void handleReject(song)}
                            disabled={pendingSongId === song.id}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 transition disabled:opacity-50"
                            title="Rejeitar e devolver ao compositor"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(song)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
                          title="Rejeitar e remover do catálogo público"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SONG DETAILS MODAL */}
      {selectedSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <img 
                  src={selectedSong.coverUrl} 
                  alt={selectedSong.title} 
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-500/40"
                />
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedSong.title}</h3>
                  <p className="text-xs text-amber-400 font-medium">{selectedSong.genre} • {selectedSong.subgenre || 'Original'}</p>
                  <p className="text-xs text-slate-400">Autoria: {selectedSong.authors}</p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedSong(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Letra da Obra:</span>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {selectedSong.lyrics}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[11px]">Código de Registro ECAD / EDA</span>
                <span className="font-mono text-white">{selectedSong.registryCode || "Não informado"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Data de Registro</span>
                <span className="text-white">{selectedSong.dateRegistered}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedSong(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SongStatusBadge = ({ status }: { status: SongStatus }) => {
  const meta: Record<SongStatus, { label: string; className: string }> = {
    draft: { label: 'Rascunho', className: 'bg-slate-800 text-slate-400 border-slate-700' },
    pending_approval: { label: 'Aguardando aprovação', className: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
    published: { label: 'Pública', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    rejected: { label: 'Rejeitada', className: 'bg-red-500/10 text-red-300 border-red-500/30' }
  };
  return <span className={`${meta[status].className} border text-[10px] font-bold px-1.5 py-0.5 rounded`}>{meta[status].label}</span>;
};
