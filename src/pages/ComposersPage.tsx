import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { getPublicComposers } from '../lib/database';
import { getSafePublicBio } from '../lib/profileSanitizer';
import type { FeaturedComposer } from '../types';
import { 
  Search, 
  X, 
  Music, 
  MapPin, 
  Sparkles, 
  ArrowRight, 
  Disc, 
  SlidersHorizontal,
  ArrowLeft,
  Users
} from 'lucide-react';

const GENRE_FILTERS = [
  'Todos',
  'Sertanejo',
  'Bailão',
  'Bandas de Baile',
  'Forró / Piseiro',
  'Arrocha / Brega',
  'Samba / Pagode',
  'Gospel / Cristão',
  'MPB',
  'Pop',
  'Trap / Rap / Hip-Hop',
  'Funk',
  'Rock / Reggae',
  'Música Regional / Gaúcha',
  'Romântico / Seresta'
];

export const ComposersPage: React.FC = () => {
  const [composers, setComposers] = useState<FeaturedComposer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('Todos');
  const [sortBy, setSortBy] = useState<'songs' | 'name'>('songs');

  useEffect(() => {
    document.title = 'Compositores em Destaque | Mercado do Compositor';
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getPublicComposers({ limit: 100 })
      .then(data => {
        if (active) setComposers(data);
      })
      .catch(() => {
        if (active) setComposers([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filteredComposers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = composers.filter(comp => {
      // Filtro de gênero
      if (selectedGenre !== 'Todos') {
        const matchesGenre = comp.genres?.some(g => 
          g.toLowerCase().includes(selectedGenre.toLowerCase()) || 
          selectedGenre.toLowerCase().includes(g.toLowerCase())
        );
        if (!matchesGenre) return false;
      }
      // Filtro de busca textual
      if (q) {
        const nameMatch = comp.name?.toLowerCase().includes(q);
        const cityMatch = comp.cityState?.toLowerCase().includes(q);
        const bioMatch = comp.bio?.toLowerCase().includes(q);
        const genresMatch = comp.genres?.some(g => g.toLowerCase().includes(q));
        return Boolean(nameMatch || cityMatch || bioMatch || genresMatch);
      }
      return true;
    });

    // Ordenação
    result.sort((a, b) => {
      if (sortBy === 'songs') {
        return (b.songCount || 0) - (a.songCount || 0);
      }
      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    });

    return result;
  }, [composers, search, selectedGenre, sortBy]);

  const hasActiveFilters = search.trim() !== '' || selectedGenre !== 'Todos';

  const clearFilters = () => {
    setSearch('');
    setSelectedGenre('Todos');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <Navbar />

      <main className="flex-grow">
        {/* HEADER HERO */}
        <section className="relative py-12 md:py-16 overflow-hidden bg-[#0A1128] border-b border-amber-500/20 text-white">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 blur-[130px] rounded-full pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            {/* Breadcrumb back */}
            <div className="mb-6">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-amber-400 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar para a página inicial</span>
              </Link>
            </div>

            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Vitrine de Talentos Brasileiros</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-serif tracking-tight text-white leading-tight">
                Catálogo de <span className="italic text-amber-400 font-serif">Compositores</span>
              </h1>

              <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
                Descubra os autores por trás das grandes canções. Explore os perfis, conheça suas obras registradas e conecte-se diretamente para autorizações e gravações.
              </p>
            </div>
          </div>
        </section>

        {/* SEARCH & FILTERS SECTION */}
        <section className="py-4 sm:py-6 bg-[#060B18]/95 border-b border-slate-800 sticky top-20 z-30 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
            
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              {/* Search Bar */}
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por compositor, cidade, gênero..."
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Counter and Sort Controls */}
              <div className="w-full md:w-auto flex flex-wrap items-center justify-between md:justify-end gap-3 text-xs text-slate-400">
                <span>
                  <strong className="text-white">{filteredComposers.length}</strong> {filteredComposers.length === 1 ? 'compositor encontrado' : 'compositores encontrados'}
                </span>

                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as 'songs' | 'name')}
                    aria-label="Ordenar compositores"
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="songs">Mais músicas</option>
                    <option value="name">Nome (A - Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Genre Pills (Wrapping layout - zero horizontal scrollbar or dragging) */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1 text-xs">
              <span className="text-slate-400 text-xs font-semibold mr-1 flex items-center gap-1 shrink-0">
                <Music className="w-3.5 h-3.5 text-amber-400" />
                <span>Gêneros:</span>
              </span>
              {GENRE_FILTERS.map(genre => {
                const isSelected = selectedGenre === genre;
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => setSelectedGenre(genre)}
                    className={`px-3 py-1.5 rounded-full font-medium transition cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-md font-bold ring-2 ring-amber-400/40'
                        : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/80 hover:border-amber-500/40'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
              {selectedGenre !== 'Todos' && (
                <button
                  type="button"
                  onClick={() => setSelectedGenre('Todos')}
                  className="px-2.5 py-1 text-xs text-amber-400 hover:text-amber-300 hover:underline cursor-pointer ml-1 font-medium"
                >
                  Limpar filtro ({selectedGenre})
                </button>
              )}
            </div>

          </div>
        </section>

        {/* COMPOSERS GRID SECTION */}
        <section className="py-12 md:py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {loading ? (
            /* Skeletons */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden p-6 space-y-4 animate-pulse">
                  <div className="h-44 bg-slate-800 rounded-2xl" />
                  <div className="space-y-2">
                    <div className="h-6 w-48 bg-slate-800 rounded" />
                    <div className="h-4 w-32 bg-slate-800/60 rounded" />
                  </div>
                  <div className="h-10 bg-slate-800/40 rounded-xl" />
                </div>
              ))}
            </div>
          ) : filteredComposers.length > 0 ? (
            /* Composer Cards */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredComposers.map(comp => (
                <div
                  key={comp.id}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-3xl overflow-hidden transition group flex flex-col justify-between shadow-xl"
                >
                  <div>
                    {/* Header Banner & Circular Avatar */}
                    <div className="relative pt-8 pb-3 px-6 flex flex-col items-center text-center">
                      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-amber-500/10 via-[#0A1128]/50 to-transparent pointer-events-none rounded-t-3xl" />

                      {/* Instagram-style circular avatar with story ring */}
                      <Link to={`/compositor/${comp.username}`} className="relative mb-3 group/avatar block focus:outline-none">
                        <div className="w-24 h-24 sm:w-28 sm:h-28 p-1 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-600 shadow-xl shadow-amber-500/20 ring-4 ring-slate-900 group-hover:scale-105 transition-transform duration-300">
                          {comp.photo ? (
                            <>
                              <img
                                src={comp.photo}
                                onError={event => {
                                  event.currentTarget.style.display = 'none';
                                  const fallback = event.currentTarget.nextElementSibling;
                                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                                }}
                                alt={comp.name}
                                className="w-full h-full rounded-full object-cover bg-slate-950"
                              />
                              <div
                                style={{ display: 'none' }}
                                className="w-full h-full rounded-full items-center justify-center bg-gradient-to-br from-[#0A1128] via-slate-900 to-slate-950 text-2xl font-serif font-bold text-amber-400"
                                aria-hidden="true"
                              >
                                {(comp.name || 'C').trim().charAt(0).toUpperCase()}
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full rounded-full flex items-center justify-center bg-gradient-to-br from-[#0A1128] via-slate-900 to-slate-950 text-2xl font-serif font-bold text-amber-400" aria-hidden="true">
                              {(comp.name || 'C').trim().charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="absolute bottom-1 right-1 p-1 bg-amber-500 text-slate-950 rounded-full shadow-md ring-2 ring-slate-900 flex items-center justify-center">
                          <Music className="w-3 h-3" />
                        </span>
                      </Link>

                      {/* City/State badge */}
                      {comp.cityState && (
                        <span className="inline-flex items-center gap-1 bg-[#0A1128]/90 border border-amber-500/30 text-amber-400 text-xs px-3 py-0.5 rounded-full font-medium">
                          <MapPin className="w-3 h-3" />
                          <span>{comp.cityState}</span>
                        </span>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-6 pt-2 space-y-3 text-center">
                      <h2 className="text-xl font-serif italic font-bold text-white group-hover:text-amber-400 transition-colors">
                        <Link to={`/compositor/${comp.username}`}>
                          {comp.name}
                        </Link>
                      </h2>

                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                        {getSafePublicBio(comp.bio, comp.name, comp.username)}
                      </p>

                      {comp.genres && comp.genres.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                          {comp.genres.map((g, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-slate-800 text-amber-300 px-2.5 py-0.5 rounded-full border border-slate-700/80 font-medium"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-6 pt-0 flex items-center justify-between border-t border-slate-800/60 mt-4">
                    <span className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Disc className="w-3.5 h-3.5 text-amber-400" />
                      <span><strong>{comp.songCount || 0}</strong> {comp.songCount === 1 ? 'música' : 'músicas'}</span>
                    </span>

                    <Link
                      to={`/compositor/${comp.username}`}
                      className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition inline-flex items-center gap-1.5"
                    >
                      <span>Ver perfil</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-16 px-4 bg-slate-900/50 border border-slate-800 rounded-3xl max-w-lg mx-auto space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Music className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white font-serif">Nenhum compositor encontrado</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Não encontramos compositores para os critérios informados. Experimente buscar outro termo ou limpar os filtros.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                >
                  Limpar todos os filtros
                </button>
              )}
            </div>
          )}

          {/* Bottom Call to Action for Composers */}
          <div className="mt-16 p-8 md:p-12 rounded-3xl bg-gradient-to-r from-[#0A1128] to-slate-900 border border-amber-500/30 text-center space-y-4 max-w-4xl mx-auto shadow-2xl">
            <span className="text-amber-400 text-xs uppercase font-bold tracking-widest block">
              É um compositor?
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif italic text-white">
              Crie seu catálogo e apareça nesta vitrine
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed">
              Proteja suas composições com prévias de 60 segundos, organize suas letras e receba propostas diretas de gravação de artistas de todo o país.
            </p>
            <div className="pt-2">
              <Link
                to="/cadastro"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20"
              >
                <span>Criar Perfil de Compositor</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        </section>
      </main>

      <Footer />
    </div>
  );
};
