import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Song } from '../../types';
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
  X
} from 'lucide-react';

export const MySongsTab: React.FC = () => {
  const navigate = useNavigate();
  const { profile, songs, requests, releases, deleteSong, updateSong } = useApp();

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'plays' | 'interest' | 'title'>('recent');
  const [copiedSongId, setCopiedSongId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Available genres from current songs
  const genresList = Array.from(new Set(songs.map(s => s.genre)));

  // Filter logic
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const filteredSongs = songs.filter(song => {
    const normalizedSearch = normalize(searchTerm);
    const matchesSearch = [song.title, song.authors, song.genre, song.subgenre || '', song.registryCode || '']
      .some(value => normalize(value).includes(normalizedSearch));
    const matchesGenre = genreFilter === 'all' || song.genre === genreFilter;
    const matchesStatus = statusFilter === 'all' || song.status === statusFilter;
    return matchesSearch && matchesGenre && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'plays') return b.playCount - a.playCount;
    if (sortBy === 'interest') return b.interestedCount - a.interestedCount;
    if (sortBy === 'title') return a.title.localeCompare(b.title, 'pt-BR');
    return b.dateRegistered.localeCompare(a.dateRegistered);
  });

  const hasActiveFilters = Boolean(searchTerm) || genreFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setGenreFilter('all');
    setStatusFilter('all');
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3000);
  };

  const handleShareSong = async (song: Song) => {
    const link = `${window.location.origin}/compositor/${profile.username}?musica=${song.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedSongId(song.id);
      showNotice(`Link de “${song.title}” copiado.`);
      setTimeout(() => setCopiedSongId(null), 3000);
    } catch {
      showNotice('Não foi possível copiar o link. Tente novamente.');
    }
  };

  const handleDeleteSong = (songId: string, songTitle: string) => {
    const hasHistory = requests.some(request => request.songId === songId) ||
      releases.some(release => release.songId === songId);
    if (hasHistory) {
      showNotice(`“${songTitle}” possui solicitações ou liberações e não pode ser excluída.`);
      return;
    }
    if (window.confirm(`Tem certeza que deseja excluir a música "${songTitle}" do seu catálogo?`)) {
      deleteSong(songId);
      showNotice(`“${songTitle}” foi excluída.`);
    }
  };

  const toggleStatus = (song: Song) => {
    if (song.status === 'draft' && (!song.title.trim() || !song.lyrics.trim() || !song.audioUrl)) {
      showNotice('Complete título, letra e áudio antes de publicar.');
      return;
    }
    const newStatus = song.status === 'published' ? 'draft' : 'published';
    updateSong(song.id, { status: newStatus });
    showNotice(newStatus === 'published' ? `“${song.title}” foi publicada.` : `“${song.title}” foi movida para rascunho.`);
  };

  const formatDate = (date: string) => {
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

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

      {notice && (
        <div role="status" className="bg-slate-900 border border-amber-500/30 text-slate-200 rounded-2xl px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{notice}</span>
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
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por título ou autor..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Dropdowns & View Mode */}
        <div className="flex items-center gap-2 flex-wrap">
          
          <select
            aria-label="Filtrar por gênero"
            value={genreFilter}
            onChange={e => setGenreFilter(e.target.value)}
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
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todos os Status</option>
            <option value="published">Publicada</option>
            <option value="draft">Rascunho</option>
          </select>

          <select
            aria-label="Ordenar músicas"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
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

      {/* Songs Display */}
      {filteredSongs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <Music2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">
            {songs.length === 0 ? 'Seu catálogo ainda está vazio' : 'Nenhuma música encontrada'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {songs.length === 0
              ? 'Cadastre sua primeira composição para começar a montar o perfil público.'
              : 'Tente alterar os termos de busca ou limpar os filtros aplicados.'}
          </p>
          <button
            type="button"
            onClick={() => songs.length === 0 ? navigate('/dashboard/musicas/nova') : clearFilters()}
            className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
          >
            {songs.length === 0 ? 'Cadastrar primeira música' : 'Limpar filtros'}
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
                
                {/* Top Card Image & Badge */}
                <div className="relative rounded-2xl overflow-hidden h-40 bg-slate-950 border border-slate-800">
                  <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                  
                  <span className={`absolute top-3 right-3 text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border shadow-md ${
                    song.status === 'published' 
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {song.status === 'published' ? 'Publicada' : 'Rascunho'}
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
                    <span className={`px-2 py-1 rounded-lg text-[11px] ${song.audioUrl ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                      {song.audioUrl ? 'Áudio disponível' : 'Sem áudio'}
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
                    onClick={() => navigate(`/compositor/${profile.username}`)}
                    aria-label={`Visualizar ${song.title} no perfil público`}
                    className="p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                    title="Visualizar no perfil público"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleShareSong(song)}
                    aria-label={`Compartilhar ${song.title}`}
                    className="p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                    title="Compartilhar link da música"
                  >
                    {copiedSongId === song.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleStatus(song)}
                    aria-label={song.status === 'published' ? `Mover ${song.title} para rascunho` : `Publicar ${song.title}`}
                    className="p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                    title={song.status === 'published' ? 'Mudar para rascunho' : 'Publicar no perfil'}
                  >
                    {song.status === 'published' ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDeleteSong(song.id, song.title)}
                    aria-label={`Excluir ${song.title}`}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
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
                    <td className="p-4 flex items-center gap-3">
                      <img src={song.coverUrl} alt={song.title} className="w-10 h-10 rounded-xl object-cover" />
                      <div>
                        <strong className="text-white text-sm block">{song.title}</strong>
                        <span className="text-[11px] text-slate-400">{song.authors}</span>
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-amber-400">{song.genre}</td>
                    <td className="p-4 text-slate-400">{formatDate(song.dateRegistered)}</td>
                    <td className="p-4 font-mono">{song.playCount}</td>
                    <td className="p-4 font-mono text-emerald-400">{song.interestedCount}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        song.status === 'published' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {song.status === 'published' ? 'Publicada' : 'Rascunho'}
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
                        onClick={() => navigate(`/compositor/${profile.username}`)}
                        aria-label={`Visualizar ${song.title} no perfil público`}
                        className="p-1.5 text-slate-400 hover:text-white"
                        title="Ver no perfil"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareSong(song)}
                        aria-label={`Compartilhar ${song.title}`}
                        className="p-1.5 text-slate-400 hover:text-white"
                        title="Compartilhar"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(song)}
                        aria-label={song.status === 'published' ? `Mover ${song.title} para rascunho` : `Publicar ${song.title}`}
                        className="p-1.5 text-slate-400 hover:text-amber-400"
                        title={song.status === 'published' ? 'Mover para rascunho' : 'Publicar'}
                      >
                        {song.status === 'published' ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSong(song.id, song.title)}
                        aria-label={`Excluir ${song.title}`}
                        className="p-1.5 text-slate-400 hover:text-red-400"
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

    </div>
  );
};
