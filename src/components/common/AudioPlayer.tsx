import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, ShieldAlert, Lock, Music2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PREVIEW_MAX_SECONDS } from '../../config/media';

interface AudioPlayerProps {
  songId: string;
  songTitle: string;
  audioUrl?: string;
  onInterestClick?: () => void;
  maxDurationSeconds?: number; // Padrão: PREVIEW_MAX_SECONDS
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  songId,
  songTitle,
  audioUrl,
  onInterestClick,
  maxDurationSeconds = PREVIEW_MAX_SECONDS
}) => {
  const { incrementPlayCount } = useApp();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [playCountIncremented, setPlayCountIncremented] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasAudioSource = Boolean(audioUrl);

  useEffect(() => {
    // Reset state when song changes
    setIsPlaying(false);
    setCurrentTime(0);
    setHasEnded(false);
    setPlayCountIncremented(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
  }, [songId]);

  // Sync HTML5 Audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      if (time >= maxDurationSeconds) {
        audio.pause();
        audio.currentTime = maxDurationSeconds;
        setCurrentTime(maxDurationSeconds);
        setIsPlaying(false);
        setHasEnded(true);
      } else {
        setCurrentTime(time);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setHasEnded(true);
      if (audio) {
        setCurrentTime(Math.min(audio.currentTime, maxDurationSeconds));
      }
    };

    // Mantém o botão coerente quando o áudio é pausado por fora (outra prévia, fone desconectado).
    const handlePause = () => setIsPlaying(false);

    // Só uma prévia toca por vez: 'play' não borbulha, por isso o listener é em captura.
    const handleOtherPlay = (event: Event) => {
      if (event.target instanceof HTMLMediaElement && event.target !== audio && !audio.paused) audio.pause();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    document.addEventListener('play', handleOtherPlay, true);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      document.removeEventListener('play', handleOtherPlay, true);
    };
  }, [maxDurationSeconds, audioUrl]);

  const togglePlay = () => {
    if (hasEnded || !hasAudioSource) return;

    if (!playCountIncremented) {
      incrementPlayCount(songId);
      setPlayCountIncremented(true);
    }

    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current && audioUrl) {
        audioRef.current.play().catch(() => {
          setIsPlaying(false);
        });
      }
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  const formatTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = Math.min((currentTime / maxDurationSeconds) * 100, 100);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="none"
          controlsList="nodownload" // Disables standard browser audio download button
        />
      )}

      {/* Title & Player Status */}
      <div className="flex items-center justify-between text-xs gap-2">
        <div className="flex items-center gap-2 text-amber-400 font-medium min-w-0">
          <Music2 className="w-4 h-4 animate-pulse shrink-0" />
          <span className="truncate text-slate-200">{songTitle}</span>
        </div>
        <span className="bg-slate-800 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-semibold shrink-0">
          {hasAudioSource ? `Prévia (${maxDurationSeconds}s)` : 'Indisponível'}
        </span>
      </div>

      {/* Waveform / Visualiser Progress Bar */}
      <div className="space-y-1.5">
        <div className="h-10 bg-slate-950 rounded-xl p-2 flex items-center gap-1 overflow-hidden relative border border-slate-800/80">
          
          {/* Progress Overlay */}
          <div 
            className="absolute left-0 top-0 bottom-0 bg-amber-500/15 border-r border-amber-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Simulated Waveform Bars */}
          {Array.from({ length: 32 }).map((_, i) => {
            const barHeight = Math.sin(i * 0.5) * 40 + 50; // Random waveform heights
            const isPlayed = (i / 32) * 100 <= progressPercent;
            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-all duration-200 ${
                  isPlayed 
                    ? 'bg-gradient-to-t from-amber-500 to-amber-300' 
                    : 'bg-slate-800'
                } ${isPlaying ? 'animate-pulse' : ''}`}
                style={{
                  height: `${Math.max(20, isPlaying ? (barHeight + (i % 3) * 15) % 90 : barHeight)}%`
                }}
              />
            );
          })}
        </div>

        {/* Time display */}
        <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-mono text-slate-400">
          <span>{formatTime(currentTime)}</span>
          <span className="text-slate-500">
            {formatTime(maxDurationSeconds)} (Máximo de fábrica)
          </span>
        </div>
      </div>

      {/* Play Controls */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={hasEnded || !hasAudioSource}
            aria-label={!hasAudioSource ? `Prévia de ${songTitle} indisponível` : hasEnded ? `Prévia de ${songTitle} encerrada` : isPlaying ? `Pausar prévia de ${songTitle}` : `Ouvir prévia de ${songTitle}`}
            className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shadow-lg transition-transform active:scale-95 ${
              hasEnded || !hasAudioSource
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                : isPlaying 
                  ? 'bg-amber-400 text-slate-950 shadow-amber-500/20 hover:bg-amber-300' 
                  : 'bg-amber-500 text-slate-950 shadow-amber-500/30 hover:bg-amber-400'
            }`}
          >
            {hasEnded || !hasAudioSource ? (
              <Lock className="w-5 h-5 text-slate-500" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-slate-950" />
            ) : (
              <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="p-2 text-slate-400 hover:text-slate-200 transition"
            title={isMuted ? 'Ativar som' : 'Mudar para mudo'}
            aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
            aria-pressed={isMuted}
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {onInterestClick && (
          <button
            type="button"
            onClick={onInterestClick}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-semibold text-xs shadow-md shadow-amber-500/10 flex items-center gap-1.5 transition"
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>Quero Gravar</span>
          </button>
        )}
      </div>

      {/* Limit Notice when ended */}
      {hasEnded && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-200 animate-fadeIn">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-300">
              Prévia encerrada (limite de {maxDurationSeconds} segundos atingido).
            </p>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Entre em contato com o compositor para solicitar a liberação desta obra e ouvir a guia completa.
            </p>
            {onInterestClick && (
              <button
                onClick={onInterestClick}
                className="mt-1 underline font-bold text-amber-400 hover:text-amber-300 block text-xs"
              >
                Clique aqui para enviar uma solicitação de gravação →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
