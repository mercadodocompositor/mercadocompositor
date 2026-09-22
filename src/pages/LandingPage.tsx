import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { FAQSection } from '../components/common/FAQSection';
import { APP_CONFIG } from '../config/appConfig';
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
        if (audio.currentTime >= 60) {
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

        {/* HERO SECTION */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden bg-[#0A1128] border-b border-amber-500/20 text-white">

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
        <section id="como-funciona" className="scroll-mt-24 py-20 bg-white border-b border-slate-200 text-slate-900">
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
                  Insira a letra e envie a música completa ou uma prévia pronta de 60 segundos. Ao receber a faixa integral, o sistema mantém somente os primeiros 60 segundos.
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
        <section id="beneficios" className="scroll-mt-24 py-20 bg-[#F1F5F9] text-slate-900 relative">
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
                { title: "Prévia limitada das músicas", desc: "A reprodução trava automaticamente aos 60 segundos para proteger sua autoria.", icon: Headphones },
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
                    Ouça prévias exclusivas de 60 segundos e descubra grandes obras prontas para liberação.
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
                              <span>Prévia 60s</span>
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
        {featuredComposers.length > 0 && <section id="compositores" className="scroll-mt-24 py-20 bg-[#0A1128] text-white border-t border-amber-500/20">
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
        <section id="planos" className="scroll-mt-24 py-20 bg-white text-slate-900 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-amber-600 font-bold text-xs uppercase tracking-widest block">
                Investimento Acessível
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif italic text-[#0A1128]">
                Escolha o Plano Ideal para seu Catálogo
              </h2>
              <p className="text-slate-500 text-base">
                Três opções transparentes para cada fase da sua carreira. Comece com 7 dias grátis.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {offeredPlans.map(plan => {
                // Preço vem do mesmo catálogo que o checkout cobra. Destaque e
                // benefícios são o texto comercial aprovado do appConfig; o
                // catálogo só é usado para planos que não existem lá.
                const configured = APP_CONFIG.plans.find(item => item.name === plan.name);
                const highlight = configured?.highlight ?? false;
                const features = configured?.features ?? plan.features;
                return (
                <div key={plan.name} className={`bg-[#0A1128] text-white rounded-3xl p-7 shadow-2xl relative space-y-6 border-2 ${highlight ? 'border-amber-500' : 'border-slate-800'}`}>
                  {highlight && <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 font-bold text-xs uppercase tracking-widest px-4 py-1 rounded-full">Mais Popular</div>}
                  <div className="text-center border-b border-slate-800 pb-5">
                    <h3 className="text-2xl font-serif italic font-bold">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1 pt-3"><span className="text-slate-400 text-sm">R$</span><span className="text-4xl font-serif italic font-bold text-amber-400">{formatMoneyBR(plan.monthlyPrice)}</span><span className="text-slate-400 text-sm">/ mês</span></div>
                    <p className="mt-2 text-xs font-bold text-emerald-400">7 dias grátis • cobrança só depois</p>
                  </div>
                  <ul className="space-y-3 text-xs text-slate-300">
                    {features.map(feature => <li key={feature} className="flex items-start gap-3"><CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" /><span>{feature}</span></li>)}
                  </ul>
                  <Link to={`/cadastro?plano=${encodeURIComponent(plan.name)}`} className="block w-full py-3 text-center rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm">Testar grátis por 7 dias</Link>
                </div>
                );
              })}
            </div>
            <p className="text-center text-xs text-slate-500 mt-6">Teste disponível uma vez por conta na assinatura automática. Cancele antes do fim e não haverá cobrança. {APP_CONFIG.plan.cancelNotice}</p>

          </div>
        </section>

        {/* FAQ SECTION */}
        <FAQSection />

      </main>

      <Footer />

    </div>
  );
};
