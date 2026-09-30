import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpDown, BadgeCheck, ChevronDown, Crown, Disc3, MapPin, Music2, Search, Sparkles, X } from 'lucide-react';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { getPublicComposers } from '../lib/database';
import { applyPageMeta } from '../lib/pageMeta';
import { APP_URL } from '../config/appConfig';
import { getSafePublicBio } from '../lib/profileSanitizer';
import { MUSIC_GENRES, normalizeGenreList } from '../config/musicGenres';
import type { FeaturedComposer } from '../types';

const GENRES = ['Todos', ...MUSIC_GENRES.filter(genre => genre !== 'Outro')];

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const Photo: React.FC<{ composer: FeaturedComposer; className: string }> = ({ composer, className }) => {
  const initial = (composer.name || 'C').trim().charAt(0).toUpperCase();
  const fallback = 'h-full w-full items-center justify-center rounded-[inherit] bg-gradient-to-br from-slate-700 via-slate-900 to-[#060b16] font-serif text-3xl font-bold text-amber-400';
  return <div className={`overflow-hidden bg-slate-900 ${className}`}>
    {composer.photo ? <>
      <img src={composer.photo} alt={composer.name} className="h-full w-full rounded-[inherit] object-cover transition duration-500 group-hover:scale-[1.03]" onError={event => { event.currentTarget.style.display = 'none'; const next = event.currentTarget.nextElementSibling; if (next) (next as HTMLElement).style.display = 'flex'; }} />
      <div style={{ display: 'none' }} className={fallback} aria-hidden="true">{initial}</div>
    </> : <div className={`flex ${fallback}`} aria-hidden="true">{initial}</div>}
  </div>;
};

const Tags: React.FC<{ genres: string[] }> = ({ genres }) => <div className="flex flex-wrap gap-1.5">
  {(genres || []).slice(0, 3).map(genre => <span key={genre} className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[10px] text-slate-300">{genre}</span>)}
</div>;

export const ComposersPage: React.FC = () => {
  const [composers, setComposers] = useState<FeaturedComposer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('Todos');
  const [stateFilter, setStateFilter] = useState('Todos');
  const [sort, setSort] = useState<'songs' | 'name'>('songs');
  const [showAllGenres, setShowAllGenres] = useState(false);

  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => applyPageMeta({
    title: 'Compositores | Mercado do Compositor',
    description: 'Conheça compositores de todo o Brasil, ouça as prévias das obras e solicite a liberação para gravar.',
    url: `${APP_URL.replace(/\/$/, '')}/compositores`,
  }), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    // A RPC devolve até 1.000 perfis; busca e filtros rodam sobre essa lista.
    getPublicComposers({ limit: 1000 }).then(data => {
      if (!active) return;
      setComposers([...shuffle(data.filter(item => item.featured)), ...data.filter(item => !item.featured)]);
    }).catch(() => { if (active) { setComposers([]); setLoadError(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const filteredComposers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const result = composers.filter(item => {
      const genreMatch = genre === 'Todos' || normalizeGenreList(item.genres || []).some(value => {
        const normalized = value.toLocaleLowerCase('pt-BR');
        const selected = genre.toLocaleLowerCase('pt-BR');
        return normalized === selected || normalized.startsWith(`${selected} `);
      });
      if (!genreMatch) return false;
      if (stateFilter !== 'Todos' && !item.cityState?.endsWith(` - ${stateFilter}`)) return false;
      return !query || [item.name, item.cityState, item.bio, ...(item.genres || [])].some(value => value?.toLocaleLowerCase('pt-BR').includes(query));
    });
    return result.sort((a, b) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
      return sort === 'songs' ? (b.songCount || 0) - (a.songCount || 0) : (a.name || '').localeCompare(b.name || '', 'pt-BR');
    });
  }, [composers, search, genre, stateFilter, sort]);

  const availableStates = useMemo(() => Array.from(new Set(composers.map(item => item.cityState?.split(' - ').pop()?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [composers]);

  const featuredComposers = useMemo(() => composers.filter(comp => comp.featured), [composers]);
  const hasActiveFilters = Boolean(search.trim()) || genre !== 'Todos' || stateFilter !== 'Todos';
  const showFeaturedSection = !loading && !hasActiveFilters && featuredComposers.length > 0;
  const gridComposers = showFeaturedSection ? filteredComposers.filter(comp => !comp.featured) : filteredComposers;

  return <div className="flex min-h-screen flex-col bg-[#06101f] font-sans text-slate-100 selection:bg-amber-400 selection:text-slate-950">
    <Navbar />
    <main className="flex-1">
      <section className="relative isolate overflow-hidden border-b border-amber-400/15 bg-[#081426]">
        <img src="/hero-composers-v2.webp" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center md:object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#06101f]/95 via-[#06101f]/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06101f] via-transparent to-[#06101f]/20" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300"><span className="h-px w-8 bg-amber-400" /> Música real conecta pessoas</div>
            <h1 className="font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">Encontre a voz autoral da sua <span className="text-amber-300">próxima música</span></h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">Descubra compositores de todo o Brasil, conheça seus repertórios e encontre a parceria certa para o seu próximo projeto.</p>
            <div className="mt-8 grid overflow-hidden rounded-2xl border border-slate-600/60 bg-[#071425]/90 shadow-2xl shadow-black/25 backdrop-blur-md sm:grid-cols-[minmax(0,1fr)_190px]">
              <label className="relative flex min-h-14 items-center"><Search className="absolute left-4 h-5 w-5 text-slate-400" /><span className="sr-only">Buscar compositores</span>
                <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por compositor, cidade ou gênero" className="min-h-14 w-full bg-transparent py-4 pl-12 pr-11 text-sm text-white outline-none placeholder:text-slate-400" />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-3 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>}
              </label>
              <button type="button" onClick={() => document.getElementById('catalogo-compositores')?.scrollIntoView({ behavior: 'smooth' })} className="min-h-14 bg-amber-400 px-6 text-sm font-extrabold text-slate-950 transition hover:bg-amber-300">Buscar compositores</button>
            </div>
            <p className="mt-3 text-xs text-slate-400">Pesquise por nome artístico, localização, estilo ou palavra da apresentação.</p>
          </div>
        </div>
      </section>

      {showFeaturedSection && <section className="border-b border-slate-800 bg-[#081426]" aria-labelledby="featured-title">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300"><Sparkles className="h-4 w-4" /> Curadoria da plataforma</div>
            <h2 id="featured-title" className="font-serif text-3xl font-semibold text-white">Seleção em destaque</h2>
            <p className="mt-2 text-sm text-slate-400">Perfis ativos com repertório pronto para ser descoberto.</p>
          </div><a href="#catalogo-compositores" className="inline-flex items-center gap-2 text-sm font-bold text-amber-300 hover:text-amber-200">Ver todos os compositores <ArrowRight className="h-4 w-4" /></a></div>
          <div className="grid gap-4 lg:grid-cols-3">{featuredComposers.slice(0, 3).map(composer => <Link key={composer.id} to={`/compositor/${composer.username}`} className="group rounded-2xl border border-amber-400/35 bg-[#0d1b30] p-5 transition duration-300 hover:-translate-y-1 hover:border-amber-400/70 hover:shadow-xl hover:shadow-black/20">
            <div className="flex min-h-full items-start gap-4"><Photo composer={composer} className="h-24 w-24 shrink-0 rounded-full border-2 border-amber-400/50 p-1 sm:h-28 sm:w-28" />
              <div className="flex min-w-0 flex-1 flex-col"><span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300"><Crown className="h-3 w-3" /> Destaque</span>
                <h3 className="flex items-center gap-1.5 font-serif text-xl font-semibold text-white group-hover:text-amber-300"><span className="truncate">{composer.name}</span>{composer.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-amber-400" aria-label="Perfil verificado" />}</h3>
                {composer.cityState && <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5" /><span className="truncate">{composer.cityState}</span></p>}
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">{getSafePublicBio(composer.bio, composer.name, composer.username)}</p><div className="mt-3"><Tags genres={composer.genres} /></div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4"><span className="flex items-center gap-1.5 text-xs text-slate-300"><Disc3 className="h-4 w-4 text-amber-400" /><strong>{composer.songCount || 0}</strong> {composer.songCount === 1 ? 'música' : 'músicas'}</span><span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300">Ver perfil <ArrowRight className="h-3.5 w-3.5" /></span></div>
              </div></div>
          </Link>)}</div>
        </div>
      </section>}

      <section id="catalogo-compositores" className="scroll-mt-24 bg-[#06101f]"><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="border-b border-slate-800 pb-7">
          <div>
            <h2 className="font-serif text-3xl font-semibold text-white sm:text-4xl">Todos os compositores</h2>
            <p className="mt-2 text-sm text-slate-400"><strong className="font-medium text-slate-200">{filteredComposers.length}</strong> {filteredComposers.length === 1 ? 'perfil encontrado' : 'perfis encontrados'}</p>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.7fr)_1fr_1fr_0.85fr]">
            <label className="relative flex min-h-14 items-center rounded-xl border border-slate-700 bg-[#0d1b30] transition focus-within:border-amber-400">
              <Search className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400" />
              <span className="sr-only">Buscar no catálogo</span>
              <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar no catálogo" className="min-h-14 w-full bg-transparent py-3 pl-12 pr-11 text-sm font-medium text-white outline-none placeholder:text-slate-400" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-2 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>}
            </label>

            <label className="relative flex min-h-14 items-center rounded-xl border border-slate-700 bg-[#0d1b30] transition focus-within:border-amber-400">
              <Music2 className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400" />
              <span className="sr-only">Filtrar por gênero</span>
              <select value={genre} onChange={event => setGenre(event.target.value)} className="min-h-14 w-full appearance-none bg-transparent py-3 pl-12 pr-10 text-sm font-semibold text-slate-100 outline-none">
                {GENRES.map(item => <option key={item} value={item} className="bg-[#0d1b30]">{item === 'Todos' ? 'Todos os gêneros' : item}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 h-4 w-4 text-slate-400" />
            </label>

            <label className="relative flex min-h-14 items-center rounded-xl border border-slate-700 bg-[#0d1b30] transition focus-within:border-amber-400">
              <MapPin className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400" />
              <span className="sr-only">Filtrar por estado</span>
              <select value={stateFilter} onChange={event => setStateFilter(event.target.value)} className="min-h-14 w-full appearance-none bg-transparent py-3 pl-12 pr-10 text-sm font-semibold text-slate-100 outline-none">
                <option value="Todos" className="bg-[#0d1b30]">Todo o Brasil</option>
                {availableStates.map(state => <option key={state} value={state} className="bg-[#0d1b30]">{state}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 h-4 w-4 text-slate-400" />
            </label>

            <label className="relative flex min-h-14 items-center rounded-xl border border-slate-700 bg-[#0d1b30] transition focus-within:border-amber-400">
              <ArrowUpDown className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400" />
              <span className="sr-only">Ordenar compositores</span>
              <select value={sort} onChange={event => setSort(event.target.value as 'songs' | 'name')} className="min-h-14 w-full appearance-none bg-transparent py-3 pl-12 pr-10 text-sm font-semibold text-slate-100 outline-none">
                <option value="songs" className="bg-[#0d1b30]">Mais músicas</option><option value="name" className="bg-[#0d1b30]">Nome (A–Z)</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 h-4 w-4 text-slate-400" />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2" aria-label="Atalhos de gêneros">
            {(showAllGenres ? GENRES : GENRES.slice(0, 14)).map(item => <button key={item} type="button" aria-pressed={genre === item} onClick={() => setGenre(item)} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${genre === item ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-slate-700 bg-[#0d1b30] text-slate-300 hover:border-amber-400/50 hover:text-white'}`}>{item}</button>)}
            {GENRES.length > 14 && <button type="button" onClick={() => setShowAllGenres(value => !value)} aria-expanded={showAllGenres} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-[#0d1b30] px-4 py-2 text-xs font-semibold text-slate-300 hover:border-amber-400/50 hover:text-white">{showAllGenres ? 'Menos' : 'Mais'} <ChevronDown className={`h-3.5 w-3.5 transition ${showAllGenres ? 'rotate-180' : ''}`} /></button>}
          </div>
        </div>

        {loadError && !loading ? <div role="alert" className="mx-auto mt-10 max-w-lg rounded-2xl border border-red-500/30 bg-[#0d1b30] px-6 py-10 text-center"><p className="text-base font-semibold text-white">Não foi possível carregar os compositores</p><p className="mt-2 text-sm text-slate-400">Verifique sua conexão e tente de novo.</p><button type="button" onClick={() => setReloadKey(key => key + 1)} className="mt-5 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300">Tentar novamente</button></div>
        : loading ? <div className="mt-8 grid gap-4 lg:grid-cols-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex animate-pulse items-center gap-5 rounded-2xl border border-slate-800 bg-[#0d1b30] p-5"><div className="h-24 w-24 shrink-0 rounded-full bg-slate-800" /><div className="flex-1 space-y-3"><div className="h-5 w-2/3 rounded bg-slate-800" /><div className="h-4 w-1/2 rounded bg-slate-800" /><div className="h-8 w-3/4 rounded bg-slate-800/70" /></div></div>)}</div>
        : gridComposers.length ? <div className="mt-8 grid gap-4 lg:grid-cols-2">{gridComposers.map(composer => <Link key={composer.id} to={`/compositor/${composer.username}`} className="group flex min-w-0 items-center gap-4 rounded-2xl border border-slate-800 bg-[#0d1b30] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-amber-400/50 hover:shadow-xl hover:shadow-black/20 sm:gap-6 sm:p-5">
          <div className="relative shrink-0"><Photo composer={composer} className="h-20 w-20 rounded-full border-2 border-slate-700 p-1 transition group-hover:border-amber-400/60 sm:h-28 sm:w-28" />{composer.featured && <span className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[#0d1b30] bg-amber-400 text-slate-950" aria-label="Compositor em destaque"><Crown className="h-3.5 w-3.5" /></span>}</div>
          <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="flex items-center gap-1.5 font-serif text-xl font-semibold text-white group-hover:text-amber-300 sm:text-2xl"><span className="truncate">{composer.name}</span>{composer.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-sky-400" aria-label="Perfil verificado" />}</h3>{composer.cityState && <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><span>Compositor</span><span aria-hidden="true">•</span><MapPin className="h-3.5 w-3.5" /><span className="truncate">{composer.cityState}</span></p>}</div><div className="hidden shrink-0 border-l border-slate-700 pl-5 text-center sm:block"><strong className="block text-xl text-white">{composer.songCount || 0}</strong><span className="text-[11px] text-slate-400">{composer.songCount === 1 ? 'música' : 'músicas'}</span></div></div><div className="mt-4"><Tags genres={composer.genres} /></div><div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 sm:hidden"><span className="flex items-center gap-1.5 text-xs text-slate-400"><Disc3 className="h-4 w-4 text-amber-400" /><strong className="text-slate-200">{composer.songCount || 0}</strong> {composer.songCount === 1 ? 'música' : 'músicas'}</span><span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300">Ver perfil <ArrowRight className="h-3.5 w-3.5" /></span></div></div>
        </Link>)}</div>
        : <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-800 bg-[#0d1b30] px-6 py-12 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><Music2 className="h-7 w-7" /></div><h3 className="mt-5 font-serif text-2xl font-semibold text-white">Nenhum compositor encontrado</h3><p className="mt-2 text-sm text-slate-400">Tente outro nome, localidade ou gênero musical.</p>{hasActiveFilters && <button type="button" onClick={() => { setSearch(''); setGenre('Todos'); setStateFilter('Todos'); }} className="mt-6 rounded-full bg-amber-400 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300">Limpar filtros</button>}</div>}

        <div className="relative mt-16 overflow-hidden rounded-3xl border border-amber-400/25 bg-[#0d1b30] px-6 py-10 text-center sm:px-10 lg:py-14"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_38%)]" /><div className="relative mx-auto max-w-2xl"><span className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">Seu repertório merece ser ouvido</span><h2 className="mt-3 font-serif text-3xl font-semibold text-white sm:text-4xl">Também compõe? Faça parte desta vitrine.</h2><p className="mt-4 text-sm leading-7 text-slate-300">Crie seu catálogo, publique prévias protegidas e conecte suas obras a artistas de todo o Brasil.</p><Link to="/cadastro" className="mt-7 inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-slate-950 hover:bg-amber-300">Criar perfil de compositor <ArrowRight className="h-4 w-4" /></Link></div></div>
      </div></section>
    </main>
    <Footer />
  </div>;
};
