import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { FAQSection } from '../components/common/FAQSection';
import { APP_CONFIG } from '../config/appConfig';
import { PREVIEW_MAX_SECONDS } from '../config/media';
import { getFeaturedComposers, getFeaturedSongs } from '../lib/database';
import { getSafePublicBio } from '../lib/profileSanitizer';
import { formatMoneyBR, listOfferedPlans } from '../lib/plans';
import { useApp } from '../context/AppContext';
import type { FeaturedComposer, Song } from '../types';
import heroComposerStudioImg from '../assets/hero-composer-studio.webp';
import {
  Music,
  Play,
  Pause,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  UserPlus,
  Upload,
  Share2,
  FileCheck,
  Disc,
  Headphones,
  Lock,
  MessageSquare,
  BadgeCheck,
  Zap,
  MapPin,
  Volume2
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { adminSongs, featuredSongIds, incrementPlayCount, subscriptionPlans } = useApp();
  const offeredPlans = listOfferedPlans(subscriptionPlans);
  const [featuredComposers, setFeaturedComposers] = useState<FeaturedComposer[]>([]);
  const [featuredSongs, setFeaturedSongs] = useState<Song[]>([]);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    getFeaturedComposers().then(setFeaturedComposers).catch(() => setFeaturedComposers([]));
  }, []);

  useEffect(() => {
    // If context has active featured songs, use them; otherwise query database
    const contextFeatured = adminSongs.filter(s => featuredSongIds.includes(s.id) && s.status === 'published');
    if (contextFeatured.length > 0) {
      setFeaturedSongs(contextFeatured.slice(0, 6));
    } else {
      getFeaturedSongs(6).then(setFeaturedSongs).catch(() => setFeaturedSongs([]));
    }
  }, [adminSongs, featuredSongIds]);

  useEffect(() => () => {
    audioElement?.pause();
  }, [audioElement]);

  const handlePlayPreview = (song: Song) => {
    if (playingSongId === song.id) {
      audioElement?.pause();
      setPlayingSongId(null);
    } else {
      audioElement?.pause();
      const url = song.previewAudioUrl || song.audioUrl;
      if (!url) return;
      const audio = new Audio(url);
      audio.play().then(() => incrementPlayCount(song.id)).catch(() => {});
      audio.onended = () => setPlayingSongId(null);
      const onTimeUpdate = () => {
        if (audio.currentTime >= PREVIEW_MAX_SECONDS) {
          audio.pause();
          audio.currentTime = 0;
          setPlayingSongId(null);
        }
      };
      audio.addEventListener('timeupdate', onTimeUpdate);
      setAudioElement(audio);
      setPlayingSongId(song.id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">

      <Navbar />

      <main className="flex-grow">

        {/* EDITORIAL HERO */}
        <section className="relative isolate overflow-hidden border-b border-amber-400/20 bg-[#06101f] text-white">
          <img src={heroComposerStudioImg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#06101f] via-[#06101f]/90 to-[#06101f]/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06101f]/80 via-transparent to-[#06101f]/20" />
          <div className="relative mx-auto grid min-h-[520px] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-20">
            <div className="lg:col-span-7 xl:col-span-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">Compositores e artistas mais perto</p>
              <h1 className="mt-4 max-w-3xl font-serif text-4xl font-semibold leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">Suas músicas merecem encontrar a <span className="text-amber-300">voz certa</span></h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">Publique suas composições com prévias protegidas e conecte-se diretamente com cantores e artistas de todo o Brasil.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/cadastro" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-7 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:-translate-y-0.5 hover:bg-amber-300">Publicar minhas músicas <ArrowRight className="h-4 w-4" /></Link>
                <Link to="/compositores" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-500 bg-slate-950/45 px-7 text-sm font-bold text-white backdrop-blur transition hover:border-amber-300 hover:text-amber-300">Explorar compositores</Link>
              </div>
            </div>

            {featuredSongs[0] && <div className="self-end lg:col-span-5 lg:self-center xl:col-span-6">
              <div className="ml-auto max-w-md rounded-2xl border border-white/20 bg-slate-950/65 p-5 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => handlePlayPreview(featuredSongs[0])} aria-label={playingSongId === featuredSongs[0].id ? 'Pausar prévia' : 'Ouvir prévia'} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-amber-400 hover:text-slate-950">{playingSongId === featuredSongs[0].id ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}</button>
                  <div className="min-w-0 flex-1"><strong className="block truncate font-serif text-lg text-white">{featuredSongs[0].title}</strong><span className="block truncate text-xs text-slate-400">{featuredSongs[0].authors}</span><div className="mt-3 flex h-5 items-end gap-1" aria-hidden="true">{[8,14,10,18,12,20,9,16,12,18,8,15,10,19,12,16,7,13].map((height, index) => <span key={index} className="w-1 rounded-full bg-amber-300/80" style={{ height }} />)}</div></div>
                  <span className="text-xs text-slate-400">0:30</span>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-[11px] font-semibold text-amber-300"><Lock className="h-3.5 w-3.5" /> Prévia protegida de até 85 segundos</div>
              </div>
            </div>}
          </div>
        </section>

        {/* VALUE STRIP */}
        <section className="border-b border-slate-800 bg-[#0d1b30] text-white">
          <div className="mx-auto grid max-w-7xl divide-y divide-slate-700 px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-8">
            {[{ icon: ShieldCheck, title: 'Prévia protegida', text: 'Suas composições seguras, com áudio em prévia.' }, { icon: UserPlus, title: 'Contato direto', text: 'Conecte-se sem intermediários com artistas reais.' }, { icon: FileCheck, title: 'Liberação digital', text: 'Formalize o uso das suas músicas com clareza.' }].map(item => { const Icon = item.icon; return <div key={item.title} className="flex items-center gap-4 px-3 py-6 md:px-7"><Icon className="h-8 w-8 shrink-0 text-amber-300" /><div><h2 className="font-serif text-base font-semibold text-white">{item.title}</h2><p className="mt-1 text-xs leading-5 text-slate-400">{item.text}</p></div></div>; })}
          </div>
        </section>

        {/* FEATURED COMPOSERS EDITORIAL */}
        {featuredComposers.length > 0 && <section id="compositores" className="scroll-mt-24 border-b border-slate-800 bg-[#06101f] py-12 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-7 flex items-end justify-between gap-5"><div><h2 className="font-serif text-3xl font-semibold">Compositores em destaque</h2><p className="mt-1 text-sm text-slate-400">Talento brasileiro em todos os ritmos</p></div><Link to="/compositores" className="hidden items-center gap-2 text-xs font-bold text-amber-300 hover:text-amber-200 sm:inline-flex">Ver todos os compositores <ArrowRight className="h-4 w-4" /></Link></div>
            <div className="grid gap-5 md:grid-cols-3">{featuredComposers.slice(0, 3).map(comp => <Link key={comp.id} to={`/compositor/${comp.username}`} className="group flex items-center gap-4 border-slate-800 py-2 md:border-r md:pr-5 md:last:border-r-0"><div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-amber-300/70 p-1">{comp.photo ? <img src={comp.photo} alt={comp.name} className="h-full w-full rounded-full object-cover" /> : <div className="grid h-full w-full place-items-center rounded-full bg-slate-800 font-serif text-2xl font-bold text-amber-300">{(comp.name || 'C')[0]}</div>}</div><div className="min-w-0"><h3 className="flex items-center gap-1.5 truncate font-serif text-lg font-semibold group-hover:text-amber-300">{comp.name}{comp.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-amber-300" />}</h3><p className="mt-1 line-clamp-2 text-xs italic leading-5 text-slate-400">“{getSafePublicBio(comp.bio, comp.name, comp.username)}”</p><div className="mt-3 flex flex-wrap gap-1.5">{comp.genres.slice(0, 3).map(genre => <span key={genre} className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300">{genre}</span>)}</div></div></Link>)}</div>
          </div>
        </section>}

        {/* HOW IT WORKS EDITORIAL */}
        <section id="como-funciona" className="relative isolate scroll-mt-24 overflow-hidden border-b border-slate-200 bg-[#f8f4ed] py-14 text-slate-900 lg:py-16">
          <img src="/how-it-works-studio.webp" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#f8f4ed]/95 via-[#f8f4ed]/85 to-[#f8f4ed]/65" aria-hidden="true" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl"><span className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-800">Músicas conectam pessoas</span><h2 className="mt-2 font-serif text-4xl font-semibold leading-none text-[#0A1128] sm:text-5xl">Como funciona</h2><p className="mt-3 text-sm font-medium text-slate-800 sm:text-base">Do seu talento a novas oportunidades, em três passos simples.</p></div>
            <div className="mt-10 grid max-w-5xl gap-8 md:grid-cols-3 md:gap-5">
              {[{ icon: Upload, title: 'Publique suas músicas', text: 'Envie suas composições, adicione informações e defina suas condições de licenciamento.' }, { icon: UserPlus, title: 'Conecte-se com artistas', text: 'Seus trabalhos ficam disponíveis para artistas, produtores e selos que buscam novas músicas.' }, { icon: Zap, title: 'Transforme sua música', text: 'Receba solicitações, negocie e veja suas composições ganharem o mundo.' }].map((step, index) => { const Icon = step.icon; return <div key={step.title} className="relative flex gap-4 md:block md:pr-8"><div className="flex shrink-0 items-start gap-4 md:items-center"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f5dfbd] font-serif text-lg font-bold text-[#0A1128]">{index + 1}</span><Icon className="h-12 w-12 text-[#0A1128]" strokeWidth={1.5} /></div>{index < 2 && <span className="absolute left-[calc(100%-2rem)] top-5 hidden h-px w-16 bg-amber-700/80 md:block" aria-hidden="true" />}<div className="md:mt-4"><h3 className="font-serif text-xl font-bold text-[#050b18]">{step.title}</h3><p className="mt-2 max-w-xs text-sm font-medium leading-6 text-[#172033]">{step.text}</p></div></div>; })}
            </div>
          </div>
        </section>

        {/* BENEFITS EDITORIAL */}
        <section id="beneficios" className="relative isolate scroll-mt-24 overflow-hidden bg-[#071426] py-14 text-white lg:py-16">
          <img src="/composer-benefits-studio.webp" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-65" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#071426]/45 via-[#071426]/95 to-[#071426]" />
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.65fr] lg:px-8">
            <div className="self-center"><span className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300">Mais que uma plataforma</span><h2 className="mt-3 font-serif text-4xl font-semibold leading-[1.03] text-white sm:text-5xl">Benefícios exclusivos para <span className="text-amber-300">o compositor</span></h2><p className="mt-5 max-w-md text-sm leading-7 text-slate-300">Ferramentas pensadas para valorizar seu talento, proteger suas criações e aproximar você de novas oportunidades na música.</p><Link to="/cadastro" className="mt-7 inline-flex items-center gap-3 rounded-full bg-amber-400 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-slate-950 transition hover:bg-amber-300">Faça parte <ArrowRight className="h-4 w-4" /></Link></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[{ icon: UserPlus, title: 'Perfil profissional', text: 'Apresente sua história, seu estilo e suas influências.' }, { icon: Disc, title: 'Catálogo organizado', text: 'Mantenha suas músicas fáceis de encontrar.' }, { icon: ShieldCheck, title: 'Prévias protegidas de 85 segundos', text: 'Permita audições com mais segurança.', featured: true }, { icon: MessageSquare, title: 'Contato direto', text: 'Converse com artistas e produtores interessados.' }, { icon: CheckCircle2, title: 'Gestão de solicitações', text: 'Acompanhe propostas e negociações em um só lugar.' }, { icon: FileCheck, title: 'Termos de liberação', text: 'Formalize acordos de forma simples e digital.' }, { icon: Sparkles, title: 'Maior visibilidade', text: 'Amplie as chances de suas músicas serem encontradas.' }].map(item => { const Icon = item.icon; return <div key={item.title} className={`rounded-xl border p-5 ${item.featured ? 'border-amber-400/55 bg-gradient-to-br from-amber-400/15 to-white/5 sm:col-span-2' : 'border-slate-700 bg-[#0c1b30]/85'}`}><Icon className="h-8 w-8 text-amber-300" strokeWidth={1.6} /><h3 className="mt-4 font-serif text-base font-semibold text-white">{item.title}</h3><p className="mt-2 text-xs leading-5 text-slate-300">{item.text}</p>{item.featured && <div className="mt-5 flex h-8 items-center gap-1" aria-hidden="true">{[12,20,28,17,32,24,15,27,20,31,18,25,13,21,16,11].map((height, index) => <span key={index} className={`w-1 rounded-full ${index < 10 ? 'bg-amber-300' : 'bg-slate-600'}`} style={{ height }} />)}</div>}</div>; })}
            </div>
          </div>
        </section>

        {/* HERO SECTION */}
        <section className="hidden relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden bg-[#0A1128] border-b border-amber-500/20 text-white">

          {/* Subtle Background Glows */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

              {/* Hero Text */}
              <div className="lg:col-span-6 xl:col-span-6 space-y-6 text-center lg:text-left">

                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>A Casa do Compositor Brasileiro</span>
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-4xl xl:text-5xl font-serif tracking-tight text-white leading-[1.15]">
                  Suas músicas merecem encontrar a <span className="italic text-amber-400 font-serif">voz certa</span>.
                </h1>

                <p className="text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed mx-auto lg:mx-0">
                  {APP_CONFIG.subtitle}
                </p>

                {/* Hero Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <Link
                    to="/cadastro"
                    className="w-full sm:w-auto px-8 py-4 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm sm:text-base shadow-xl shadow-amber-500/20 hover:shadow-amber-500/30 flex items-center justify-center gap-2 transition transform hover:-translate-y-0.5"
                  >
                    <span>Criar Minha Conta de Compositor</span>
                    <ArrowRight className="w-5 h-5" />
                  </Link>

                  <a
                    href="#como-funciona"
                    className="w-full sm:w-auto px-6 py-4 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 text-sm font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <span>Como Funciona</span>
                  </a>
                </div>

                {/* Micro trust indicators */}
                <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 border-t border-slate-800/80 text-xs text-slate-400">
                  <div className="flex items-center gap-2 justify-center lg:justify-start">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Contrato Seguro</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center lg:justify-start">
                    <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Negociação Direta</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center lg:justify-start">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Emissão de Liberação</span>
                  </div>
                </div>

              </div>

              {/* Visual Hero Studio Artwork */}
              <div className="lg:col-span-6 xl:col-span-6 w-full pt-4 lg:pt-0">
                <div className="relative mx-auto max-w-2xl lg:max-w-none group">
                  {/* Ambient Background Glow */}
                  <div className="absolute -inset-2 bg-gradient-to-r from-amber-500/25 via-amber-400/15 to-amber-600/30 rounded-[32px] blur-2xl opacity-75 group-hover:opacity-100 transition duration-700 pointer-events-none" />

                  {/* Luxury Glass Frame */}
                  <div className="relative rounded-3xl bg-gradient-to-b from-slate-900/90 via-[#0A1128]/95 to-slate-950/95 border border-amber-500/35 p-2 sm:p-3 shadow-2xl backdrop-blur-xl overflow-hidden min-h-[220px] flex items-center justify-center">
                    {!heroImgFailed ? (
                      <img
                        src={heroComposerStudioImg}
                        alt="Compositor produzindo em estúdio com ecossistema digital do Mercado do Compositor"
                        className="w-full h-auto object-cover rounded-2xl shadow-2xl transform group-hover:scale-[1.012] transition duration-700"
                        loading="eager"
                        width={1024}
                        height={426}
                        onError={() => setHeroImgFailed(true)}
                      />
                    ) : (
                      <div className="w-full aspect-[16/7] rounded-2xl bg-gradient-to-br from-[#0A1128] via-slate-900 to-slate-950 border border-amber-500/20 p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="flex items-center justify-between z-10">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs uppercase tracking-widest text-amber-400 font-semibold">Ecossistema Ativo</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-amber-500/30 text-amber-300 text-xs">
                            <Headphones className="w-3.5 h-3.5" />
                            <span>Estúdio Digital</span>
                          </div>
                        </div>

                        <div className="space-y-2 z-10 my-auto py-4">
                          <div className="inline-flex items-center gap-2 text-amber-400">
                            <Music className="w-6 h-6" />
                            <span className="font-serif italic font-bold text-lg text-white">Mercado do Compositor</span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-300 max-w-md">
                            Conectando compositores independentes a artistas, produtoras e oportunidades de liberação direta.
                          </p>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-400 z-10 pt-2 border-t border-slate-800/80">
                          <span className="flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5 text-amber-400" /> Registro Seguro</span>
                          <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Direitos Autorais</span>
                          <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-400" /> Liberação Ágil</span>
                        </div>
                      </div>
                    )}
                    {/* Inner highlight subtle border */}
                    <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-amber-400/20 pointer-events-none" />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>


        {/* COMO FUNCIONA (4 STEPS) SECTION */}
        <section id="como-funciona-old" className="hidden scroll-mt-24 py-20 bg-white border-b border-slate-200 text-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-amber-600 font-bold text-xs uppercase tracking-widest block">
                Passo a Passo Simples
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif italic text-[#0A1128]">
                Como funciona o Mercado do Compositor
              </h2>
              <p className="text-slate-500 text-base">
                Quatro etapas fáceis para você valorizar seu catálogo e fechar autorizações com segurança.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">

              {/* Step 1 */}
              <div className="bg-[#F1F5F9] border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-amber-400 transition">
                <div className="w-12 h-12 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-serif italic font-bold text-xl shadow-sm">
                  1
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0A1128]">Crie sua conta</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Cadastre seus dados pessoais e seu perfil artístico em poucos minutos com total praticidade.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-[#F1F5F9] border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-amber-400 transition">
                <div className="w-12 h-12 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-serif italic font-bold text-xl shadow-sm">
                  2
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0A1128]">Cadastre suas composições</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Insira a letra e envie a música completa. Ela fica protegida na sua área privada e o sistema gera automaticamente a prévia pública de 85 segundos.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-[#F1F5F9] border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-amber-400 transition">
                <div className="w-12 h-12 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-serif italic font-bold text-xl shadow-sm">
                  3
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0A1128]">Divulgue seu perfil</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Compartilhe sua página pública com artistas, empresários e produtoras de todo o Brasil.
                </p>
              </div>

              {/* Step 4 */}
              <div className="bg-[#F1F5F9] border border-slate-200 p-6 rounded-2xl space-y-4 hover:border-amber-400 transition">
                <div className="w-12 h-12 rounded-xl bg-[#0A1128] text-amber-400 flex items-center justify-center font-serif italic font-bold text-xl shadow-sm">
                  4
                </div>
                <h3 className="text-lg font-serif font-bold text-[#0A1128]">Negocie e envie a liberação</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Receba manifestações de interesse, combine os valores diretamente e emita o documento de autorização.
                </p>
              </div>

            </div>

          </div>
        </section>


        {/* BENEFÍCIOS SECTION */}
        <section id="beneficios-old" className="hidden scroll-mt-24 py-20 bg-[#F1F5F9] text-slate-900 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-amber-600 font-bold text-xs uppercase tracking-widest block">
                Por que usar a plataforma
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif italic text-[#0A1128]">
                Benefícios exclusivos para o compositor
              </h2>
              <p className="text-slate-500 text-base">
                Tudo o que você precisa para gerenciar e profissionalizar suas obras em um único lugar.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {[
                { title: "Perfil profissional", desc: "Sua página própria e elegante para enviar o link direto pelo WhatsApp.", icon: UserPlus },
                { title: "Catálogo organizado", desc: "Acesse rapidamente letras, autores, registros e arquivos em qualquer lugar.", icon: Disc },
                { title: "Proteção do áudio completo", desc: "O áudio completo não é solicitado; somente a prévia pública é enviada.", icon: Lock },
                { title: "Prévia limitada das músicas", desc: "A reprodução trava automaticamente aos 85 segundos para proteger sua autoria.", icon: Headphones },
                { title: "Contato direto com interessados", desc: "Sem intermediários abusivos ou retenções indesejadas na negociação.", icon: MessageSquare },
                { title: "Gestão das solicitações", desc: "Acompanhe propostas recebidas, valores negociados e status de pagamento.", icon: CheckCircle2 },
                { title: "Emissão de liberações", desc: "Gere termos de autorização de gravação profissionais e estruturados.", icon: FileCheck },
                { title: "Maior visibilidade", desc: "Aumente suas chances de ter composições gravadas por grandes artistas.", icon: Sparkles }
              ].map((b, i) => {
                const IconComp = b.icon;
                return (
                  <div key={i} className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-amber-400 transition space-y-3 shadow-xs">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <IconComp className="w-5 h-5" />
                    </div>
                    <h3 className="font-serif font-bold text-[#0A1128] text-base">{b.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{b.desc}</p>
                  </div>
                );
              })}

            </div>

          </div>
        </section>


        {/* VITRINE DE MÚSICAS EM DESTAQUE */}
        {featuredSongs.length > 0 && (
          <section id="vitrine" className="scroll-mt-24 py-20 bg-[#070D1E] text-white border-t border-amber-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

              <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Vitrine de Obras em Destaque</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-serif italic text-white tracking-tight">
                    Composições Selecionadas
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    Ouça prévias exclusivas de 85 segundos e descubra grandes obras prontas para liberação.
                  </p>
                </div>

                <Link
                  to="/compositores"
                  className="text-amber-400 hover:text-amber-300 font-semibold text-xs uppercase tracking-wider flex items-center gap-1 self-start md:self-auto"
                >
                  <span>Explorar Todo o Acervo</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Grid de Músicas em Destaque */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredSongs.map(song => {
                  const isPlaying = playingSongId === song.id;

                  return (
                    <div
                      key={song.id}
                      className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl hover:border-amber-500/40 transition group flex flex-col justify-between space-y-4 backdrop-blur-sm"
                    >
                      <div className="space-y-3">
                        {/* Cover Image with Play Overlay */}
                        <div className="relative rounded-2xl overflow-hidden h-44 bg-slate-950 border border-slate-800 group/cover">
                          <img
                            src={song.coverUrl}
                            alt={song.title}
                            className="w-full h-full object-cover group-hover/cover:scale-105 transition duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                          {/* Play / Pause button */}
                          <button
                            type="button"
                            onClick={() => handlePlayPreview(song)}
                            aria-label={isPlaying ? 'Pausar prévia' : 'Ouvir prévia'}
                            className={`absolute inset-0 m-auto w-14 h-14 rounded-full flex items-center justify-center transition shadow-2xl ${
                              isPlaying
                                ? 'bg-amber-500 text-slate-950 shadow-amber-500/40 scale-105'
                                : 'bg-slate-950/80 hover:bg-amber-500 text-white hover:text-slate-950 border border-amber-500/40 opacity-90 group-hover/cover:opacity-100'
                            }`}
                          >
                            {isPlaying ? (
                              <Pause className="w-6 h-6 fill-current" />
                            ) : (
                              <Play className="w-6 h-6 fill-current ml-1" />
                            )}
                          </button>

                          {/* Tags on cover */}
                          <div className="absolute top-3 left-3 flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-amber-300 bg-slate-950/80 border border-amber-500/30 px-2.5 py-0.5 rounded-full backdrop-blur-md">
                              {song.genre}
                            </span>
                          </div>

                          <div className="absolute top-3 right-3">
                            <span className="text-[10px] font-semibold text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded-full border border-slate-700 backdrop-blur-md flex items-center gap-1">
                              <Headphones className="w-3 h-3 text-amber-400" />
                              <span>Prévia 85s</span>
                            </span>
                          </div>

                          {/* Sound wave animation while playing */}
                          {isPlaying && (
                            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 px-2 py-1 rounded-full backdrop-blur-md">
                              <span className="w-1 h-3 bg-amber-400 rounded-full animate-pulse" />
                              <span className="w-1 h-4 bg-amber-400 rounded-full animate-pulse delay-75" />
                              <span className="w-1 h-2 bg-amber-400 rounded-full animate-pulse delay-150" />
                              <span className="text-[10px] font-bold text-amber-300 ml-1">Tocando</span>
                            </div>
                          )}
                        </div>

                        {/* Song Details */}
                        <div>
                          <h3 className="font-serif italic font-bold text-white text-lg tracking-tight truncate group-hover:text-amber-300 transition-colors">
                            “{song.title}”
                          </h3>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            Composição: <strong className="text-slate-200 font-medium">{song.authors}</strong>
                          </p>
                        </div>
                      </div>

                      {/* Card Footer with Value and Action */}
                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Liberação</span>
                          <strong className="text-xs font-mono font-bold text-emerald-400">
                            {song.valueType === 'suggested' && song.suggestedValue
                              ? `R$ ${song.suggestedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                              : 'Sob Consulta'}
                          </strong>
                        </div>

                        <Link
                          to="/compositores"
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition"
                        >
                          <span>Tenho Interesse</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </section>
        )}


        {/* COMPOSITORES EM DESTAQUE SECTION */}
        {featuredComposers.length > 0 && <section id="compositores-old" className="hidden scroll-mt-24 py-20 bg-[#0A1128] text-white border-t border-amber-500/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
              <div>
                <span className="text-amber-400 font-bold text-xs uppercase tracking-widest block mb-2">
                  Talentos da Plataforma
                </span>
                <h2 className="text-3xl font-serif italic text-white">
                  Compositores em Destaque
                </h2>
              </div>

              <Link
                to="/compositores"
                className="text-amber-400 hover:text-amber-300 font-semibold text-xs uppercase tracking-wider flex items-center gap-1 self-start md:self-auto"
              >
                <span>Ver todos os compositores</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* 3 Featured Composers */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {featuredComposers.map(comp => (
                <div
                  key={comp.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden hover:border-amber-500/40 transition group flex flex-col justify-between shadow-xl"
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

                    <div className="p-6 pt-2 space-y-3 text-center">
                      <h3 className="text-xl font-serif italic font-bold text-white group-hover:text-amber-400 transition-colors">
                        <Link to={`/compositor/${comp.username}`}>
                          {comp.name}
                        </Link>
                      </h3>

                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                        {getSafePublicBio(comp.bio, comp.name, comp.username)}
                      </p>

                      <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                        {comp.genres.map((g, idx) => (
                          <span key={idx} className="text-[10px] bg-slate-800 text-amber-300 px-2.5 py-0.5 rounded-full border border-slate-700">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 pt-0 flex items-center justify-between border-t border-slate-800/60 mt-4">
                    <span className="text-xs text-slate-400">
                      <strong>{comp.songCount}</strong> músicas cadastradas
                    </span>

                    <Link
                      to={`/compositor/${comp.username}`}
                      className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition inline-block text-center"
                    >
                      Ver perfil
                    </Link>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </section>}


        {/* PRICING PLAN SECTION */}
        <section id="planos" className="scroll-mt-24 bg-[#f8f4ed] py-16 text-[#071426] md:py-20">
          <div className="mx-auto grid max-w-[1536px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.82fr_2fr] lg:items-center lg:gap-10 xl:px-16">
            <div className="max-w-xl">
              <span className="mb-5 block text-[11px] font-bold uppercase tracking-[0.32em] text-[#a66b17]">Mais música para um mundo real</span>
              <h2 className="font-serif text-5xl font-semibold leading-[0.96] tracking-tight sm:text-6xl lg:text-[4.4rem]">Planos para cada fase da sua jornada</h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-700">Mais do que planos, oportunidades reais para a sua música chegar mais longe.</p>

              <div className="mt-8 space-y-5 text-base font-medium text-[#122037]">
                <div className="flex items-center gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f1e4cd] text-[#b57920]"><Music className="h-6 w-6" /></span><span>Conecte sua arte<br />a novos artistas</span></div>
                <div className="flex items-center gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f1e4cd] text-[#b57920]"><UserPlus className="h-6 w-6" /></span><span>Faça parte de um ecossistema<br />que valoriza compositores</span></div>
                <div className="flex items-center gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f1e4cd] text-[#b57920]"><Zap className="h-6 w-6" /></span><span>Mais visibilidade, mais histórias,<br />mais música no mundo</span></div>
              </div>
            </div>

            <div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {offeredPlans.map(plan => {
                  const configured = APP_CONFIG.plans.find(item => item.name === plan.name);
                  const highlight = plan.name.toLowerCase().includes('ouro');
                  const features = configured?.features ?? plan.features;
                  const eyebrow = plan.name.includes('Bronze') ? 'O essencial para começar' : plan.name.includes('Prata') ? 'Mais alcance para sua música' : 'Sem limites para o seu talento';
                  return (
                    <article key={plan.name} className={`relative flex min-h-[420px] flex-col rounded-xl border-2 p-5 shadow-sm ${highlight ? 'border-[#d99a2b] bg-[#071426] text-white shadow-xl' : 'border-[#26364b] bg-white/55 text-[#071426]'}`}>
                      {highlight && <div className="absolute -top-4 right-3 rounded-full bg-[#eab74f] px-4 py-1.5 text-xs font-bold text-[#071426]">Mais completo</div>}
                      <div className="flex items-center gap-3">
                        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${highlight ? 'bg-[#f1c45f] text-[#071426]' : 'bg-[#efe5d3] text-[#a66b17]'}`}><Music className="h-5 w-5" /></span>
                        <div><h3 className="font-serif text-2xl font-semibold">{plan.name}</h3><p className={`mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${highlight ? 'text-slate-300' : 'text-slate-600'}`}>{eyebrow}</p></div>
                      </div>
                      <div className="mt-5 flex items-baseline gap-1"><span className="font-serif text-2xl">R$</span><span className="font-serif text-4xl font-semibold">{formatMoneyBR(plan.monthlyPrice)}</span><span className={highlight ? 'text-slate-300' : 'text-slate-600'}>/mês</span></div>
                      <ul className={`mt-5 space-y-2.5 text-[10px] ${highlight ? 'text-slate-200' : 'text-[#172338]'}`}>
                        {features.map(feature => <li key={feature} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#bd7c19]" /><span>{feature}</span></li>)}
                      </ul>
                      <Link to={`/cadastro?plano=${encodeURIComponent(plan.name)}`} className="mt-auto block w-full rounded-lg bg-gradient-to-r from-[#bd7a17] to-[#e9b64f] py-3 text-center font-serif text-lg font-bold text-[#071426] transition hover:brightness-105">Começar agora</Link>
                      <p className={`mt-3 text-center text-[11px] ${highlight ? 'text-slate-300' : 'text-slate-600'}`}>7 dias grátis, sem compromisso</p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ SECTION */}
        <FAQSection />

      </main>

      <Footer />

    </div>
  );
};
