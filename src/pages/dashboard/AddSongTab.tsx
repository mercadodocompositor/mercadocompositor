import React, { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ValueType, SongStatus } from '../../types';
import { APP_CONFIG } from '../../config/appConfig';
import { uploadCurrentUserFile } from '../../lib/database';
import { 
  Music2, 
  Upload, 
  CheckCircle2, 
  PlusCircle, 
  FileText, 
  Image, 
  Disc, 
  DollarSign, 
  Lock, 
  Sparkles,
  ArrowLeft,
  AlertCircle,
  X
} from 'lucide-react';

const getAudioDuration = (file: File) => new Promise<number>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.onloadedmetadata = () => { const duration = audio.duration; URL.revokeObjectURL(url); resolve(duration); };
  audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a duração da prévia.')); };
  audio.src = url;
});

export const AddSongTab: React.FC = () => {
  const navigate = useNavigate();
  const { songId } = useParams();
  const { profile, songs, subscription, addSong, updateSong } = useApp();
  const existingSong = songId ? songs.find(song => song.id === songId) : undefined;
  const isEditing = Boolean(songId);

  const [title, setTitle] = useState(existingSong?.title || '');
  const [genre, setGenre] = useState(existingSong?.genre || 'Sertanejo');
  const [subgenre, setSubgenre] = useState(existingSong?.subgenre || 'Sertanejo Universitário');
  const [authors, setAuthors] = useState(existingSong?.authors || profile.stageName);
  const [dateComposed, setDateComposed] = useState(existingSong?.dateComposed || new Date().toISOString().split('T')[0]);
  const [lyrics, setLyrics] = useState(existingSong?.lyrics || '');
  const [registryCode, setRegistryCode] = useState(existingSong?.registryCode || '');
  const [notes, setNotes] = useState(existingSong?.notes || '');
  const [status, setStatus] = useState<SongStatus>(existingSong?.status || 'draft');
  const [isAvailableForRelease, setIsAvailableForRelease] = useState(existingSong?.isAvailableForRelease ?? true);
  const [valueType, setValueType] = useState<ValueType>(existingSong?.valueType || 'suggested');
  const [suggestedValue, setSuggestedValue] = useState<number | ''>(existingSong?.suggestedValue ?? 3500);

  // File uploads & URLs
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [audioRemoved, setAudioRemoved] = useState(false);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [coverFileName, setCoverFileName] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState(existingSong?.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80');

  const [successMessage, setSuccessMessage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activeAudioUrl = audioObjectUrl || (!audioRemoved ? existingSong?.audioUrl : undefined);
  const activePreviewUrl = previewObjectUrl || existingSong?.previewAudioUrl;
  const defaultCoverUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';

  const processAudioFile = (file: File) => {
    const validExtension = /\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name);
    if ((!file.type.startsWith('audio/') && !validExtension) || file.size > 25 * 1024 * 1024) {
      setFormError('Selecione um áudio MP3, WAV, M4A, AAC ou OGG com no máximo 25 MB.');
      return;
    }
    if (audioObjectUrl?.startsWith('blob:')) URL.revokeObjectURL(audioObjectUrl);
    setAudioFileName(file.name);
    setAudioFile(file);
    setAudioObjectUrl(URL.createObjectURL(file));
    setAudioRemoved(false);
    setFormError(null);
  };

  const processCoverFile = (file: File) => {
    const validExtension = /\.(jpe?g|png|webp)$/i.test(file.name);
    if ((!file.type.startsWith('image/') && !validExtension) || file.size > 5 * 1024 * 1024) {
      setFormError('Selecione uma capa JPG, PNG ou WebP com no máximo 5 MB.');
      return;
    }
    if (coverUrl.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
    setCoverFileName(file.name);
    setCoverFile(file);
    setCoverUrl(URL.createObjectURL(file));
    setFormError(null);
  };

  const processPreviewFile = async (file: File) => {
    const validExtension = /\.(mp3|m4a|aac|ogg)$/i.test(file.name);
    if ((!file.type.startsWith('audio/') && !validExtension) || file.size > 10 * 1024 * 1024) {
      setFormError('Selecione uma prévia MP3, M4A, AAC ou OGG com no máximo 10 MB.');
      return;
    }
    try {
      const duration = await getAudioDuration(file);
      if (!Number.isFinite(duration) || duration > 35.5) {
        setFormError('A prévia pública deve ter no máximo 35 segundos.');
        return;
      }
      if (previewObjectUrl?.startsWith('blob:')) URL.revokeObjectURL(previewObjectUrl);
      setPreviewFileName(file.name); setPreviewFile(file); setPreviewObjectUrl(URL.createObjectURL(file)); setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível validar a prévia.');
    }
  };

  const handleSimulateAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processAudioFile(e.target.files[0]);
    }
  };

  const handleSimulateCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processCoverFile(e.target.files[0]);
    }
  };

  const handlePreviewUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processPreviewFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, kind: 'audio' | 'preview' | 'cover') => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (kind === 'audio') processAudioFile(file);
    else if (kind === 'preview') void processPreviewFile(file);
    else processCoverFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim() || !authors.trim() || !lyrics.trim()) {
      setFormError('Preencha o título, os autores e a letra da música.');
      return;
    }

    if (dateComposed > new Date().toISOString().split('T')[0]) {
      setFormError('A data da composição não pode estar no futuro.');
      return;
    }

    if (valueType === 'suggested' && (!suggestedValue || Number(suggestedValue) <= 0)) {
      setFormError('Informe um valor sugerido maior que zero.');
      return;
    }

    if (status === 'published' && !activeAudioUrl) {
      setFormError('Adicione um áudio antes de publicar. Você pode salvar a música como rascunho sem áudio.');
      return;
    }

    if (status === 'published' && !activePreviewUrl) {
      setFormError('Adicione uma prévia pública de até 35 segundos antes de publicar.');
      return;
    }

    const currentPlan = APP_CONFIG.plans.find(plan => plan.name === subscription.planName) || APP_CONFIG.plans[0];
    if (!isEditing && currentPlan.maxSongs && songs.length >= currentPlan.maxSongs) {
      setFormError(`O ${currentPlan.name} permite até ${currentPlan.maxSongs} músicas. Altere seu plano para ampliar o catálogo.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const storedAudio = audioFile ? await uploadCurrentUserFile('song-originals',audioFile) : activeAudioUrl;
      const storedPreview = previewFile ? await uploadCurrentUserFile('song-previews',previewFile) : activePreviewUrl;
      const storedCover = coverFile ? await uploadCurrentUserFile('song-covers',coverFile) : (coverUrl || defaultCoverUrl);
      const songData = {
        title,
        genre,
        subgenre,
        authors,
        dateComposed,
        lyrics,
        coverUrl: storedCover,
        registryCode,
        notes,
        status,
        isAvailableForRelease,
        valueType,
        suggestedValue: valueType === 'suggested' && suggestedValue ? Number(suggestedValue) : undefined,
        audioUrl: storedAudio,
        previewAudioUrl: storedPreview,
        summary: lyrics.length > 120 ? `${lyrics.slice(0, 120)}...` : lyrics
    };

    if (existingSong) {
      const updated = await updateSong(existingSong.id, songData);
      if (!updated) throw new Error('Não foi possível salvar as alterações da música.');
    }
    else await addSong(songData);

    setIsSubmitting(false);
    setSuccessMessage(true);

    setTimeout(() => navigate('/dashboard/musicas'), 800);
    } catch (error) {
      setIsSubmitting(false);
      setFormError(error instanceof Error ? error.message : 'Não foi possível enviar os arquivos.');
    }
  };

  if (isEditing && !existingSong) {
    return <Navigate to="/dashboard/musicas" replace />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/dashboard/musicas')}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Minhas Músicas</span>
        </button>

        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-3 py-1 rounded-full font-semibold">
          {isEditing ? 'Edição da Composição' : 'Novo Cadastro no Catálogo'}
        </span>
      </div>

      {/* Main Form Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        
        <div className="border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <PlusCircle className="w-6 h-6 text-amber-400" />
            <span>{isEditing ? 'Editar Composição' : 'Cadastrar Nova Composição'}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isEditing
              ? 'Atualize as informações da obra e salve as alterações no catálogo.'
              : 'Preencha as informações para adicionar a música ao seu perfil e liberar a prévia protegida.'}
          </p>
        </div>

        {/* Success Confirmation Notification required by Section 7 */}
        {successMessage && (
          <div role="status" className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-sm font-bold flex items-center gap-3 animate-fadeIn">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <span>{isEditing ? 'Música atualizada' : 'Música cadastrada'} com sucesso. Redirecionando para o seu catálogo...</span>
          </div>
        )}

        {formError && (
          <div role="alert" className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-200 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="flex-1">{formError}</span>
            <button type="button" onClick={() => setFormError(null)} aria-label="Fechar mensagem de erro" className="text-red-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Título da Música *
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Te Encontrei na Chuva"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nome dos Autores / Compositores *
              </label>
              <input
                type="text"
                required
                maxLength={180}
                value={authors}
                onChange={e => setAuthors(e.target.value)}
                placeholder="Ex: Rafael Monteiro / Lucas Andrade"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Gênero Musical *
              </label>
              <select
                value={genre}
                onChange={e => setGenre(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                <option value="Sertanejo">Sertanejo</option>
                <option value="Romântico">Romântico</option>
                <option value="Gospel">Gospel</option>
                <option value="MPB">MPB</option>
                <option value="Forró">Forró</option>
                <option value="Pop">Pop</option>
                <option value="Samba / Pagode">Samba / Pagode</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Subgênero / Estilo
              </label>
              <input
                type="text"
                value={subgenre}
                maxLength={80}
                onChange={e => setSubgenre(e.target.value)}
                placeholder="Ex: Sertanejo Romântico"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Data da Composição
              </label>
              <input
                type="date"
                max={new Date().toISOString().split('T')[0]}
                value={dateComposed}
                onChange={e => setDateComposed(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Lyrics */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Letra Completa da Obra *
            </label>
            <textarea
              rows={6}
              required
              minLength={20}
              maxLength={20000}
              value={lyrics}
              onChange={e => setLyrics(e.target.value)}
              placeholder="Digite ou cole a letra da música aqui (separe por versos e refrão)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono resize-none leading-relaxed"
            />
          </div>

          {/* Uploads permanentes para Storage */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* Audio Upload */}
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, 'audio')}
              className="bg-slate-950 border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl p-6 text-center space-y-2 transition relative"
            >
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg"
                aria-label="Selecionar arquivo de áudio"
                onChange={handleSimulateAudioUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                <Music2 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-white text-xs">
                {audioFileName ? audioFileName : "Arraste ou selecione o arquivo de áudio (MP3 / WAV)"}
              </h4>
              <p className="text-[11px] text-slate-500">
                MP3, WAV, M4A, AAC ou OGG, até 25 MB.
              </p>
            </div>

            {/* Public Preview Upload */}
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, 'preview')}
              className="bg-slate-950 border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 text-center space-y-2 transition relative"
            >
              <input
                type="file"
                accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,.mp3,.m4a,.aac,.ogg"
                aria-label="Selecionar prévia pública de áudio"
                onChange={handlePreviewUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                <Disc className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-white text-xs">{previewFileName || 'Selecione a prévia pública'}</h4>
              <p className="text-[11px] text-slate-500">Trecho de até 35 segundos e 10 MB. Será ouvido no perfil público.</p>
            </div>

            {/* Cover Upload */}
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, 'cover')}
              className="bg-slate-950 border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl p-6 text-center space-y-2 transition relative"
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                aria-label="Selecionar imagem de capa"
                onChange={handleSimulateCoverUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                <Image className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-white text-xs">
                {coverFileName ? coverFileName : "Arraste ou selecione a Imagem de Capa"}
              </h4>
              <p className="text-[11px] text-slate-500">
                JPG, PNG ou WebP, até 5 MB. Formato quadrado recomendado.
              </p>
            </div>

          </div>

          {(activeAudioUrl || activePreviewUrl || coverUrl) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-300">Prévia do áudio</span>
                  {activeAudioUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        if (audioObjectUrl?.startsWith('blob:')) URL.revokeObjectURL(audioObjectUrl);
                        setAudioObjectUrl(null);
                        setAudioFileName(null);
                        setAudioRemoved(true);
                      }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  )}
                </div>
                {activeAudioUrl ? (
                  <audio controls src={activeAudioUrl} className="w-full h-10" aria-label="Prévia do áudio selecionado" />
                ) : (
                  <p className="text-xs text-slate-500">Nenhum áudio selecionado.</p>
                )}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-300">Prévia pública (máx. 35s)</span>{previewObjectUrl && <button type="button" onClick={() => { URL.revokeObjectURL(previewObjectUrl); setPreviewObjectUrl(null); setPreviewFile(null); setPreviewFileName(null); }} className="text-xs text-red-400 hover:text-red-300">Remover</button>}</div>
                {activePreviewUrl ? <audio controls src={activePreviewUrl} className="w-full h-10" aria-label="Prévia pública selecionada" /> : <p className="text-xs text-slate-500">Nenhuma prévia pública selecionada.</p>}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-300">Prévia da capa</span>
                  {coverUrl !== defaultCoverUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        if (coverUrl.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
                        setCoverUrl(defaultCoverUrl);
                        setCoverFileName(null);
                      }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Usar capa padrão
                    </button>
                  )}
                </div>
                <img src={coverUrl} alt="Prévia da capa da música" className="w-24 h-24 rounded-xl object-cover border border-slate-700" />
              </div>
            </div>
          )}

          {(audioObjectUrl?.startsWith('blob:') || previewObjectUrl?.startsWith('blob:') || coverUrl.startsWith('blob:')) && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Os arquivos selecionados serão enviados ao armazenamento permanente quando você salvar a música.</span>
            </div>
          )}

          {/* Registry & Value */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Registro ou Identificação da Obra (ECAD / EDA / ISRC)
              </label>
              <input
                type="text"
                value={registryCode}
                maxLength={80}
                onChange={e => setRegistryCode(e.target.value)}
                placeholder="Ex: EDA-GO-2024-9982"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Disponibilidade e Valor de Autorização
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={valueType}
                  onChange={e => setValueType(e.target.value as ValueType)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="suggested">Valor Sugerido</option>
                  <option value="consultation">Valor Sob Consulta</option>
                </select>

                {valueType === 'suggested' && (
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={suggestedValue}
                    onChange={e => setSuggestedValue(Number(e.target.value))}
                    placeholder="Valor em R$"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Notes & Status Toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Observações Adicionais para Intérpretes
            </label>
            <input
              type="text"
              value={notes}
              maxLength={300}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Acompanha guia gravada com voz solo e violão acústico."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Status</label>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    checked={status === 'published'}
                    onChange={() => setStatus('published')}
                    className="text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-white font-medium">Publicada no Perfil</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    checked={status === 'draft'}
                    onChange={() => setStatus('draft')}
                    className="text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-slate-400">Rascunho Privado</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Liberação para Gravação</label>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAvailableForRelease}
                  onChange={e => setIsAvailableForRelease(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                <span className="text-slate-300">Disponível para recebimento de propostas de gravação</span>
              </label>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-base shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition transform hover:-translate-y-0.5"
          >
            {isSubmitting ? (
              <span>Salvando composição...</span>
            ) : (
              <>
                <Sparkles className="w-5 h-5 fill-slate-950" />
                <span>{isEditing ? 'Salvar Alterações' : 'Cadastrar Música no Catálogo'}</span>
              </>
            )}
          </button>

        </form>

      </div>

    </div>
  );
};
