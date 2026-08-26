import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Song } from '../../types';
import { InterestModal } from '../common/InterestModal';
import { uploadCurrentUserFile } from '../../lib/database';
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
  Info
} from 'lucide-react';

interface MusicPlayerProps {
  initialSongId?: string;
  onSongSelect?: (song: Song) => void;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({ initialSongId }) => {
  const { songs, addSong, updateSong, incrementPlayCount, profile } = useApp();

  // Mode state: 'player' (Audition Snippet Mode) or 'upload' (Composer Upload Studio)
  const [activeTab, setActiveTab] = useState<'player' | 'upload'>('player');

  // Currently selected song ID or custom local audio track
  const [selectedSongId, setSelectedSongId] = useState<string>(
    initialSongId || (songs.length > 0 ? songs[0].id : '')
  );

  // Local uploaded audio state
  const [localAudioFile, setLocalAudioFile] = useState<File | null>(null);
  const [localAudioUrl, setLocalAudioUrl] = useState<string>('');
  const [localAudioName, setLocalAudioName] = useState<string>('');
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [assignTargetSongId, setAssignTargetSongId] = useState<string>('new');
  
  // New song form when uploading a fresh track
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('Sertanejo');
  const [newAuthors, setNewAuthors] = useState(profile?.stageName || 'Rafael Monteiro');

  // Player state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(35); // 35s max preview limit
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [hasEnded, setHasEnded] = useState<boolean>(false);
  const [playCountIncremented, setPlayCountIncremented] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  // Interest Modal state
  const [interestModalOpen, setInterestModalOpen] = useState<boolean>(false);

  // HTML5 Audio element reference
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  // Active song object from context or fallback
  const currentSong = songs.find(s => s.id === selectedSongId) || (songs.length > 0 ? songs[0] : null);

  // Determine active audio URL (custom local blob URL or song audio URL)
  const activeAudioUrl = localAudioUrl || (currentSong ? currentSong.audioUrl : '');

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

  // Audio time listener & 35-second snippet enforcement
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      // Limit preview duration strictly to 35s or song's real duration if smaller
      const realDur = audio.duration;
      if (!isNaN(realDur) && realDur > 0) {
        setDuration(Math.min(35, Math.floor(realDur)));
      } else {
        setDuration(35);
      }
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      if (time >= 35) {
        audio.pause();
        audio.currentTime = 35;
        setCurrentTime(35);
        setIsPlaying(false);
        setHasEnded(true);
      } else {
        setCurrentTime(time);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setHasEnded(true);
      setCurrentTime(35);
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

  // Simulated timer fallback if HTML5 audio fails or lacks playable stream
  useEffect(() => {
    if (isPlaying && !audioRef.current?.src) {
      timerRef.current = window.setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= 35) {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsPlaying(false);
            setHasEnded(true);
            return 35;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  // Play / Pause toggle
  const togglePlay = () => {
    if (hasEnded) return;

    if (!playCountIncremented && currentSong) {
      incrementPlayCount(currentSong.id);
      setPlayCountIncremented(true);
    }

    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current && activeAudioUrl) {
        audioRef.current.play().catch(() => {
          // If browser blocks audio or network fails, fallback to simulated timer
          setIsPlaying(true);
        });
      }
      setIsPlaying(true);
    }
  };

  // Seek handler (within max 35s limit)
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    const clampedTime = Math.min(35, newTime);
    setCurrentTime(clampedTime);
    if (audioRef.current) {
      audioRef.current.currentTime = clampedTime;
    }
    if (clampedTime < 35 && hasEnded) {
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
    if (!localAudioFile) return;
    try {
      const storedPath = await uploadCurrentUserFile('song-originals', localAudioFile);

      if (assignTargetSongId === 'new') {
        const created = await addSong({
          title: newTitle || localAudioName || 'Música sem título',
          genre: newGenre,
          authors: newAuthors,
          coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
          audioUrl: storedPath,
          originalAudioPath: storedPath,
          lyrics: 'Letra em fase de edição pelo compositor.',
          status: 'draft',
          snippetStartSeconds: 0,
          snippetDurationSeconds: 35
        });
        setSelectedSongId(created.id);
      } else {
        const updated = await updateSong(assignTargetSongId, { audioUrl: storedPath, originalAudioPath: storedPath });
        if (!updated) throw new Error('Não foi possível vincular o áudio à música.');
        setSelectedSongId(assignTargetSongId);
      }

      setUploadSuccess(false);
      setActiveTab('player');
      alert('Áudio original armazenado com segurança. A música permanece em rascunho até a geração da prévia pública.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a música. Tente novamente.');
    }
  };

  // Load a sample audio for testing
  const loadSampleAudio = (sampleType: 'sertanejo' | 'pop' | 'acoustic') => {
    let url = '';
    let name = '';
    if (sampleType === 'sertanejo') {
      url = 'https://actions.google.com/sounds/v1/ambiences/outdoor_acoustic_guitar.ogg';
      name = 'Guia_Sertaneja_Demonstrativa_Acustico.ogg';
    } else if (sampleType === 'pop') {
      url = 'https://actions.google.com/sounds/v1/science_fiction/deep_hum.ogg';
      name = 'Guia_Pop_Urban_Studio_Mix.ogg';
    } else {
      url = 'https://actions.google.com/sounds/v1/human_voices/applause.ogg';
      name = 'Guia_Acustica_Voz_e_Violao.ogg';
    }

    setLocalAudioUrl(url);
    setLocalAudioName(name);
    setNewTitle(name.replace(/_/g, ' ').replace(/\.[^/.]+$/, ""));
    setUploadSuccess(true);
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

  const progressPercent = Math.min((currentTime / 35) * 100, 100);

  return (
    <div className="bg-[#0A1128] text-white border border-amber-500/20 rounded-3xl p-6 shadow-2xl space-y-6">
      
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
                Upload de guias locais e reprodutor com prévia protegida de 35 segundos
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div role="tablist" aria-label="Modos do estúdio de áudio" className="flex items-center gap-1 bg-slate-900 p-1.5 rounded-full border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('player')}
            role="tab"
            aria-selected={activeTab === 'player'}
            className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === 'player'
                ? 'bg-amber-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Headphones className="w-4 h-4" />
            <span>Player (Modo Artista)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            role="tab"
            aria-selected={activeTab === 'upload'}
            className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === 'upload'
                ? 'bg-amber-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload (Modo Compositor)</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PLAYER MODE (AUDITION 35s SNIPPET) */}
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
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 relative overflow-hidden space-y-5">
            
            {/* Top Song Info Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={currentSong?.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80'}
                  alt={currentSong?.title || 'Guia'}
                  className="w-16 h-16 rounded-2xl object-cover border border-amber-500/30 shadow-md"
                />
                <div>
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                    {currentSong?.genre || 'Sertanejo'}
                  </span>
                  <h3 className="font-serif italic font-bold text-2xl text-white mt-1 leading-tight">
                    {currentSong?.title || localAudioName || 'Música Demonstrativa'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Composição por: <strong className="text-slate-200">{currentSong?.authors || profile.stageName}</strong>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="bg-slate-950 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Prévia de 35s</span>
                </span>
                <p className="text-[10px] text-slate-500 mt-1">Proteção de propriedade intelectual</p>
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
                  max="35"
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  disabled={hasEnded}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />

                <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                  <span className="text-amber-400 font-bold">{formatTime(currentTime)}</span>
                  <span className="text-slate-500">00:35 (Limite da Prévia)</span>
                </div>
              </div>
            </div>

            {/* Control Buttons & Volume */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              
              {/* Play & Volume */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={hasEnded}
                  aria-label={hasEnded ? 'Prévia encerrada' : isPlaying ? 'Pausar prévia' : 'Reproduzir prévia'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center font-bold shadow-xl transition transform active:scale-95 ${
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

              {/* Action for Artists */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setInterestModalOpen(true)}
                  className="px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
                >
                  <Send className="w-4 h-4" />
                  <span>Quero Gravar esta Música</span>
                </button>
              </div>

            </div>

            {/* Snippet Lock Alert Notice */}
            {hasEnded && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-200">
                <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-300">
                    Prévia de 35 segundos concluída!
                  </p>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    A guia completa em áudio e a letra na íntegra ficam disponíveis mediante a emissão do termo de liberação pelo compositor.
                  </p>
                  <button
                    onClick={() => setInterestModalOpen(true)}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition"
                  >
                    Solicitar Liberação com o Compositor
                  </button>
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
                      <option value="Sertanejo">Sertanejo</option>
                      <option value="Pagode / Samba">Pagode / Samba</option>
                      <option value="Pop / MPB">Pop / MPB</option>
                      <option value="Forró">Forró</option>
                      <option value="Gospel">Gospel</option>
                      <option value="Urban / Funk">Urban / Funk</option>
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
                  className="px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Salvar Áudio no Catálogo & Abrir Player</span>
                </button>
              </div>
            </form>
          )}

        </div>
      )}

      {/* Interest Modal when artist wants to record */}
      {interestModalOpen && currentSong && (
        <InterestModal
          isOpen={interestModalOpen}
          onClose={() => setInterestModalOpen(false)}
          song={currentSong}
        />
      )}

    </div>
  );
};
