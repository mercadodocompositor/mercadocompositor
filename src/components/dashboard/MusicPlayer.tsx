import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Song } from '../../types';
import { uploadCurrentUserFileDetailed, uploadOriginalWithPreview, checkUserPlanCapacity, removeCurrentUserStorageFiles } from '../../lib/database';
import { DEFAULT_SONG_COVER_URL, PREVIEW_MAX_SECONDS } from '../../config/media';
import { createAudioPreview } from '../../lib/audioPreview';
import { getSongStatusAfterAudioReplacement } from '../../lib/songWorkflow';
import { MUSIC_GENRES } from '../../config/musicGenres';
import {
  Music2,
  Upload,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Lock,
  ShieldAlert,
  Sparkles,
  FileAudio,
  Check,
  Plus,
  Radio,
  Headphones,
  Sliders,
  Copy,
  Trash2,
  Send,
  Info,
  LoaderCircle,
  Edit3,
  ExternalLink,
  Share2,
  RotateCcw
} from 'lucide-react';

interface MusicPlayerProps {
  initialSongId?: string;
  /** Abre direto na aba de envio, já apontando a música que receberá o áudio completo. */
  initialUploadTargetSongId?: string;
  onSongSelect?: (song: Song) => void;
  onCatalogChange?: () => void;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({ initialSongId, initialUploadTargetSongId, onSongSelect, onCatalogChange }) => {
  const { songs, addSong, updateSong, profile, platformSettings, isAdminAuthenticated } = useApp();

  // Mode state: 'player' (Audition Snippet Mode) or 'upload' (Composer Upload Studio)
  const [activeTab, setActiveTab] = useState<'player' | 'upload'>(initialUploadTargetSongId ? 'upload' : 'player');

  // Currently selected song ID or custom local audio track
  const [selectedSongId, setSelectedSongId] = useState<string>(
    initialSongId || (songs.length > 0 ? songs[0].id : '')
  );

  // Local uploaded audio state
  const [localAudioFile, setLocalAudioFile] = useState<File | null>(null);
  const [localAudioUrl, setLocalAudioUrl] = useState<string>('');
  const [localAudioName, setLocalAudioName] = useState<string>('');
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [assignTargetSongId, setAssignTargetSongId] = useState<string>(initialUploadTargetSongId || 'new');

  // New song form when uploading a fresh track
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('Sertanejo');
  const [newAuthors, setNewAuthors] = useState(profile?.stageName || profile?.name || 'Compositor');

  // Player state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(PREVIEW_MAX_SECONDS);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [hasEnded, setHasEnded] = useState<boolean>(false);
  const [playCountIncremented, setPlayCountIncremented] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSavingAudio, setIsSavingAudio] = useState(false);

  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = window.setTimeout(() => setFeedbackMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedbackMessage]);

  const navigate = useNavigate();
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  const handleShareSong = () => {
    if (!currentSong) return;
    const url = `${window.location.origin}/compositor/${profile.username}?musica=${currentSong.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }).catch(() => {
      setShareCopied(false);
    });
  };

  const handleReplay = () => {
    setHasEnded(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  // HTML5 Audio element reference
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Active song object from context or fallback
  const currentSong = songs.find(s => s.id === selectedSongId) || (songs.length > 0 ? songs[0] : null);

  // O player do catálogo deve reproduzir exatamente o arquivo público ouvido pelos visitantes.
  const activeAudioUrl = localAudioUrl || currentSong?.previewAudioUrl || '';

  // Reset playback state when track changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setHasEnded(false);
    setPlayCountIncremented(false);

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
  }, [selectedSongId, localAudioUrl]);

  // Audio time listener & preview-length enforcement
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      // Limit preview duration strictly to PREVIEW_MAX_SECONDS or song's real duration if smaller
      const realDur = audio.duration;
      if (!isNaN(realDur) && realDur > 0) {
        setDuration(Math.min(PREVIEW_MAX_SECONDS, Math.floor(realDur)));
      } else {
        setDuration(PREVIEW_MAX_SECONDS);
      }
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      if (time >= PREVIEW_MAX_SECONDS) {
        audio.pause();
        audio.currentTime = PREVIEW_MAX_SECONDS;
        setCurrentTime(PREVIEW_MAX_SECONDS);
        setIsPlaying(false);
        setHasEnded(true);
      } else {
        setCurrentTime(time);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setHasEnded(true);
      setCurrentTime(currentDuration => Math.min(currentDuration, audio.duration || currentDuration));
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [activeAudioUrl]);

  // Play / Pause toggle
  const togglePlay = () => {
    if (hasEnded || !activeAudioUrl) return;

    // Audição do autor no próprio painel não é reprodução pública: contar aqui
    // inflava play_count e as métricas do dashboard com tráfego interno.
    if (!playCountIncremented && currentSong) {
      setPlayCountIncremented(true);
    }

    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current && activeAudioUrl) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        return;
      }
      setIsPlaying(false);
    }
  };

  // Seek handler (within the preview limit)
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    const clampedTime = Math.min(duration, newTime);
    setCurrentTime(clampedTime);
    if (audioRef.current) {
      audioRef.current.currentTime = clampedTime;
    }
    if (clampedTime < duration && hasEnded) {
      setHasEnded(false);
    }
  };

  // Mute / Volume handlers
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    if (val === 0) setIsMuted(true);
    else setIsMuted(false);
  };

  // File Upload Handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processAudioFile(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processAudioFile(e.dataTransfer.files[0]);
    }
  };

  const processAudioFile = (file: File) => {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)) {
      alert('Por favor, selecione um arquivo de áudio válido (.mp3, .wav, .m4a, .aac, .ogg)');
      return;
    }

    const maxFileSize = 25 * 1024 * 1024;
    if (file.size > maxFileSize) {
      alert('O arquivo deve ter no máximo 25 MB.');
      return;
    }

    // Create local Object URL
    if (localAudioUrl.startsWith('blob:')) URL.revokeObjectURL(localAudioUrl);
    const objectUrl = URL.createObjectURL(file);
    setLocalAudioFile(file);
    setLocalAudioUrl(objectUrl);
    setLocalAudioName(file.name);
    setNewTitle(file.name.replace(/\.[^/.]+$/, "")); // Strip extension for title suggestion
    setUploadSuccess(true);
  };

  // Confirm Assignment / Add to Catalog
  const handleSaveUploadedAudio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localAudioFile || isSavingAudio) return;
    setIsSavingAudio(true);
    const newUploads: Array<{ bucket: string; value: string; mediaId: string }> = [];
    let sentForReapproval = false;
    let createdNewSong = false;
    try {
      if (assignTargetSongId === 'new') {
        const capacity = await checkUserPlanCapacity();
        if (!capacity.canAddSong) {
          setFeedbackMessage({
            type: 'error',
            text: capacity.message || `Limite de músicas atingido no seu plano. Faça upgrade para enviar novas composições.`
          });
          setIsSavingAudio(false);
          return;
        }
      }

      const previewFile = await createAudioPreview(localAudioFile);
      const [storedResult, previewResult] = await Promise.allSettled([
        uploadOriginalWithPreview(localAudioFile, undefined, false),
        uploadCurrentUserFileDetailed('song-previews', previewFile)
      ]);

      if (storedResult.status === 'fulfilled') {
        newUploads.push({ bucket: 'song-originals', value: storedResult.value.value, mediaId: storedResult.value.mediaId });
      }
      if (previewResult.status === 'fulfilled') {
        newUploads.push({ bucket: 'song-previews', value: previewResult.value.value, mediaId: previewResult.value.mediaId });
      }

      if (storedResult.status === 'rejected' || previewResult.status === 'rejected') {
        const uploadError = storedResult.status === 'rejected'
          ? storedResult.reason
          : previewResult.status === 'rejected'
            ? previewResult.reason
            : new Error('Falha ao enviar os arquivos de áudio.');
        throw uploadError;
      }

      const stored = storedResult.value;
      const preview = previewResult.value;
      const storedPath = stored.value;

      if (assignTargetSongId === 'new') {
        createdNewSong = true;
        const created = await addSong({
          title: newTitle || localAudioName || 'Música sem título',
          genre: newGenre,
          authors: newAuthors,
          coverUrl: DEFAULT_SONG_COVER_URL,
          audioUrl: storedPath,
          originalAudioPath: storedPath,
          originalMediaId: stored.mediaId,
          previewAudioUrl: preview.value,
          previewMediaId: preview.mediaId,
          lyrics: 'Letra em fase de edição pelo compositor.',
          dateComposed: new Date().toISOString().split('T')[0],
          isAvailableForRelease: true,
          valueType: 'consultation',
          status: 'draft'
        });
        setSelectedSongId(created.id);
        onSongSelect?.(created);
      } else {
        const targetSong = songs.find(song => song.id === assignTargetSongId);
        if (!targetSong) throw new Error('A música selecionada não está mais disponível. Atualize a página e tente novamente.');
        const nextStatus = getSongStatusAfterAudioReplacement(
          targetSong.status,
          platformSettings.requireApprovalForNewSongs,
          isAdminAuthenticated
        );
        sentForReapproval = targetSong.status === 'published' && nextStatus === 'pending_approval';
        const audioChanges = {
          audioUrl: storedPath,
          originalAudioPath: storedPath,
          originalMediaId: stored.mediaId,
          previewAudioUrl: preview.value,
          previewMediaId: preview.mediaId,
          status: nextStatus,
        };
        const updated = await updateSong(assignTargetSongId, {
          ...audioChanges
        });
        if (!updated) throw new Error('Não foi possível vincular o áudio à música.');
        setSelectedSongId(assignTargetSongId);
        if (targetSong) onSongSelect?.({ ...targetSong, ...audioChanges });
      }

      onCatalogChange?.();
      if (localAudioUrl.startsWith('blob:')) URL.revokeObjectURL(localAudioUrl);
      setLocalAudioFile(null);
      setLocalAudioUrl('');
      setLocalAudioName('');
      setUploadSuccess(false);
      setActiveTab('player');
      setFeedbackMessage({
        type: 'success',
        text: sentForReapproval
          ? 'Áudio atualizado. A música foi retirada temporariamente do perfil e enviada novamente para aprovação.'
          : createdNewSong
            ? 'Áudio original e prévia armazenados com segurança. A nova música permanece em rascunho.'
            : 'Áudio original e prévia atualizados com segurança.'
      });
    } catch (error) {
      if (newUploads.length) {
        try { await removeCurrentUserStorageFiles(newUploads); } catch { /* ignore rollback error */ }
      }
      setFeedbackMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Falha ao processar áudio da composição.'
      });
    } finally {
      setIsSavingAudio(false);
    }
  };

  const copyLocalUrlToClipboard = () => {
    if (activeAudioUrl) {
      navigator.clipboard.writeText(activeAudioUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div className="bg-[#0A1128] text-white border border-amber-500/20 rounded-3xl p-6 shadow-2xl space-y-6">

      {feedbackMessage && (
        <div className={`p-4 rounded-2xl border text-xs font-medium flex items-center justify-between transition animate-fadeIn ${
          feedbackMessage.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-white ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Hidden HTML5 Audio Element */}
      {activeAudioUrl && (
        <audio
          ref={audioRef}
          src={activeAudioUrl}
          preload="metadata"
          controlsList="nodownload"
        />
      )}

      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/30 text-amber-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-serif italic text-white font-bold leading-tight">
                Studio & Player de Áudio
              </h2>
              <p className="text-xs text-slate-400">
                Reprodutor exclusivo para prévias protegidas de até {PREVIEW_MAX_SECONDS} segundos
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div role="tablist" aria-label="Modos do estúdio de áudio" className="flex items-center gap-1 bg-slate-900 p-1.5 rounded-2xl sm:rounded-full border border-slate-800 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('player')}
            role="tab"
            aria-selected={activeTab === 'player'}
            className={`flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 rounded-xl sm:rounded-full text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === 'player'
                ? 'bg-amber-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Headphones className="w-4 h-4 shrink-0" />
            <span className="truncate">Player</span>
          </button>

        </div>
      </div>

      {/* TAB 1: PLAYER MODE (AUDITION PREVIEW SNIPPET) */}
      {activeTab === 'player' && (
        <div className="space-y-6">

          {/* Song Selector Bar */}
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Music2 className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                  Selecione uma composição do seu acervo para testar:
                </label>
                <select
                  value={selectedSongId}
                  onChange={e => setSelectedSongId(e.target.value)}
                  className="w-full bg-[#0A1128] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-amber-500"
                >
                  {songs.map(song => (
                    <option key={song.id} value={song.id}>
                      {song.title} ({song.genre}) — {song.authors}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {localAudioUrl && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-full font-medium shrink-0">
                Áudio Local Carregado
              </span>
            )}
          </div>

          {/* Player Card Visualiser Container */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 sm:p-6 relative overflow-hidden space-y-5">

            {/* Top Song Info Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={currentSong?.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80'}
                  alt={currentSong?.title || 'Guia'}
                  className="w-16 h-16 rounded-2xl object-cover border border-amber-500/30 shadow-md shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                    {currentSong?.genre || 'Sertanejo'}
                  </span>
                  <h3 className="font-serif italic font-bold text-xl sm:text-2xl text-white mt-1 leading-tight truncate">
                    {currentSong?.title || localAudioName || 'Música Demonstrativa'}
                  </h3>
                  <p className="text-xs text-slate-400 truncate">
                    Composição por: <strong className="text-slate-200">{currentSong?.authors || profile.stageName}</strong>
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right flex sm:flex-col items-center sm:items-end justify-between">
                <span className="bg-slate-950 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Prévia de até {PREVIEW_MAX_SECONDS}s</span>
                </span>
                <p className="text-[10px] text-slate-500 mt-1 hidden sm:block">Proteção de propriedade intelectual</p>
              </div>
            </div>

            {/* Dynamic Waveform & Progress Section */}
            <div className="space-y-2">
              <div className="h-16 bg-[#0A1128] rounded-2xl p-3 flex items-center gap-1 overflow-hidden relative border border-slate-800 shadow-inner">

                {/* Progress Fill Background */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-amber-500/20 border-r-2 border-amber-400 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />

                {/* Animated Waveform Frequency Bars */}
                {Array.from({ length: 48 }).map((_, i) => {
                  const baseHeight = Math.sin(i * 0.4) * 35 + 50;
                  const isPlayed = (i / 48) * 100 <= progressPercent;
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-all duration-150 ${
                        isPlayed
                          ? 'bg-gradient-to-t from-amber-500 to-amber-300'
                          : 'bg-slate-800'
                      } ${isPlaying ? 'animate-pulse' : ''}`}
                      style={{
                        height: `${Math.max(15, isPlaying ? (baseHeight + (i % 5) * 18) % 95 : baseHeight)}%`
                      }}
                    />
                  );
                })}
              </div>

              {/* Seek Scrubber Slider */}
              <div className="space-y-1">
                <input
                  aria-label="Posição da reprodução"
                  type="range"
                  min="0"
                  max={duration}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={hasEnded}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />

                <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                  <span className="text-amber-400 font-bold">{formatTime(currentTime)}</span>
                  <span className="text-slate-500">{formatTime(duration)} (duração da prévia)</span>
                </div>
              </div>
            </div>

            {/* Control Buttons & Volume */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">

              {/* Play & Volume */}
              <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={hasEnded}
                  aria-label={hasEnded ? 'Prévia encerrada' : isPlaying ? 'Pausar prévia' : 'Reproduzir prévia'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center font-bold shadow-xl transition transform active:scale-95 shrink-0 ${
                    hasEnded
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : isPlaying
                        ? 'bg-amber-400 text-[#0A1128] shadow-amber-500/30 hover:bg-amber-300'
                        : 'bg-amber-500 text-white shadow-amber-500/30 hover:bg-amber-600'
                  }`}
                >
                  {hasEnded ? (
                    <Lock className="w-6 h-6 text-slate-500" />
                  ) : isPlaying ? (
                    <Pause className="w-6 h-6 fill-[#0A1128]" />
                  ) : (
                    <Play className="w-6 h-6 fill-white ml-1" />
                  )}
                </button>

                <div className="flex items-center gap-2 bg-[#0A1128] px-3.5 py-2 rounded-xl border border-slate-800">
                  <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Ativar som' : 'Silenciar áudio'} className="text-slate-400 hover:text-white transition">
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    aria-label="Volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>

              {/* Actions for Composer */}
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                {currentSong && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard/musicas/${currentSong.id}/editar`)}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Editar Música</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate(`/compositor/${profile.username}?musica=${currentSong.id}`)}
                      disabled={currentSong.status !== 'published'}
                      title={currentSong.status !== 'published' ? 'Disponível após publicar a música' : 'Ver página pública'}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ver no Perfil</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareSong}
                      disabled={currentSong.status !== 'published'}
                      title={currentSong.status !== 'published' ? 'Disponível após publicar a música' : 'Copiar link da música'}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {shareCopied ? <Check className="w-3.5 h-3.5 text-emerald-950" /> : <Share2 className="w-3.5 h-3.5" />}
                      <span>{shareCopied ? 'Link Copiado!' : 'Compartilhar'}</span>
                    </button>
                  </>
                )}
              </div>

            </div>

            {/* Snippet Lock Alert Notice */}
            {hasEnded && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-200 animate-fadeIn">
                <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-300">
                    Fim da prévia protegida ({formatTime(duration)})
                  </p>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    É assim que visitantes e intérpretes ouvem esta obra no perfil público: a reprodução é limitada a {PREVIEW_MAX_SECONDS} segundos com tecnologia de proteção de propriedade intelectual.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleReplay}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition flex items-center gap-1.5 shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Ouvir prévia novamente</span>
                    </button>
                    {currentSong && (
                      <button
                        type="button"
                        onClick={() => navigate(`/dashboard/musicas/${currentSong.id}/editar`)}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-white font-bold text-xs hover:bg-slate-700 transition flex items-center gap-1.5 border border-slate-700"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Editar dados ou áudio</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Audio URL Inspector Box */}
          {activeAudioUrl && (
            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <FileAudio className="w-4 h-4 text-amber-400" />
                  URL do Áudio Local Ativo:
                </span>
                <button
                  onClick={copyLocalUrlToClipboard}
                  className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-semibold"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'Copiado!' : 'Copiar URL'}</span>
                </button>
              </div>
              <code className="block bg-[#0A1128] p-2.5 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] truncate">
                {activeAudioUrl}
              </code>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: COMPOSER UPLOADER STUDIO */}
      {activeTab === 'upload' && (
        <div className="space-y-6">

          {/* Drag and Drop Zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-amber-500/40 hover:border-amber-400 bg-slate-900/80 rounded-3xl p-8 text-center space-y-4 transition cursor-pointer relative"
          >
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-md">
              <Upload className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg font-serif italic font-bold text-white">
                Arraste seu arquivo de áudio aqui
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Suporta .MP3, .WAV, .M4A ou .OGG, até 25 MB. A prévia fica disponível somente nesta sessão.
              </p>
            </div>

            <button
              type="button"
              className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md transition inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Selecionar Arquivo do Computador</span>
            </button>
          </div>

          {/* Form to Assign Uploaded File to Song Catalog */}
          {uploadSuccess && (
            <form onSubmit={handleSaveUploadedAudio} className="bg-slate-900 border border-amber-500/40 p-6 rounded-3xl space-y-4 animate-fadeIn">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Check className="w-5 h-5 text-emerald-400" />
                <h3 className="font-serif italic font-bold text-lg text-white">
                  Arquivo de Áudio Processado com Sucesso!
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Destino no Catálogo:
                  </label>
                  <select
                    value={assignTargetSongId}
                    onChange={e => setAssignTargetSongId(e.target.value)}
                    className="w-full bg-[#0A1128] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="new">+ Cadastrar como uma Nova Música</option>
                    {songs.map(s => (
                      <option key={s.id} value={s.id}>
                        Anexar à música existente: {s.title}
                      </option>
                    ))}
                  </select>
                </div>

                {assignTargetSongId === 'new' && (
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">
                      Título da Música:
                    </label>
                    <input
                      type="text"
                      required
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="Ex: Amor de Segunda-Feira"
                      className="w-full bg-[#0A1128] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              {assignTargetSongId === 'new' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">
                      Gênero Musical:
                    </label>
                    <select
                      value={newGenre}
                      onChange={e => setNewGenre(e.target.value)}
                      className="w-full bg-[#0A1128] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                    >
                      {MUSIC_GENRES.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">
                      Autores:
                    </label>
                    <input
                      type="text"
                      required
                      value={newAuthors}
                      onChange={e => setNewAuthors(e.target.value)}
                      className="w-full bg-[#0A1128] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={isSavingAudio}
                  className="px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
                >
                  {isSavingAudio ? (
                    <>
                      <LoaderCircle className="w-4 h-4 animate-spin" />
                      <span>Salvando Áudio...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Salvar Áudio no Catálogo & Abrir Player</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      )}

    </div>
  );
};
