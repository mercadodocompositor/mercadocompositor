import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, Sparkles } from 'lucide-react';

export interface AdminWaveformPlayerProps {
  audioUrl: string;
  title?: string;
  maxPreviewSeconds?: number;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export const AdminWaveformPlayer: React.FC<AdminWaveformPlayerProps> = ({
  audioUrl,
  title,
  maxPreviewSeconds = 60,
  onPlayStateChange
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Generate pseudo-random bar heights based on title/url for visual realism
  const waveformBars = useMemo(() => {
    const bars: number[] = [];
    const seed = (title || audioUrl || 'music').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    for (let i = 0; i < 48; i++) {
      const val = Math.sin(seed + i * 0.45) * 0.4 + Math.cos(seed * 0.5 + i * 0.8) * 0.3 + 0.5;
      bars.push(Math.max(0.18, Math.min(0.95, val)));
    }
    return bars;
  }, [title, audioUrl]);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.volume = isMuted ? 0 : volume;

    const handleLoadedMetadata = () => {
      const audioDuration = Math.min(audio.duration || maxPreviewSeconds, maxPreviewSeconds);
      setDuration(audioDuration);
    };

    const handleTimeUpdate = () => {
      if (audio.currentTime >= maxPreviewSeconds) {
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
        onPlayStateChange?.(false);
      } else {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onPlayStateChange?.(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audioRef.current = null;
    };
  }, [audioUrl, maxPreviewSeconds]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      onPlayStateChange?.(false);
    } else {
      audioRef.current.play().catch(e => console.log('Audio error', e));
      setIsPlaying(true);
      onPlayStateChange?.(true);
    }
  };

  const handleSeek = (index: number) => {
    if (!audioRef.current) return;
    const seekPercent = index / waveformBars.length;
    const targetTime = (duration || maxPreviewSeconds) * seekPercent;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleVolumeToggle = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
            className="w-12 h-12 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 transition transform active:scale-95"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-xs sm:text-sm">{title || 'Prévia Fonográfica'}</span>
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                Até 60s
              </span>
            </div>
            <p className="text-slate-400 text-[11px]">Clique nas ondas sonoras para avançar no tempo</p>
          </div>
        </div>

        {/* Volume & Reset */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                setCurrentTime(0);
              }
            }}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
            title="Reiniciar prévia"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleVolumeToggle}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
            title={isMuted ? 'Ativar Som' : 'Mudo'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-slate-300" />}
          </button>
        </div>
      </div>

      {/* Waveform Visualization Bars */}
      <div className="space-y-1.5 pt-1">
        <div className="h-16 flex items-center gap-[3px] sm:gap-1 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 relative overflow-hidden group/wave select-none">
          {waveformBars.map((heightFactor, index) => {
            const barPercent = (index / waveformBars.length) * 100;
            const isPassed = barPercent <= progressPercent;

            return (
              <div
                key={index}
                onClick={() => handleSeek(index)}
                className="flex-1 h-full flex items-center justify-center cursor-pointer group/bar transition-all"
                title={`Ir para ${formatTime(((duration || maxPreviewSeconds) * index) / waveformBars.length)}`}
              >
                <div
                  className={`w-full rounded-full transition-all duration-150 ${
                    isPassed
                      ? 'bg-gradient-to-t from-amber-500 to-amber-300 shadow-sm shadow-amber-400/30'
                      : 'bg-slate-700 hover:bg-slate-500'
                  }`}
                  style={{ height: `${heightFactor * 100}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Time Progress */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
          <span className="text-amber-400 font-semibold">{formatTime(currentTime)}</span>
          <span>{formatTime(duration || maxPreviewSeconds)}</span>
        </div>
      </div>
    </div>
  );
};
