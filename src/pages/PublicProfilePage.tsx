import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AudioPlayer } from '../components/common/AudioPlayer';
import { ComposerAvatar } from '../components/common/ComposerAvatar';
import { SpotifyIcon } from '../components/common/SpotifyIcon';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { getPublicComposer, incrementProfileView } from '../lib/database';
import { getSafePublicBio, cleanTypography } from '../lib/profileSanitizer';
import { getInterestRequestUrl } from '../lib/urls';
import { captureException } from '../lib/monitoring';
import { useApp } from '../context/AppContext';
import { DEFAULT_SONG_COVER_URL } from '../config/media';
import { APP_URL } from '../config/appConfig';
import { applyPageMeta, isShareableImage, summarizeForMeta } from '../lib/pageMeta';
import { 
  Music,
  MapPin, 
  Award, 
  Share2, 
  Instagram, 
  Youtube, 
  Globe, 
  ChevronDown, 
  ChevronUp, 
  Disc, 
  Lock, 
  Check, 
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Search,
  X
} from 'lucide-react';

const SONGS_PAGE_SIZE = 10;

const HOW_IT_WORKS = [
  { title: 'Ouça a prévia', text: 'Cada obra tem uma prévia de até 60 segundos e a letra completa.' },
  { title: 'Envie seu interesse', text: 'Sem compromisso: o compositor recebe seu contato para conversar sobre a gravação.' },
  { title: 'Formalize a liberação', text: 'Com tudo combinado, o termo de liberação é emitido pela plataforma, com código de validação.' },
];

type SongSort = 'available' | 'popular' | 'recent' | 'title';
type PublicSong = NonNullable<Awaited<ReturnType<typeof getPublicComposer>>>['songs'][number];

const SONG_SORT_LABELS: Record<SongSort, string> = {
  available: 'Disponíveis primeiro',
  popular: 'Mais ouvidas',
  recent: 'Mais recentes',
  title: 'Título (A–Z)',
};

const byRecent = (a: PublicSong, b: PublicSong) => (b.dateRegistered || '').localeCompare(a.dateRegistered || '');
const SONG_SORTERS: Record<SongSort, (a: PublicSong, b: PublicSong) => number> = {
  available: (a, b) => Number(b.isAvailableForRelease) - Number(a.isAvailableForRelease) || byRecent(a, b),
  popular: (a, b) => (b.playCount || 0) - (a.playCount || 0) || byRecent(a, b),
  recent: byRecent,
  title: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
};

const normalizeSearch = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

const externalUrl = (value: string) => /^https?:\/\//i.test(value) ? value : `https://${value}`;
const instagramUrl = (value: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://instagram.com/${value.replace('@', '')}`;
};

export const PublicProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useApp();
  const { username } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof getPublicComposer>>>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [expandedLyricsId, setExpandedLyricsId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [songSearch, setSongSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [sortBy, setSortBy] = useState<SongSort>('available');
  const [visibleLimit, setVisibleLimit] = useState(SONGS_PAGE_SIZE);

  const requestedUsername = username?.trim().toLowerCase();
  const profile = catalog?.profile ?? ({ genres: [] } as any);
  const songs = catalog?.songs ?? [];
  const profileExists = Boolean(catalog);
  const genres = Array.from(new Set((profile.genres ?? []).map((g: string) => g?.trim()).filter(Boolean))) as string[];

  const publishedSongs = useMemo(() => songs.filter(s => s.status === 'published'), [songs]);
  const availableCount = publishedSongs.filter(s => s.isAvailableForRelease).length;
  const catalogGenres = useMemo(
    () => Array.from(new Set(publishedSongs.map(s => s.genre?.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [publishedSongs]
  );
  const visibleSongs = useMemo(() => {
    const query = normalizeSearch(songSearch);
    const filtered = publishedSongs.filter(song => {
      if (genreFilter && song.genre?.trim() !== genreFilter) return false;
      if (!query) return true;
      return [song.title, song.authors, song.genre, song.subgenre]
        .filter(Boolean)
        .some(value => normalizeSearch(String(value)).includes(query));
    });
    return [...filtered].sort(SONG_SORTERS[sortBy]);
  }, [publishedSongs, songSearch, genreFilter, sortBy]);
  const highlightedSongId = searchParams.get('musica');

  // A música do link ?musica= precisa estar entre as exibidas, mesmo além da primeira página.
  const highlightedIndex = highlightedSongId ? visibleSongs.findIndex(s => s.id === highlightedSongId) : -1;
  const displayLimit = Math.max(visibleLimit, highlightedIndex + 1);
  const displayedSongs = visibleSongs.slice(0, displayLimit);
  const remainingCount = visibleSongs.length - displayedSongs.length;
  const hasActiveFilters = Boolean(songSearch.trim() || genreFilter);

  useEffect(() => {
    setVisibleLimit(SONGS_PAGE_SIZE);
  }, [songSearch, genreFilter, sortBy]);

  // Só rola depois do carregamento: antes disso o card da música ainda não existe no DOM.
  useEffect(() => {
    if (catalogLoading) return;
    if (!highlightedSongId) {
      window.scrollTo(0, 0);
      return;
    }
    const timer = window.setTimeout(() => {
      document.getElementById(`musica-${highlightedSongId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [requestedUsername, highlightedSongId, catalogLoading]);

  // Uma busca ou filtro aplicado antes de abrir o link não pode esconder a música destacada.
  useEffect(() => {
    setSongSearch('');
    setGenreFilter('');
  }, [highlightedSongId]);

  // Título, descrição e Open Graph do perfil (ou da música do link) na aba e no histórico.
  useEffect(() => {
    if (!catalog) return;
    const { profile: p } = catalog;
    const origin = (APP_URL || window.location.origin).replace(/\/+$/, '');
    const profileUrl = `${origin}/compositor/${p.username}`;
    const song = highlightedSongId ? catalog.songs.find(s => s.id === highlightedSongId && s.status === 'published') : undefined;
    const genresText = (p.genres ?? []).slice(0, 3).join(', ');
    const fallbackImage = [p.photo, p.coverPhoto].find(isShareableImage);

    if (song) {
      return applyPageMeta({
        title: `${song.title} — ${p.stageName} | Mercado do Compositor`,
        description: summarizeForMeta(`Ouça a prévia de "${song.title}", composição de ${song.authors || p.stageName}${song.genre ? ` (${song.genre})` : ''}, e solicite a liberação da obra no Mercado do Compositor.`),
        url: `${profileUrl}?musica=${encodeURIComponent(song.id)}`,
        image: isShareableImage(song.coverUrl) ? song.coverUrl : fallbackImage,
      });
    }

    const bio = getSafePublicBio(p.bio, p.stageName, p.username);
    return applyPageMeta({
      title: `${p.stageName} | Mercado do Compositor`,
      description: summarizeForMeta(genresText ? `${genresText}. ${bio}` : bio),
      url: profileUrl,
      image: fallbackImage,
    });
  }, [catalog, highlightedSongId]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setLoadError(null);
    if (!requestedUsername) { setCatalog(null); setCatalogLoading(false); return; }
    getPublicComposer(requestedUsername).then(async data => {
      if (!active) return;
      setCatalog(data);
      if (data) {
        try {
          const counted = await incrementProfileView(requestedUsername);
          if (active && counted) setCatalog(current => current ? {...current, profile: {...current.profile, viewsCount: current.profile.viewsCount + 1}} : current);
        } catch { /* A métrica não impede a exibição do perfil. */ }
      }
    }).catch(err => {
      if (active) {
        captureException(err, { operation: 'getPublicComposer', username: requestedUsername });
        setLoadError('Não foi possível carregar as informações do compositor no momento devido a uma falha de conexão.');
      }
    }).finally(() => {
      if (active) setCatalogLoading(false);
    });
    return () => { active = false; };
  }, [requestedUsername, retryCount]);

  const songCountLabel = `${publishedSongs.length} ${publishedSongs.length === 1 ? 'obra cadastrada' : 'obras cadastradas'}`;
  const locationLabel = [profile.city, profile.state].map(value => value?.trim()).filter(Boolean).join(' — ');

  useEffect(() => {
    if (shareStatus === 'idle') return;
    const timer = window.setTimeout(() => setShareStatus('idle'), 3000);
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

  const handleShareProfile = async () => {
    // Link limpo do perfil, sem o ?musica= de quem chegou por uma música específica.
    const url = `${window.location.origin}/compositor/${profile.username}`;
    const title = `${profile.stageName} | Mercado do Compositor`;

    // No celular abre a folha nativa (WhatsApp, Instagram...); no desktop copia o link.
    if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
    } catch {
      // Fallback para contextos sem Clipboard API (http, navegadores antigos, iframes).
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      setShareStatus(copied ? 'copied' : 'failed');
    }
  };

  const toggleLyrics = (songId: string) => {
    setExpandedLyricsId(expandedLyricsId === songId ? null : songId);
  };

  if (catalogLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
        <Navbar />
        <main className="flex-grow py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-8 animate-pulse">
          {/* Hero Banner Skeleton */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 sm:p-12 space-y-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl bg-slate-800 shrink-0" />
              <div className="space-y-3 flex-1 text-center sm:text-left">
                <div className="h-4 w-32 bg-slate-800 rounded-full mx-auto sm:mx-0" />
                <div className="h-8 w-64 bg-slate-800 rounded-xl mx-auto sm:mx-0" />
                <div className="h-4 w-48 bg-slate-800/60 rounded mx-auto sm:mx-0" />
                <div className="pt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
                  <div className="h-7 w-20 bg-slate-800 rounded-lg" />
                  <div className="h-7 w-24 bg-slate-800 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Body Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <div className="h-4 w-28 bg-slate-800 rounded" />
                <div className="h-16 bg-slate-800/40 rounded-xl" />
              </div>
            </div>
            <div className="lg:col-span-8 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-5 w-48 bg-slate-800 rounded" />
                      <div className="h-3 w-32 bg-slate-800/60 rounded" />
                    </div>
                  </div>
                  <div className="h-10 bg-slate-800/30 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (loadError && !catalog) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
        <Navbar />

        <main className="flex-grow flex items-center justify-center px-4 py-20">
          <div className="w-full max-w-lg rounded-3xl border border-red-500/30 bg-slate-900 p-8 sm:p-10 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-red-400">Falha de Conexão</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Não foi possível carregar o perfil
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              {loadError}
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setRetryCount(c => c + 1)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 shadow-lg shadow-amber-500/20"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </button>
              <Link
                to="/"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-slate-700"
              >
                Ir para o início
              </Link>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  if (!profileExists) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
        <Navbar />

        <main className="flex-grow flex items-center justify-center px-4 py-20">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 sm:p-10 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Music className="h-8 w-8" />
            </div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Perfil não encontrado</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Este compositor não está disponível
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              Confira se o endereço foi digitado corretamente ou encontre outro compositor na página inicial.
            </p>
            <Link
              to="/compositores"
              className="mt-7 inline-flex items-center justify-center rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
            >
              Ver compositores
            </Link>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      
      <Navbar />

      <main className="flex-grow pb-20">
        {/* get_public_composer só devolve perfis com assinatura ativa; os demais caem em "não disponível". */}
        <>
            {/* HERO PROFILE COVER */}
            <section className="relative bg-slate-900 border-b border-slate-800">
              
              {/* Cover Banner */}
              <div className="h-36 sm:h-64 md:h-80 w-full relative overflow-hidden bg-gradient-to-r from-[#060B18] via-[#0A1128] to-[#111C44]">
                {/* Background Artwork / Studio Lighting Pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/15 via-blue-900/10 to-transparent pointer-events-none" />
                
                {/* Acoustic Soundwave / Equalizer SVG Pattern */}
                <div className="absolute inset-0 opacity-25 flex items-center justify-around px-8 pointer-events-none select-none overflow-hidden" aria-hidden="true">
                  <svg className="w-full h-32 text-amber-400" viewBox="0 0 1200 120" preserveAspectRatio="none" fill="none">
                    <path
                      d="M0,60 Q30,10 60,60 T120,60 T180,20 T240,60 T300,90 T360,60 T420,15 T480,60 T540,100 T600,60 T660,10 T720,60 T780,105 T840,60 T900,25 T960,60 T1020,95 T1080,60 T1140,30 T1200,60"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M0,60 Q40,30 80,60 T160,60 T240,40 T320,60 T400,80 T480,60 T560,35 T640,60 T720,85 T800,60 T880,40 T960,60 T1040,75 T1120,60 T1200,50"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeDasharray="4 6"
                    />
                  </svg>
                </div>

                {Boolean(profile.coverPhoto) && (
                  <img 
                    src={profile.coverPhoto} 
                    onError={event => { event.currentTarget.style.display = 'none'; }}
                    alt="Capa do perfil" 
                    className="w-full h-full object-cover opacity-45 mix-blend-luminosity relative z-1"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent z-2" />
              </div>

              {/* Profile Details Bar */}
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative -mt-14 sm:-mt-20 pb-8 z-10">
                <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-6">
                  
                  {/* Photo & Main Info */}
                  <div className="flex flex-col md:flex-row items-center md:items-end gap-4 sm:gap-5 text-center md:text-left">
                    <ComposerAvatar name={profile.stageName} photoUrl={profile.photo} className="w-24 h-24 sm:w-36 sm:h-36 md:w-40 md:h-40" />

                    <div className="space-y-2 pb-2">
                      <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                        {profile.isVerified && (
                          <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Compositor Verificado
                          </span>
                        )}
                        {profile.society && (
                          <span className="bg-slate-800 text-slate-200 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-700">
                            {profile.society.split(' - ')[0]}
                          </span>
                        )}
                      </div>

                      <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                        {profile.stageName}
                      </h1>

                      <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 sm:gap-4 text-xs text-slate-300">
                        {locationLabel && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                            {locationLabel}
                          </span>
                        )}

                        {profile.experienceYears && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Award className="w-4 h-4 text-amber-400 shrink-0" />
                            {cleanTypography(profile.experienceYears)}
                          </span>
                        )}

                        <span className="flex items-center gap-1 text-amber-300 font-semibold">
                          <Disc className="w-4 h-4 text-amber-400 shrink-0" />
                          {songCountLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Social Links */}
                  <div className="flex items-center gap-2.5 sm:gap-3 pb-2 flex-wrap justify-center md:justify-end w-full sm:w-auto">
                    {profile.instagram && (
                      <a href={instagramUrl(profile.instagram)} target="_blank" rel="noreferrer" aria-label="Instagram do compositor" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded-xl border border-slate-700 transition">
                        <Instagram className="w-5 h-5" />
                      </a>
                    )}
                    {profile.youtube && (
                      <a href={externalUrl(profile.youtube)} target="_blank" rel="noreferrer" aria-label="YouTube do compositor" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded-xl border border-slate-700 transition">
                        <Youtube className="w-5 h-5" />
                      </a>
                    )}
                    {profile.spotify && (
                      <a href={externalUrl(profile.spotify)} target="_blank" rel="noreferrer" aria-label="Spotify do compositor" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 rounded-xl border border-slate-700 transition">
                        <SpotifyIcon className="w-5 h-5" />
                      </a>
                    )}
                    {profile.website && (
                      <a href={externalUrl(profile.website)} target="_blank" rel="noreferrer" aria-label="Website do compositor" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded-xl border border-slate-700 transition">
                        <Globe className="w-5 h-5" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={handleShareProfile}
                      aria-live="polite"
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition"
                    >
                      {shareStatus === 'copied' ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Link Copiado!</span>
                        </>
                      ) : shareStatus === 'failed' ? (
                        <>
                          <AlertTriangle className="w-4 h-4" />
                          <span>Não foi possível copiar</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4" />
                          <span>Compartilhar Perfil</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              </div>
            </section>

            {/* BIO & CATALOG CONTENT */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Left Sidebar: Bio & Musical Genres */}
                <div className="lg:col-span-4 space-y-6">
                  
                  {/* Bio Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                    <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
                      Sobre o compositor
                    </h2>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                      {getSafePublicBio(profile.bio, profile.stageName, profile.username)}
                    </p>

                    {genres.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                          Gêneros Principais:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {genres.map(g => (
                            <span key={g} className="bg-slate-800 text-amber-300 border border-amber-500/20 text-xs px-2.5 py-1 rounded-lg font-medium">
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Como funciona: explicado uma vez aqui, em vez de repetido em cada obra */}
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
                    <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
                      Como funciona
                    </h2>
                    <ol className="space-y-4">
                      {HOW_IT_WORKS.map((step, index) => (
                        <li key={step.title} className="flex gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-xs font-bold text-amber-400" aria-hidden="true">
                            {index + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-white">{step.title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{step.text}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <p className="flex items-start gap-2 border-t border-slate-800 pt-3 text-xs leading-relaxed text-slate-400">
                      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                      As prévias têm até 60 segundos. O fonograma completo e a acapella ficam protegidos na área do compositor.
                    </p>
                  </div>

                </div>

                {/* Right Area: Songs List */}
                <div className="lg:col-span-8 space-y-6">
                  
                  <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-extrabold text-white tracking-tight">
                        Catálogo de obras
                      </h2>
                      <p className="text-xs text-slate-400">
                        Ouça a prévia e envie uma solicitação direta ao compositor
                      </p>
                    </div>
                    {publishedSongs.length > 0 && (
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <span className="bg-slate-800 text-slate-300 border border-slate-700 text-xs px-3 py-1 rounded-full font-semibold">
                          {publishedSongs.length} {publishedSongs.length === 1 ? 'obra' : 'obras'}
                        </span>
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-3 py-1 rounded-full font-bold">
                          {availableCount} {availableCount === 1 ? 'disponível' : 'disponíveis'} para gravação
                        </span>
                      </div>
                    )}
                  </div>

                  {publishedSongs.length > 0 && (
                    <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        <input
                          type="search"
                          value={songSearch}
                          onChange={event => setSongSearch(event.target.value)}
                          placeholder="Buscar por música, autor ou gênero"
                          aria-label="Buscar no catálogo de músicas"
                          className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pl-10 pr-10 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-500"
                        />
                        {songSearch && (
                          <button type="button" onClick={() => setSongSearch('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <label className="sr-only" htmlFor="catalog-sort">Ordenar obras</label>
                      <select
                        id="catalog-sort"
                        value={sortBy}
                        onChange={event => setSortBy(event.target.value as SongSort)}
                        className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-500"
                      >
                        {(Object.keys(SONG_SORT_LABELS) as SongSort[]).map(key => (
                          <option key={key} value={key}>{SONG_SORT_LABELS[key]}</option>
                        ))}
                      </select>
                    </div>

                    {catalogGenres.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-1 touch-scroll" role="group" aria-label="Filtrar por gênero">
                        {['', ...catalogGenres].map(genre => {
                          const active = genreFilter === genre;
                          return (
                            <button
                              key={genre || 'todos'}
                              type="button"
                              onClick={() => setGenreFilter(genre)}
                              aria-pressed={active}
                              className={`min-h-9 shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                                active
                                  ? 'border-amber-500 bg-amber-500 text-slate-950'
                                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'
                              }`}
                            >
                              {genre || 'Todos'}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {hasActiveFilters && <p role="status" className="text-xs text-slate-400">{visibleSongs.length} {visibleSongs.length === 1 ? 'resultado' : 'resultados'}</p>}
                    </div>
                  )}

                  {/* Song Cards */}
                  <div className="space-y-6">
                    {publishedSongs.length === 0 ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-4 shadow-xl">
                        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                          <Music className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-lg font-bold text-white">Nenhuma música disponível no momento</h3>
                          <p className="text-xs text-slate-400 max-w-sm mx-auto">
                            Este compositor está preparando novas composições. Volte em breve para conferir os próximos lançamentos!
                          </p>
                        </div>
                      </div>
                    ) : visibleSongs.length === 0 ? (
                      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-10 text-center shadow-xl">
                        <Search className="mx-auto h-9 w-9 text-slate-600" aria-hidden="true" />
                        <h3 className="mt-3 text-base font-bold text-white">Nenhuma obra encontrada</h3>
                        <p className="mt-1 text-xs text-slate-400">Tente outro título, autor, gênero ou estilo.</p>
                        <button type="button" onClick={() => { setSongSearch(''); setGenreFilter(''); }} className="mt-4 min-h-11 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700">Limpar filtros</button>
                      </div>
                    ) : (
                      displayedSongs.map(song => {
                        const isLyricsExpanded = expandedLyricsId === song.id;

                        return (
                          <div
                            key={song.id}
                            id={`musica-${song.id}`}
                            className={`bg-slate-900 border rounded-3xl p-6 shadow-xl transition space-y-5 ${
                              highlightedSongId === song.id
                                ? 'border-amber-500 ring-2 ring-amber-500/20'
                                : 'border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            {/* Song Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex items-center gap-4">
                                <img
                                  src={song.coverUrl || DEFAULT_SONG_COVER_URL}
                                  onError={event => {
                                    const img = event.currentTarget;
                                    if (!img.src.endsWith(DEFAULT_SONG_COVER_URL)) img.src = DEFAULT_SONG_COVER_URL;
                                  }}
                                  loading="lazy"
                                  decoding="async"
                                  alt={`Capa de ${song.title}`}
                                  className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shrink-0 shadow-md"
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs uppercase tracking-wider font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                      {song.genre}
                                    </span>
                                    {song.subgenre && (
                                      <span className="text-xs uppercase tracking-wider font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                                        {song.subgenre}
                                      </span>
                                    )}
                                  </div>
                                  <h3 className="text-xl font-bold text-white mt-1">
                                    {song.title}
                                  </h3>
                                  <p className="text-xs text-slate-400">
                                    Composição de {song.authors}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {song.valueType === 'suggested' && song.suggestedValue ? (
                                  <div className="text-right">
                                    <span className="text-xs text-slate-300 block uppercase font-bold">Valor sugerido</span>
                                    <span className="text-amber-400 font-bold text-base tabular-nums">
                                      {song.suggestedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-right">
                                    <span className="text-xs text-slate-300 block uppercase font-bold">Liberação</span>
                                    <span className="text-slate-300 font-semibold text-xs">
                                      Valor sob consulta
                                    </span>
                                  </div>
                                )}

                              </div>
                            </div>

                            {/* Audio Player Bar */}
                            <div className="pt-2">
                              <AudioPlayer
                                audioUrl={song.previewAudioUrl || song.audioUrl}
                                maxDurationSeconds={60}
                                songId={song.id}
                                songTitle={song.title}
                              />
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              {song.isAvailableForRelease ? (
                                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                                  <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                                  Disponível para gravação
                                </p>
                              ) : (
                                <p className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                                  <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden="true" />
                                  Sem propostas no momento
                                </p>
                              )}
                              {song.isAvailableForRelease ? (
                                <Link
                                  to={getInterestRequestUrl(profile.username, song)}
                                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:-translate-y-0.5 hover:bg-amber-400"
                                >
                                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                                  <span>Tenho interesse</span>
                                  <span className="sr-only">em {song.title}</span>
                                </Link>
                              ) : (
                                <span className="text-xs text-slate-400 sm:text-right">
                                  Ouça a prévia. O compositor pode abrir propostas depois.
                                </span>
                              )}
                            </div>

                            {/* Letra */}
                            {song.lyrics?.trim() && (
                              <div className="border-t border-slate-800/80 pt-3">
                                <button
                                  type="button"
                                  onClick={() => toggleLyrics(song.id)}
                                  aria-expanded={isLyricsExpanded}
                                  aria-controls={'letra-' + song.id}
                                  className="w-full min-h-10 flex items-center justify-between text-sm text-slate-300 hover:text-amber-400 transition font-medium py-1"
                                >
                                  <span>{isLyricsExpanded ? 'Ocultar letra' : 'Ver letra completa'}</span>
                                  {isLyricsExpanded ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                                </button>

                                {isLyricsExpanded && (
                                  <div id={'letra-' + song.id} className="mt-3 p-5 bg-slate-950 rounded-2xl border border-slate-800 text-sm text-slate-200 leading-7 whitespace-pre-line max-w-prose animate-fadeIn">
                                    {song.lyrics}
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        );
                      })
                    )}
                  </div>

                  {remainingCount > 0 && (
                    <div className="flex flex-col items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setVisibleLimit(displayLimit + SONGS_PAGE_SIZE)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:border-amber-500/60 hover:bg-slate-800"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        Ver mais {Math.min(remainingCount, SONGS_PAGE_SIZE)} {Math.min(remainingCount, SONGS_PAGE_SIZE) === 1 ? 'obra' : 'obras'}
                      </button>
                      <span className="text-xs text-slate-500">
                        Exibindo {displayedSongs.length} de {visibleSongs.length}
                      </span>
                    </div>
                  )}

                </div>

              </div>
            </div>

            {!isAuthenticated && (
              <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                <div className="flex flex-col items-start gap-5 rounded-3xl border border-amber-500/25 bg-gradient-to-r from-[#0A1128] via-slate-900 to-[#111C44] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                  <div>
                    <h2 className="text-xl font-extrabold text-white sm:text-2xl">É compositor?</h2>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-300">
                      Crie sua vitrine no Mercado do Compositor, publique suas obras e receba propostas de intérpretes e produtoras.
                    </p>
                  </div>
                  <Link
                    to="/cadastro"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
                  >
                    Criar minha vitrine
                  </Link>
                </div>
              </section>
            )}
          </>

      </main>

      <Footer />

    </div>
  );
};
