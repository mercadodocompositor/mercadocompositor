import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AudioPlayer } from '../components/common/AudioPlayer';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { getPublicComposer } from '../lib/database';
import { getInterestRequestUrl } from '../lib/urls';
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
  ShieldAlert,
  Sparkles
} from 'lucide-react';

const externalUrl = (value: string) => /^https?:\/\//i.test(value) ? value : `https://${value}`;
const instagramUrl = (value: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://instagram.com/${value.replace('@', '')}`;
};

export const PublicProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { username } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof getPublicComposer>>>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [expandedLyricsId, setExpandedLyricsId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const requestedUsername = username?.trim().toLowerCase();
  const profile = catalog?.profile ?? ({ genres: [] } as any);
  const songs = catalog?.songs ?? [];
  const profileExists = Boolean(catalog);

  // Filter published and available songs
  const publishedSongs = songs.filter(s => s.status === 'published');
  const highlightedSongId = searchParams.get('musica');

  useEffect(() => {
    if (!highlightedSongId) return;
    const target = document.getElementById(`musica-${highlightedSongId}`);
    if (target) window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }, [highlightedSongId]);

  useEffect(() => {
    let active=true; setCatalogLoading(true);
    if (!requestedUsername) { setCatalog(null); setCatalogLoading(false); return; }
    getPublicComposer(requestedUsername).then(data=>{if(active)setCatalog(data);}).catch(()=>{if(active)setCatalog(null);}).finally(()=>{if(active)setCatalogLoading(false);});
    return()=>{active=false;};
  },[requestedUsername]);

  const isSuspended = catalog?.subscriptionStatus === 'suspended';

  const handleShareProfile = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const toggleLyrics = (songId: string) => {
    setExpandedLyricsId(expandedLyricsId === songId ? null : songId);
  };

  if (catalogLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-amber-400">Carregando catálogo...</div>;

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
              to="/#compositores"
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
        
        {/* If Profile is Suspended Notice */}
        {isSuspended ? (
          <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white">Perfil Temporariamente Indisponível</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              A assinatura deste perfil de compositor encontra-se suspensa ou pendente de regularização. As músicas públicas ficam ocultas para novos ouvintes até a regularização da conta.
            </p>
          </div>
        ) : (
          <>
            {/* HERO PROFILE COVER */}
            <section className="relative bg-slate-900 border-b border-slate-800">
              
              {/* Cover Banner */}
              <div className="h-64 sm:h-80 w-full relative overflow-hidden bg-slate-950">
                <img 
                  src={profile.coverPhoto} 
                  onError={event => { event.currentTarget.src = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80'; }}
                  alt="Cover" 
                  className="w-full h-full object-cover opacity-50"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
              </div>

              {/* Profile Details Bar */}
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative -mt-20 pb-8 z-10">
                <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-6">
                  
                  {/* Photo & Main Info */}
                  <div className="flex flex-col md:flex-row items-center md:items-end gap-5 text-center md:text-left">
                    <img 
                      src={profile.photo} 
                      onError={event => { event.currentTarget.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80'; }}
                      alt={profile.stageName} 
                      className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl border-4 border-amber-500/80 object-cover shadow-2xl bg-slate-950"
                    />

                    <div className="space-y-2 pb-2">
                      <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                        <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> Compositor Verificado
                        </span>
                        {profile.society && (
                          <span className="bg-slate-800 text-slate-300 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-slate-700">
                            {profile.society.split(' - ')[0]}
                          </span>
                        )}
                      </div>

                      <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                        {profile.stageName}
                      </h1>

                      <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-slate-300">
                        <span className="flex items-center gap-1 text-slate-400">
                          <MapPin className="w-4 h-4 text-amber-400" />
                          {profile.city} — {profile.state}
                        </span>

                        {profile.experienceYears && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Award className="w-4 h-4 text-amber-400" />
                            {profile.experienceYears}
                          </span>
                        )}

                        <span className="flex items-center gap-1 text-amber-300 font-semibold">
                          <Disc className="w-4 h-4 text-amber-400" />
                          {publishedSongs.length} obras cadastradas
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Social Links */}
                  <div className="flex items-center gap-3 pb-2 flex-wrap justify-center md:justify-end">
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
                        <Music className="w-5 h-5" />
                      </a>
                    )}
                    {profile.website && (
                      <a href={externalUrl(profile.website)} target="_blank" rel="noreferrer" aria-label="Website do compositor" className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded-xl border border-slate-700 transition">
                        <Globe className="w-5 h-5" />
                      </a>
                    )}

                    <button
                      onClick={handleShareProfile}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Link Copiado!</span>
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
                    <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-3">
                      Sobre o Compositor
                    </h3>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                      {profile.bio}
                    </p>

                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                        Gêneros Principais:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.genres.map((g, idx) => (
                          <span key={idx} className="bg-slate-800 text-amber-300 border border-amber-500/20 text-xs px-2.5 py-1 rounded-lg font-medium">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Copyright notice card */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold">
                      <Lock className="w-4 h-4" />
                      <span>Proteção do Áudio Original</span>
                    </div>
                    <p className="leading-relaxed text-[11px]">
                      Todas as prévias de áudio neste perfil são limitadas a 60 segundos. Os fonogramas completos e acapellas ficam retidos na área do compositor para garantia da obra.
                    </p>
                  </div>

                </div>

                {/* Right Area: Songs List */}
                <div className="lg:col-span-8 space-y-6">
                  
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <h2 className="text-2xl font-extrabold text-white tracking-tight">
                        Catálogo de Obras Disponíveis
                      </h2>
                      <p className="text-xs text-slate-400">
                        Ouça a prévia e envie uma solicitação direta ao compositor
                      </p>
                    </div>
                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-3 py-1 rounded-full font-bold">
                      {publishedSongs.length} Músicas
                    </span>
                  </div>

                  {/* Song Cards */}
                  <div className="space-y-6">
                    {publishedSongs.map(song => {
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
                                src={song.coverUrl} 
                                alt={song.title} 
                                className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shrink-0 shadow-md"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                    {song.genre}
                                  </span>
                                  {song.subgenre && (
                                    <span className="text-[10px] text-slate-400">
                                      • {song.subgenre}
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-xl font-bold text-white mt-0.5">{song.title}</h3>
                                <p className="text-xs text-slate-400">Autoria: {song.authors}</p>
                              </div>
                            </div>

                            <div className="text-left sm:text-right flex sm:flex-col items-start sm:items-end justify-between bg-slate-950 sm:bg-transparent p-2.5 sm:p-0 rounded-xl sm:rounded-none border sm:border-none border-slate-800/80">
                              <span className="text-xs text-slate-400 block">Autorização:</span>
                              <span className="text-sm font-bold text-amber-400">
                                {song.valueType === 'suggested' && song.suggestedValue 
                                  ? `R$ ${song.suggestedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                                  : 'Valor sob consulta'}
                              </span>
                            </div>
                          </div>

                          {/* Short summary if available */}
                          {song.summary && (
                            <p className="text-xs text-slate-300 italic bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                              “{song.summary}”
                            </p>
                          )}

                          {/* 60-Second Audio Player */}
                          <AudioPlayer 
                            songId={song.id}
                            songTitle={song.title}
                            audioUrl={song.previewAudioUrl}
                            onInterestClick={() => navigate(getInterestRequestUrl(requestedUsername, song))}
                          />

                          {/* Lyrics Collapsible Section required by Section 9 */}
                          <div className="border-t border-slate-800/80 pt-3">
                            <button
                              onClick={() => toggleLyrics(song.id)}
                              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-amber-400 transition font-medium py-1"
                            >
                              <span>{isLyricsExpanded ? 'Ocultar Letra Completa' : 'Ver Letra Completa da Música'}</span>
                              {isLyricsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {isLyricsExpanded && (
                              <div className="mt-3 p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-line animate-fadeIn">
                                {song.lyrics}
                              </div>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>

                </div>

              </div>
            </div>
          </>
        )}

      </main>

      <Footer />

    </div>
  );
};
