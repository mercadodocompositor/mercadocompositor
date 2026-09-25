import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  ShieldCheck, 
  Lock, 
  Sparkles, 
  FileCheck, 
  CheckCircle2, 
  Music, 
  FileText, 
  RotateCcw,
  ArrowRight
} from 'lucide-react';

interface DemoTrack {
  id: string;
  title: string;
  genre: string;
  composer: string;
  city: string;
  recordedOffer: string;
  lyricsSnippet: string;
  bpm: number;
}

const DEMO_TRACKS: DemoTrack[] = [
  {
    id: '1',
    title: 'Coração Descalço',
    genre: 'Sertanejo Romântico',
    composer: 'Gabriel Monteiro',
    city: 'Goiânia - GO',
    recordedOffer: 'R$ 4.500,00',
    lyricsSnippet: 'Toda vez que você passa por aqui\nMeu coração descalço tenta te seguir\nNão precisa disfarçar esse olhar\nVocê já sabe onde tudo vai parar...',
    bpm: 90
  },
  {
    id: '2',
    title: 'Voz do Vento',
    genre: 'MPB Contemporânea',
    composer: 'Mariana Duarte',
    city: 'Belo Horizonte - MG',
    recordedOffer: 'R$ 3.800,00',
    lyricsSnippet: 'Quem ouve a canção no fim da tarde\nNão imagina quanto amor ainda arde\nCada verso guarda a força do que fomos\nE o caminho lindo que hoje somos...',
    bpm: 80
  },
  {
    id: '3',
    title: 'Sem Medo de Amar',
    genre: 'Forró',
    composer: 'Carlos Santana',
    city: 'Fortaleza - CE',
    recordedOffer: 'R$ 5.200,00',
    lyricsSnippet: 'O paredão tá tocando aquele som\nMas meu pensamento foi no teu batom\nAvisa aí que hoje eu vou te procurar\nQue eu tô solteiro e sem medo de amar...',
    bpm: 120
  }
];

export const HeroInteractiveDemo: React.FC = () => {
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [seconds, setSeconds] = useState(14);
  const [isMuted, setIsMuted] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showOfferDialog, setShowOfferDialog] = useState(false);

  const currentTrack = DEMO_TRACKS[activeTrackIndex];
  const audioContextRef = useRef<AudioContext | null>(null);
  const synthTimerRef = useRef<number | null>(null);

  // Sintetizador suave via Web Audio API para simular a prévia sonora interativa
  const startSynth = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      const ctx = audioContextRef.current;
      if (!ctx) return;

      const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];
      let step = 0;

      const playNextChord = () => {
        if (!isPlaying || isMuted || !ctx || ctx.state !== 'running') return;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[step % notes.length], ctx.currentTime);
        
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
        
        step++;
      };

      synthTimerRef.current = window.setInterval(playNextChord, 450);
    } catch {
      // Navegador com restrição de autoplay ou áudio bloqueado
    }
  };

  const stopSynth = () => {
    if (synthTimerRef.current) {
      clearInterval(synthTimerRef.current);
      synthTimerRef.current = null;
    }
  };

  // Temporizador dos 60 segundos
  useEffect(() => {
    let interval: number | null = null;
    if (isPlaying) {
      startSynth();
      interval = window.setInterval(() => {
        setSeconds(prev => {
          if (prev >= 60) {
            setIsPlaying(false);
            stopSynth();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      stopSynth();
    }

    return () => {
      if (interval) clearInterval(interval);
      stopSynth();
    };
  }, [isPlaying, isMuted]);

  const togglePlay = () => {
    if (seconds >= 60) {
      setSeconds(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const switchTrack = (index: number) => {
    setActiveTrackIndex(index);
    setSeconds(0);
    setShowLyrics(false);
    if (!isPlaying) setIsPlaying(true);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="relative mx-auto max-w-lg lg:max-w-none">
      {/* GLOW DECORATIVO DE FUNDO */}
      <div className="absolute -inset-1.5 bg-gradient-to-r from-amber-500/25 via-amber-400/20 to-amber-600/30 rounded-[36px] blur-xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 pointer-events-none" />

      {/* CARD PRINCIPAL EM GLASSMORPHISM */}
      <div className="relative rounded-3xl bg-gradient-to-b from-slate-900/95 via-[#0A1128]/95 to-slate-950/95 border border-amber-500/30 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl text-white">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPlaying ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </span>
            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-300">
              {isPlaying ? 'Reproduzindo Prévia Pública' : 'Demonstração Interativa'}
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
            <Lock className="w-3 h-3 text-amber-400" />
            <span>Trava de 60s ativa</span>
          </div>
        </div>

        {/* Seleção de Músicas de Demonstração */}
        <div className="pt-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {DEMO_TRACKS.map((track, idx) => {
              const active = idx === activeTrackIndex;
              return (
                <button
                  key={track.id}
                  onClick={() => switchTrack(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/50'
                  }`}
                >
                  {track.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Card do Track e Visualizador */}
        <div className="pt-4 space-y-5">
          <div className="flex items-start gap-4">
            {/* Vinil / Capa Giratória */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-slate-900 p-1 shrink-0 shadow-lg shadow-amber-500/10">
              <div className="w-full h-full rounded-xl bg-slate-950 flex items-center justify-center relative overflow-hidden">
                {/* Vinil Texture */}
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-slate-800 bg-slate-900 flex items-center justify-center ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }}>
                  <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-slate-950 font-bold text-[10px]">
                    MC
                  </div>
                </div>
              </div>
            </div>

            {/* Informações da Música */}
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {currentTrack.genre}
                </span>
                <span className="text-[11px] text-slate-400">• Inédita</span>
              </div>

              <h3 className="text-lg sm:text-xl font-serif font-bold text-white truncate">
                {currentTrack.title}
              </h3>

              <p className="text-xs text-slate-300 flex items-center gap-1">
                <span>Composição:</span>
                <strong className="text-amber-400">{currentTrack.composer}</strong>
              </p>

              <p className="text-[11px] text-slate-400">
                {currentTrack.city} • <span className="text-emerald-400 font-semibold">Disponível para gravação</span>
              </p>
            </div>
          </div>

          {/* Equalizer Animado */}
          <div className="h-9 flex items-end gap-1 px-2 py-1 bg-slate-950/60 rounded-xl border border-slate-800/60">
            {Array.from({ length: 24 }).map((_, i) => {
              const heightMultiplier = isPlaying ? ((i % 5) + 2) * 4 : 4;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-all duration-200"
                  style={{
                    height: `${heightMultiplier}px`,
                    backgroundColor: i < (seconds / 60) * 24 ? '#f59e0b' : '#334155'
                  }}
                />
              );
            })}
          </div>

          {/* Timeline & Controles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-amber-400 font-bold">{formatTime(seconds)}</span>
              <span className="text-slate-400 flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-500" />
                <span>Limite: 01:00 (60s)</span>
              </span>
            </div>

            <div className="relative w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                style={{ width: `${(seconds / 60) * 100}%` }}
              />
            </div>
          </div>

          {/* Botões de Ação do Player */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/25 transition transform active:scale-95 cursor-pointer"
                aria-label={isPlaying ? 'Pausar áudio' : 'Ouvir prévia'}
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => setSeconds(0)}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="Reiniciar prévia"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title={isMuted ? 'Ativar som' : 'Silenciar'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLyrics(!showLyrics)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  showLyrics 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                    : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{showLyrics ? 'Ocultar Letra' : 'Ver Letra'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOfferDialog(true)}
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-md transition cursor-pointer"
              >
                <span>Gravar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Gaveta de Letra da Música */}
          {showLyrics && (
            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/20 text-xs text-slate-300 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold">
                <span>Trecho da Letra Autoral</span>
                <span className="text-[10px] text-slate-400 font-normal">Obra Registrada</span>
              </div>
              <p className="whitespace-pre-line font-serif italic text-slate-200 leading-relaxed">
                "{currentTrack.lyricsSnippet}"
              </p>
            </div>
          )}

          {/* Aviso se atingir os 60s */}
          {seconds >= 60 && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-200 animate-fadeIn">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Prévia encerrada aos 60s.</strong> Para ouvir a obra integral ou combinar a gravação, entre em contato com o autor.
              </span>
            </div>
          )}
        </div>

      </div>

      {/* FLOATING WIDGET 1: NOVA PROPOSTA RECEBIDA (TOP RIGHT) */}
      <div className="hidden sm:flex absolute -top-5 -right-4 md:-right-6 bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md items-center gap-3 animate-bounce hover:animate-none transition" style={{ animationDuration: '6s' }}>
        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Proposta de Gravação</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <p className="text-xs font-bold text-white">Oferta: {currentTrack.recordedOffer}</p>
          <p className="text-[10px] text-slate-400">Direto com o compositor</p>
        </div>
      </div>

      {/* FLOATING WIDGET 2: LIBERAÇÃO DIGITAL EMITIDA (BOTTOM LEFT) */}
      <div className="hidden sm:flex absolute -bottom-5 -left-4 md:-left-6 bg-slate-900/90 border border-amber-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-md items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
          <FileCheck className="w-4 h-4" />
        </div>
        <div className="text-left">
          <p className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Liberação Digital</p>
          <p className="text-xs font-bold text-white">Termo de Autorização PDF</p>
          <p className="text-[10px] text-slate-400">Validação Jurídica Online</p>
        </div>
      </div>

      {/* MODAL / TOAST DE SIMULAÇÃO DE PROPOSTA */}
      {showOfferDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0A1128] border border-amber-500/40 p-6 rounded-3xl max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold font-serif text-white">Interesse em Gravar</h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Na plataforma, artistas e empresários entram em contato diretamente com você para negociar cachês e autorizações de gravação.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                to="/cadastro"
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition"
              >
                Cadastrar Minhas Músicas
              </Link>
              <button
                type="button"
                onClick={() => setShowOfferDialog(false)}
                className="w-full py-2 text-xs text-slate-400 hover:text-white"
              >
                Fechar demonstração
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
