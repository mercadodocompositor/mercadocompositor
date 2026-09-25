import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ValueType, SongStatus, type Song } from '../../types';
import { resolvePlan } from '../../lib/plans';
import { MUSIC_GENRES, getSubgenresForGenre } from '../../config/musicGenres';
import { DEFAULT_SONG_COVER_URL } from '../../config/media';
import { deleteSongDraft, loadSongById, loadSongDraft, removeCurrentUserStorageFiles, saveSongDraft, uploadCurrentUserFileDetailed, checkUserPlanCapacity, cleanupUserQuarantine, type MediaUploadStage, type SongDraftPayload, type PlanCapacityInfo } from '../../lib/database';
import { getSongSaveStatus, validateSongSubmission } from '../../lib/songWorkflow';
import { getFriendlyErrorMessage } from '../../lib/apiErrors';
import { createAudioPreview } from '../../lib/audioPreview';
import {
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

// Campos do formulário que, quando diferentes da obra salva, indicam alteração
// não concluída. A disponibilidade para propostas fica de fora: ela também é
// fechada pela emissão de uma liberação exclusiva.
const editDraftDiffersFromSong = (draft: Partial<SongDraftPayload>, song: Song) => {
  const text = (value: unknown) => (typeof value === 'string' ? value : '').trim();
  const fields: Array<[unknown, unknown]> = [
    [draft.title, song.title], [draft.genre, song.genre], [draft.subgenre, song.subgenre],
    [draft.authors, song.authors], [draft.dateComposed, song.dateComposed], [draft.lyrics, song.lyrics],
    [draft.registryCode, song.registryCode], [draft.iswc, song.iswc], [draft.notes, song.notes]
  ];
  if (fields.some(([a, b]) => a !== undefined && text(a) !== text(b))) return true;
  if (draft.valueType !== undefined && draft.valueType !== song.valueType) return true;
  if (draft.suggestedValue !== undefined && (draft.suggestedValue === '' ? null : Number(draft.suggestedValue)) !== (song.suggestedValue ?? null)) return true;
  if (typeof draft.coverUrl === 'string' && draft.coverUrl && draft.coverUrl !== DEFAULT_SONG_COVER_URL && draft.coverUrl !== song.coverUrl) return true;
  if (typeof draft.previewAudioUrl === 'string' && draft.previewAudioUrl && draft.previewAudioUrl !== song.previewAudioUrl) return true;
  return false;
};

type UploadKind = 'preview' | 'cover';
type UploadState = { stage: 'idle' | MediaUploadStage | 'error' | 'cancelled'; message?: string };
type MediaErrors = Partial<Record<UploadKind, string>>;
type SongField = NonNullable<ReturnType<typeof validateSongSubmission>['field']>;
type FieldErrors = Partial<Record<SongField, string>>;
const INITIAL_UPLOAD_STATE: Record<UploadKind, UploadState> = {
  preview: { stage: 'idle' }, cover: { stage: 'idle' }
};

export const AddSongTab: React.FC = () => {
  const navigate = useNavigate();
  const { songId: routeSongId } = useParams();
  const [searchParams] = useSearchParams();
  const songId = routeSongId || searchParams.get('id') || undefined;
  const { currentUserId, profile, songs, subscription, addSong, updateSong, platformSettings, isAdminAuthenticated, subscriptionPlans } = useApp();
  const contextualSong = songId ? songs.find(song => song.id === songId) : undefined;
  const [loadedSong, setLoadedSong] = useState<typeof contextualSong>();
  const [songLookupComplete, setSongLookupComplete] = useState(!songId || Boolean(contextualSong));
  const [songLookupError, setSongLookupError] = useState<string | null>(null);
  const [planCapacity, setPlanCapacity] = useState<PlanCapacityInfo | null>(null);
  const existingSong = contextualSong || loadedSong;
  const isEditing = Boolean(songId);
  const appliedSongIdRef = useRef<string | null>(null);

  const [title, setTitle] = useState(existingSong?.title || '');
  const [genre, setGenre] = useState(existingSong?.genre || 'Sertanejo');
  const [subgenre, setSubgenre] = useState(existingSong?.subgenre || 'Sertanejo Universitário');
  const suggestedSubgenres = useMemo(() => getSubgenresForGenre(genre), [genre]);
  const [authors, setAuthors] = useState(existingSong?.authors || profile.stageName);
  const [dateComposed, setDateComposed] = useState(existingSong?.dateComposed || new Date().toISOString().split('T')[0]);
  const [lyrics, setLyrics] = useState(existingSong?.lyrics || '');
  const [registryCode, setRegistryCode] = useState(existingSong?.registryCode || '');
  const [iswc, setIswc] = useState(existingSong?.iswc || '');
  const [notes, setNotes] = useState(existingSong?.notes || '');
  const [status, setStatus] = useState<SongStatus>(existingSong?.status || 'draft');
  const [isAvailableForRelease, setIsAvailableForRelease] = useState(existingSong?.isAvailableForRelease ?? true);
  const [valueType, setValueType] = useState<ValueType>(existingSong?.valueType || 'suggested');
  const [suggestedValue, setSuggestedValue] = useState<number | ''>(existingSong?.suggestedValue ?? 3500);

  // File uploads & URLs
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewSourceFile, setPreviewSourceFile] = useState<File | null>(null);
  const [previewSourceDuration, setPreviewSourceDuration] = useState(0);
  const [previewStartSeconds, setPreviewStartSeconds] = useState(0);
  const [isProcessingPreview, setIsProcessingPreview] = useState(false);
  const [coverFileName, setCoverFileName] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState(existingSong?.coverUrl || DEFAULT_SONG_COVER_URL);
  const [recoveredPreviewMediaId, setRecoveredPreviewMediaId] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState(false);
  const [savedStatus, setSavedStatus] = useState<SongStatus | null>(null);
  const [savedSongId, setSavedSongId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploadStates, setUploadStates] = useState<Record<UploadKind, UploadState>>(INITIAL_UPLOAD_STATE);
  const [mediaErrors, setMediaErrors] = useState<MediaErrors>({});
  const uploadCancellationRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeQuarantinePathsRef = useRef<Set<string>>(new Set());
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftSaveTimeoutRef = useRef<number | null>(null);
  const skipNextAutosaveRef = useRef(false);
  const submissionLockRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const previewProcessingLockRef = useRef(false);
  const formErrorRef = useRef<HTMLDivElement | null>(null);
  const [pendingEditDraft, setPendingEditDraft] = useState<Partial<SongDraftPayload> | null>(null);
  const editDraftSavedRef = useRef(false);
  const redirectTimerRef = useRef<number | null>(null);

  const draftKey = songId || 'new';
  const legacyDraftStorageKey = currentUserId ? `composer-song-draft-${currentUserId}-${draftKey}` : null;

  const activePreviewUrl = previewObjectUrl || existingSong?.previewAudioUrl;
  const defaultCoverUrl = DEFAULT_SONG_COVER_URL;

  const publicationChecklist = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const validSuggestedValue = valueType !== 'suggested' || (Number(suggestedValue) > 0 && Number(suggestedValue) <= 10_000_000);
    const items = [
      { label: 'Título preenchido', ok: title.trim().length > 0 },
      { label: 'Autores preenchidos', ok: authors.trim().length > 0 },
      { label: 'Letra registrada', ok: lyrics.trim().length > 0 },
      { label: 'Data da composição válida', ok: Boolean(dateComposed && dateComposed <= today) },
      { label: 'Prévia pública pronta', ok: Boolean(activePreviewUrl) },
      { label: 'Capa definida', ok: Boolean(coverUrl && coverUrl.trim().length > 0) },
      { label: 'Condição comercial válida', ok: validSuggestedValue }
    ];

    const missing = items.filter(item => !item.ok).map(item => item.label);
    return { missing, isReady: missing.length === 0 };
  }, [activePreviewUrl, authors, coverUrl, dateComposed, lyrics, suggestedValue, title, valueType]);

  const checklistItemCount = 7;
  const completedChecklistItems = checklistItemCount - publicationChecklist.missing.length;
  const formProgress = Math.round((completedChecklistItems / checklistItemCount) * 100);
  const workflowSteps = [
    {
      id: 'dados-da-obra',
      label: 'Dados da obra',
      description: 'Título, autoria e letra',
      complete: Boolean(title.trim() && authors.trim() && lyrics.trim() && dateComposed),
    },
    {
      id: 'midia-da-obra',
      label: 'Áudio e capa',
      description: 'Prévia pública e imagem',
      complete: Boolean(activePreviewUrl && coverUrl),
    },
    {
      id: 'publicacao-da-obra',
      label: 'Publicação',
      description: 'Valor, disponibilidade e status',
      complete: publicationChecklist.isReady,
    },
  ];

  const publicPreviewStatus = !existingSong && !successMessage
    ? 'Rascunho não enviado'
    : status === 'draft'
    ? 'Rascunho'
    : platformSettings.requireApprovalForNewSongs && !isAdminAuthenticated
      ? 'Em aprovação'
      : 'Publicada';

  const publicPreviewSummary = (lyrics || '').trim().replace(/\s+/g, ' ').slice(0, 140) || 'Ainda não há texto da música para mostrar no perfil.';

  useEffect(() => {
    if (!songId || contextualSong) {
      setSongLookupComplete(true);
      return;
    }
    if (!currentUserId) return;
    let cancelled = false;
    setSongLookupComplete(false);
    setSongLookupError(null);
    void loadSongById(currentUserId, songId).then(song => {
      if (!cancelled) setLoadedSong(song || undefined);
    }).catch(error => {
      if (!cancelled) setSongLookupError(error instanceof Error ? error.message : 'Não foi possível carregar a música.');
    }).finally(() => {
      if (!cancelled) setSongLookupComplete(true);
    });
    return () => { cancelled = true; };
  }, [contextualSong, currentUserId, songId]);

  useEffect(() => {
    if (isEditing || !currentUserId) return;
    let cancelled = false;
    void checkUserPlanCapacity(currentUserId).then(cap => {
      if (!cancelled) setPlanCapacity(cap);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentUserId, isEditing]);

  useEffect(() => {
    if (currentUserId) {
      void cleanupUserQuarantine().catch(() => undefined);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!existingSong || appliedSongIdRef.current === existingSong.id) return;
    appliedSongIdRef.current = existingSong.id;
    setTitle(existingSong.title || '');
    setGenre(existingSong.genre || 'Sertanejo');
    setSubgenre(existingSong.subgenre || '');
    setAuthors(existingSong.authors || profile.stageName);
    setDateComposed(existingSong.dateComposed || new Date().toISOString().split('T')[0]);
    setLyrics(existingSong.lyrics || '');
    setRegistryCode(existingSong.registryCode || '');
    setIswc(existingSong.iswc || '');
    setNotes(existingSong.notes || '');
    setStatus(existingSong.status || 'draft');
    setIsAvailableForRelease(existingSong.isAvailableForRelease ?? true);
    setValueType(existingSong.valueType || 'suggested');
    setSuggestedValue(existingSong.suggestedValue ?? '');
    setCoverUrl(existingSong.coverUrl || defaultCoverUrl);
  }, [existingSong, profile.stageName]);

  useEffect(() => {
    setIsDraftHydrated(false);
    if (!currentUserId || !legacyDraftStorageKey || (isEditing && !songLookupComplete)) return;
    let cancelled = false;

    const hydrateDraft = async () => {
      let cloudDraft: SongDraftPayload | null = null;
      try {
        cloudDraft = await loadSongDraft(currentUserId, draftKey);
      } catch {
        if (!cancelled) setFormError('Não foi possível acessar o rascunho sincronizado. Tentaremos recuperar a cópia local existente.');
      }

      try {
        const rawLegacyDraft = window.localStorage.getItem(legacyDraftStorageKey);
        // A cópia local só permanece quando contém alterações mais recentes
        // que ainda não foram confirmadas pelo Supabase.
        const parsedDraft = rawLegacyDraft
          ? JSON.parse(rawLegacyDraft) as Partial<SongDraftPayload>
          : cloudDraft;
        if (cancelled || !parsedDraft) return;

        // Na edição, o banco é a fonte da verdade: um rascunho esquecido de
        // outra sessão não pode sobrescrever a obra em silêncio.
        if (isEditing && existingSong) {
          if (editDraftDiffersFromSong(parsedDraft, existingSong)) setPendingEditDraft(parsedDraft);
          else window.localStorage.removeItem(legacyDraftStorageKey);
          return;
        }
        applyDraft(parsedDraft);
      } catch {
        window.localStorage.removeItem(legacyDraftStorageKey);
        if (!cancelled) setFormError('A cópia local do rascunho estava inválida e foi descartada.');
      } finally {
        if (!cancelled) setIsDraftHydrated(true);
      }
    };

    void hydrateDraft();
    return () => { cancelled = true; };
  }, [currentUserId, draftKey, existingSong?.status, isEditing, legacyDraftStorageKey, songLookupComplete]);

  function applyDraft(parsedDraft: Partial<SongDraftPayload>) {
        if (typeof parsedDraft.title === 'string') setTitle(parsedDraft.title);
        if (typeof parsedDraft.genre === 'string') setGenre(parsedDraft.genre);
        if (typeof parsedDraft.subgenre === 'string') setSubgenre(parsedDraft.subgenre);
        if (typeof parsedDraft.authors === 'string') setAuthors(parsedDraft.authors);
        if (typeof parsedDraft.dateComposed === 'string') setDateComposed(parsedDraft.dateComposed);
        if (typeof parsedDraft.lyrics === 'string') setLyrics(parsedDraft.lyrics);
        if (typeof parsedDraft.registryCode === 'string') setRegistryCode(parsedDraft.registryCode);
        if (typeof parsedDraft.iswc === 'string') setIswc(parsedDraft.iswc);
        if (typeof parsedDraft.notes === 'string') setNotes(parsedDraft.notes);
        // song_drafts guarda somente o formulário; não comprova que a obra foi enviada.
        // Um status antigo salvo após uma tentativa falha não pode virar selo público.
        setStatus(existingSong?.status || 'draft');
        // Uma obra fechada para propostas (ex.: liberação exclusiva) não é reaberta por um rascunho.
        if (typeof parsedDraft.isAvailableForRelease === 'boolean' && existingSong?.isAvailableForRelease !== false) setIsAvailableForRelease(parsedDraft.isAvailableForRelease);
        if (parsedDraft.valueType === 'suggested' || parsedDraft.valueType === 'consultation') setValueType(parsedDraft.valueType);
        if (typeof parsedDraft.suggestedValue === 'number' || parsedDraft.suggestedValue === '') setSuggestedValue(parsedDraft.suggestedValue ?? '');
        if (typeof parsedDraft.coverUrl === 'string' && !parsedDraft.coverUrl.startsWith('blob:') && parsedDraft.coverUrl.trim().length > 0) setCoverUrl(parsedDraft.coverUrl);
        if (typeof parsedDraft.previewAudioUrl === 'string' && !parsedDraft.previewAudioUrl.startsWith('blob:') && parsedDraft.previewAudioUrl.trim().length > 0) {
          setPreviewObjectUrl(parsedDraft.previewAudioUrl);
          setRecoveredPreviewMediaId(parsedDraft.previewMediaId || null);
        }
        if (typeof parsedDraft.previewFileName === 'string') setPreviewFileName(parsedDraft.previewFileName);
        if (typeof parsedDraft.coverFileName === 'string') setCoverFileName(parsedDraft.coverFileName);
  }

  const discardEditDraft = () => {
    setPendingEditDraft(null);
    if (legacyDraftStorageKey) window.localStorage.removeItem(legacyDraftStorageKey);
    if (currentUserId) {
      draftSaveQueueRef.current = draftSaveQueueRef.current
        .catch(() => undefined)
        .then(() => deleteSongDraft(currentUserId, draftKey));
      void draftSaveQueueRef.current.catch(() => setFormError('Não foi possível descartar as alterações salvas.'));
    }
  };

  const restoreEditDraft = () => {
    if (!pendingEditDraft) return;
    applyDraft(pendingEditDraft);
    setPendingEditDraft(null);
  };

  useEffect(() => {
    if (!currentUserId || !isDraftHydrated) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    const payload: SongDraftPayload = {
      title,
      genre,
      subgenre,
      authors,
      dateComposed,
      lyrics,
      registryCode,
      iswc,
      notes,
      status: existingSong?.status || 'draft',
      isAvailableForRelease,
      valueType,
      suggestedValue,
      coverUrl: coverUrl.startsWith('blob:') ? defaultCoverUrl : coverUrl,
      previewAudioUrl: previewObjectUrl?.startsWith('blob:') ? null : (previewObjectUrl || null),
      previewMediaId: recoveredPreviewMediaId || null,
      previewFileName,
      coverFileName,
    };

    if (isEditing && existingSong) {
      if (!editDraftDiffersFromSong(payload, existingSong)) {
        // Sem alteração em relação à obra: não cria rascunho, e desfaz o que
        // esta sessão tinha salvo se o compositor voltou aos valores originais.
        if (editDraftSavedRef.current && !pendingEditDraft) {
          editDraftSavedRef.current = false;
          draftRevisionRef.current += 1;
          if (legacyDraftStorageKey) window.localStorage.removeItem(legacyDraftStorageKey);
          draftSaveQueueRef.current = draftSaveQueueRef.current
            .catch(() => undefined)
            .then(() => deleteSongDraft(currentUserId, draftKey));
          setDraftSaveState('idle');
        }
        return;
      }
      // Editar enquanto o aviso está aberto equivale a descartar a versão antiga.
      if (pendingEditDraft) setPendingEditDraft(null);
      editDraftSavedRef.current = true;
    }

    const revision = ++draftRevisionRef.current;
    setDraftSaveState('saving');
    try {
      // Persistência síncrona: protege inclusive alterações feitas durante o
      // debounce ou imediatamente antes de fechar/navegar para outra página.
      if (legacyDraftStorageKey) window.localStorage.setItem(legacyDraftStorageKey, JSON.stringify(payload));
    } catch {
      setDraftSaveState('error');
      setFormError('Não foi possível criar a cópia local do rascunho. Mantenha esta página aberta até a sincronização terminar.');
    }

    const timeoutId = window.setTimeout(() => {
      draftSaveTimeoutRef.current = null;
      draftSaveQueueRef.current = draftSaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveSongDraft(currentUserId, draftKey, payload));
      void draftSaveQueueRef.current.then(() => {
        if (revision !== draftRevisionRef.current) return;
        if (legacyDraftStorageKey) window.localStorage.removeItem(legacyDraftStorageKey);
        setDraftSavedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        setDraftSaveState('saved');
      }).catch(() => {
        if (revision !== draftRevisionRef.current) return;
        setDraftSaveState('error');
        setFormError('O rascunho está salvo neste dispositivo, mas ainda não foi sincronizado. Verifique sua conexão antes de usar outro dispositivo.');
      });
    }, 700);
    draftSaveTimeoutRef.current = timeoutId;
    return () => {
      window.clearTimeout(timeoutId);
      if (draftSaveTimeoutRef.current === timeoutId) draftSaveTimeoutRef.current = null;
    };
  }, [authors, coverFileName, coverUrl, currentUserId, dateComposed, draftKey, existingSong?.status, genre, isAvailableForRelease, isDraftHydrated, legacyDraftStorageKey, lyrics, notes, previewFileName, previewObjectUrl, recoveredPreviewMediaId, registryCode, iswc, subgenre, suggestedValue, title, valueType]);

  // Os botões de envio ficam no fim do formulário e o aviso, no topo: sem
  // rolar até ele, uma falha parecia um clique que não fez nada.
  useEffect(() => {
    if (formError) formErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [formError]);

  useEffect(() => () => {
    if (redirectTimerRef.current !== null) window.clearTimeout(redirectTimerRef.current);
  }, []);

  useEffect(() => {
    return () => { if (previewObjectUrl?.startsWith('blob:')) URL.revokeObjectURL(previewObjectUrl); };
  }, [previewObjectUrl]);

  useEffect(() => {
    return () => { if (coverUrl.startsWith('blob:')) URL.revokeObjectURL(coverUrl); };
  }, [coverUrl]);

  const hasPendingFiles = Boolean(previewFile || coverFile);
  const isUploadingMedia = (Object.values(uploadStates) as UploadState[]).some(state => state.stage === 'uploading' || state.stage === 'validating');
  const hasUploadError = (Object.values(uploadStates) as UploadState[]).some(state => state.stage === 'error' || state.stage === 'cancelled');
  const updateUploadState = (kind: UploadKind, state: UploadState) => {
    setUploadStates(current => ({ ...current, [kind]: state }));
  };
  const setMediaError = (kind: UploadKind, message?: string) => {
    setMediaErrors(current => ({ ...current, [kind]: message }));
  };
  const clearFieldError = (field: SongField) => {
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const cancelUploads = () => {
    uploadCancellationRef.current = true;
    abortControllerRef.current?.abort();
    setUploadStates(current => Object.fromEntries((Object.entries(current) as Array<[UploadKind, UploadState]>).map(([kind, state]) => [kind, state.stage === 'uploading' || state.stage === 'validating' ? { stage: 'cancelled', message: 'Cancelando com segurança...' } : state])) as Record<UploadKind, UploadState>);
    if (activeQuarantinePathsRef.current.size > 0) {
      const paths: string[] = Array.from(activeQuarantinePathsRef.current);
      activeQuarantinePathsRef.current.clear();
      void removeCurrentUserStorageFiles(paths.map(p => ({ bucket: 'media-quarantine', value: p }))).catch(() => undefined);
    }
  };

  useEffect(() => {
    const shouldWarn = hasPendingFiles || isSubmitting || isProcessingPreview || isUploadingMedia || draftSaveState === 'saving' || draftSaveState === 'error';
    if (!shouldWarn) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [draftSaveState, hasPendingFiles, isSubmitting, isProcessingPreview, isUploadingMedia]);

  useEffect(() => {
    const cleanupActiveQuarantine = () => {
      abortControllerRef.current?.abort();
      if (activeQuarantinePathsRef.current.size > 0) {
        const paths: string[] = Array.from(activeQuarantinePathsRef.current);
        activeQuarantinePathsRef.current.clear();
        void removeCurrentUserStorageFiles(paths.map(p => ({ bucket: 'media-quarantine', value: p }))).catch(() => undefined);
      }
    };
    window.addEventListener('pagehide', cleanupActiveQuarantine);
    return () => {
      window.removeEventListener('pagehide', cleanupActiveQuarantine);
      cleanupActiveQuarantine();
    };
  }, []);

  const processCoverFile = (file: File) => {
    if (submissionLockRef.current || isSubmitting) return;
    if (!isEditing && planCapacity && !planCapacity.canAddSong) {
      setFormError(planCapacity.message || 'Limite de capacidade do plano atingido. Faça upgrade para enviar novas composições.');
      return;
    }
    const validExtension = /\.(jpe?g|png|webp)$/i.test(file.name);
    if ((!file.type.startsWith('image/') && !validExtension) || file.size > 5 * 1024 * 1024) {
      setMediaError('cover', file.size > 5 * 1024 * 1024
        ? `A capa tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é 5 MB. Selecione uma imagem menor.`
        : 'Este formato de capa não é aceito. Selecione uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (coverUrl.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
    setCoverFileName(file.name);
    setCoverFile(file);
    setCoverUrl(URL.createObjectURL(file));
    setMediaError('cover');
    setFormError(null);
  };

  const processPreviewFile = async (file: File, requestedStart = previewStartSeconds) => {
    if (submissionLockRef.current || previewProcessingLockRef.current || isSubmitting) return;
    if (!isEditing && planCapacity && !planCapacity.canAddSong) {
      setFormError(planCapacity.message || 'Limite de capacidade do plano atingido. Faça upgrade para enviar novas composições.');
      return;
    }
    const validExtension = /\.mp3$/i.test(file.name);
    if ((!file.type.startsWith('audio/') && !validExtension) || !validExtension || file.size > 25 * 1024 * 1024) {
      setMediaError('preview', file.size > 25 * 1024 * 1024
        ? `O áudio tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é 25 MB. Selecione um arquivo menor.`
        : 'Este formato de áudio não é aceito. Selecione um arquivo MP3.');
      return;
    }
    previewProcessingLockRef.current = true;
    setIsProcessingPreview(true);
    try {
      const duration = await getAudioDuration(file);
      if (!Number.isFinite(duration) || duration <= 0) {
        setMediaError('preview', 'Não conseguimos identificar a duração do áudio. Verifique o arquivo e tente novamente.');
        return;
      }
      const safeStart = Math.min(Math.max(0, requestedStart), Math.max(0, duration - 1));
      setPreviewSourceFile(file);
      setPreviewSourceDuration(duration);
      const processedPreview = safeStart > 0
        ? await createAudioPreview(file, safeStart)
        : await createAudioPreview(file);
      if (previewObjectUrl?.startsWith('blob:')) URL.revokeObjectURL(previewObjectUrl);
      setPreviewFileName(processedPreview.name); setPreviewFile(processedPreview); setPreviewObjectUrl(URL.createObjectURL(processedPreview)); setMediaError('preview'); clearFieldError('previewAudioUrl'); setFormError(null);
    } catch (error) {
      setMediaError('preview', error instanceof Error ? error.message : 'Não foi possível preparar a prévia. Selecione outro arquivo e tente novamente.');
    } finally {
      previewProcessingLockRef.current = false;
      setIsProcessingPreview(false);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (submissionLockRef.current || isSubmitting) return;
    if (e.target.files && e.target.files[0]) {
      processCoverFile(e.target.files[0]);
    }
  };

  const handlePreviewUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (submissionLockRef.current || previewProcessingLockRef.current || isSubmitting) return;
    const file = event.target.files?.[0];
    if (file) void processPreviewFile(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, kind: 'preview' | 'cover') => {
    event.preventDefault();
    if (submissionLockRef.current || isSubmitting || isProcessingPreview || previewProcessingLockRef.current) return;
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (kind === 'preview') void processPreviewFile(file);
    else processCoverFile(file);
  };

  const clearDraft = () => {
    if (!window.confirm('Descartar este rascunho e todos os arquivos selecionados? Esta ação não pode ser desfeita.')) return;
    skipNextAutosaveRef.current = true;
    draftRevisionRef.current += 1;
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }
    if (legacyDraftStorageKey) window.localStorage.removeItem(legacyDraftStorageKey);
    if (currentUserId) {
      draftSaveQueueRef.current = draftSaveQueueRef.current
        .catch(() => undefined)
        .then(() => deleteSongDraft(currentUserId, draftKey));
      void draftSaveQueueRef.current.catch(() => setFormError('Não foi possível excluir o rascunho sincronizado.'));
    }
    setTitle('');
    setGenre('Sertanejo');
    setSubgenre('Sertanejo Universitário');
    setAuthors(profile.stageName || '');
    setDateComposed(new Date().toISOString().split('T')[0]);
    setLyrics('');
    setRegistryCode('');
    setNotes('');
    setStatus('draft');
    setIsAvailableForRelease(true);
    setValueType('suggested');
    setSuggestedValue(3500);
    setPreviewFileName(null);
    setPreviewFile(null);
    setPreviewObjectUrl(null);
    setPreviewSourceFile(null);
    setPreviewSourceDuration(0);
    setPreviewStartSeconds(0);
    setCoverFileName(null);
    setCoverFile(null);
    setCoverUrl(defaultCoverUrl);
    setDraftSavedAt(null);
    setDraftSaveState('idle');
    setUploadStates(INITIAL_UPLOAD_STATE);
    setMediaErrors({});
    setFieldErrors({});
    setFormError('Rascunho limpo. Você pode começar uma nova composição.');
    setTimeout(() => setFormError(null), 2500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionLockRef.current) return;
    submissionLockRef.current = true;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const requestedStatus: SongStatus = submitter?.value === 'draft' ? 'draft' : 'published';

    const unlockSubmission = () => {
      submissionLockRef.current = false;
    };

    const validation = validateSongSubmission({
      title,
      authors,
      lyrics,
      dateComposed,
      status: requestedStatus,
      valueType,
      suggestedValue,
      previewAudioUrl: previewFile ? 'pending-upload' : activePreviewUrl,
    });

    if (!validation.isValid) {
      setFormError(validation.error || 'Verifique os dados da composição.');
      if (validation.field) {
        setFieldErrors({ [validation.field]: validation.error || 'Revise este campo.' });
        if (validation.field === 'previewAudioUrl') {
          setMediaError('preview', validation.error || 'Selecione uma prévia pública.');
        }
        window.setTimeout(() => document.getElementById(`song-${validation.field}`)?.focus(), 0);
      }
      unlockSubmission();
      return;
    }

    setFieldErrors({});

    if (requestedStatus !== 'draft' && !publicationChecklist.isReady) {
      setFormError(`A música ainda não está pronta para publicação. Complete: ${publicationChecklist.missing.join(', ')}.`);
      const missingMedia = publicationChecklist.missing.some(item => item === 'Prévia pública pronta' || item === 'Capa definida');
      window.setTimeout(() => document.getElementById(missingMedia ? 'midia-da-obra' : 'dados-da-obra')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      unlockSubmission();
      return;
    }


    const currentPlan = resolvePlan(subscriptionPlans, subscription.planName);
    if (!isEditing) {
      // Fora do try principal: se esta consulta falhasse, a trava de envio
      // nunca era liberada e os botões deixavam de responder sem aviso.
      let capacity: PlanCapacityInfo;
      try {
        capacity = await checkUserPlanCapacity(currentUserId);
      } catch (error) {
        setFormError(getFriendlyErrorMessage(error, 'Não foi possível verificar a capacidade do seu plano. Tente novamente.'));
        unlockSubmission();
        return;
      }
      setPlanCapacity(capacity);
      if (!capacity.canAddSong) {
        setFormError(capacity.message || `O ${capacity.planName || currentPlan.name} permite até ${capacity.maxSongs || currentPlan.maxSongs} músicas. Altere seu plano para ampliar o catálogo.`);
        unlockSubmission();
        return;
      }
    }

    setIsSubmitting(true);
    // O rascunho também envia e guarda a mídia. Antes os arquivos escolhidos
    // eram descartados no "salvar rascunho" (a trigger de banco apagava as
    // referências de qualquer forma), então voltar para publicar exigia
    // reselecionar capa e prévia. A validação de mídia continua acontecendo na
    // publicação/envio para aprovação, que é quando a obra fica visível.
    uploadCancellationRef.current = false;
    abortControllerRef.current = new AbortController();
    setUploadStates({
      preview: { stage: previewFile ? 'uploading' : 'idle' },
      cover: { stage: coverFile ? 'uploading' : 'idle' }
    });

    const newUploads: Array<{ bucket: string; value: string; mediaId: string }> = [];
    try {
      const uploadMedia = async (kind: UploadKind, bucket: string, file: File) => {
        try {
          const onStage = (stage: MediaUploadStage) => {
            if (!uploadCancellationRef.current) updateUploadState(kind, { stage });
          };
          const result = await uploadCurrentUserFileDetailed(bucket, file, {
            onStage,
            signal: abortControllerRef.current?.signal,
            onQuarantinePath: (qPath) => activeQuarantinePathsRef.current.add(qPath)
          });
          activeQuarantinePathsRef.current.delete(result.quarantinePath);
          return { kind, bucket, value: result.value, mediaId: result.mediaId };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Falha no envio do arquivo.';
          updateUploadState(kind, { stage: 'error', message });
          setMediaError(kind, message);
          throw error;
        }
      };

      const pendingUploads = [
        ...(previewFile ? [uploadMedia('preview', 'song-previews', previewFile)] : []),
        ...(coverFile ? [uploadMedia('cover', 'song-covers', coverFile)] : [])
      ];
      const results = await Promise.allSettled(pendingUploads);
      const completedUploads = results
        .filter((result): result is PromiseFulfilledResult<{ kind: UploadKind; bucket: string; value: string; mediaId: string }> => result.status === 'fulfilled')
        .map(result => result.value);
      newUploads.push(...completedUploads.map(({ bucket, value, mediaId }) => ({ bucket, value, mediaId })));

      if (uploadCancellationRef.current) {
        completedUploads.forEach(({ kind }) => updateUploadState(kind, { stage: 'cancelled', message: 'Envio cancelado.' }));
        throw new Error('Envio cancelado. Os arquivos concluídos foram removidos com segurança.');
      }
      const failedUpload = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failedUpload) throw failedUpload.reason;

      const storedPreview = previewFile
        ? completedUploads.find(item => item.kind === 'preview')?.value
        : activePreviewUrl;
      const storedPreviewMediaId = previewFile
        ? completedUploads.find(item => item.kind === 'preview')?.mediaId
        : (recoveredPreviewMediaId || existingSong?.previewMediaId);
      const storedCover = coverFile
        ? completedUploads.find(item => item.kind === 'cover')?.value || defaultCoverUrl
        : (coverUrl || defaultCoverUrl);
      const effectiveStatus = getSongSaveStatus(requestedStatus, existingSong?.status, platformSettings.requireApprovalForNewSongs, isAdminAuthenticated);

      if (effectiveStatus !== 'draft' && storedPreview && !storedPreviewMediaId && !existingSong) {
        setIsSubmitting(false);
        setFormError('Para cadastrar ou publicar a composição, selecione o arquivo MP3 da prévia novamente para validação segura.');
        unlockSubmission();
        return;
      }

      const songData = {
        title: title.trim(),
        genre,
        subgenre: subgenre || '',
        authors: authors.trim(),
        dateComposed,
        lyrics: lyrics || '',
        coverUrl: storedCover,
        registryCode: registryCode || '',
        iswc: iswc.trim(),
        notes: notes || '',
        status: effectiveStatus,
        isAvailableForRelease,
        valueType,
        suggestedValue: valueType === 'suggested' && suggestedValue && Number(suggestedValue) > 0 ? Number(suggestedValue) : undefined,
        previewAudioUrl: storedPreview,
        previewMediaId: storedPreviewMediaId,
        summary: lyrics.length > 120 ? `${lyrics.slice(0, 120)}...` : lyrics
    };

    let completedSongId = existingSong?.id || null;
    if (existingSong) {
      await updateSong(existingSong.id, songData);

      const replacedFiles = [
        ...(previewFile ? [{ bucket: 'song-previews', value: existingSong.previewAudioUrl }] : []),
        ...(coverFile ? [{ bucket: 'song-covers', value: existingSong.coverUrl }] : [])
      ];
      if (replacedFiles.length) {
        try { await removeCurrentUserStorageFiles(replacedFiles); } catch { /* A música já foi salva; a limpeza pode ser repetida posteriormente. */ }
      }
    }
    else {
      const createdSong = await addSong(songData);
      completedSongId = createdSong.id;
    }

    setIsSubmitting(false);
    setStatus(effectiveStatus);
    setSavedStatus(effectiveStatus);
    setSavedSongId(completedSongId);
    setSuccessMessage(true);
    setIsDraftHydrated(false);
    if (legacyDraftStorageKey) window.localStorage.removeItem(legacyDraftStorageKey);
    if (currentUserId) {
      await draftSaveQueueRef.current.catch(() => undefined);
      await deleteSongDraft(currentUserId, draftKey).catch(() => undefined);
    }

    redirectTimerRef.current = window.setTimeout(() => navigate('/dashboard/musicas'), 5000);
    } catch (error) {
      console.error('[AddSongTab.handleSubmit failure]', error);
      if (activeQuarantinePathsRef.current.size > 0) {
        const paths: string[] = Array.from(activeQuarantinePathsRef.current);
        activeQuarantinePathsRef.current.clear();
        try { await removeCurrentUserStorageFiles(paths.map(p => ({ bucket: 'media-quarantine', value: p }))); } catch { /* ignore */ }
      }
      if (newUploads.length) {
        try { await removeCurrentUserStorageFiles(newUploads); } catch { /* The original save error remains the actionable error. */ }
      }
      if (!uploadCancellationRef.current) {
        setUploadStates(current => Object.fromEntries((Object.entries(current) as Array<[UploadKind, UploadState]>).map(([kind, state]) => [kind, state.stage === 'complete' ? { stage: 'idle', message: 'Será reenviado na próxima tentativa.' } : state])) as Record<UploadKind, UploadState>);
      }
      setIsSubmitting(false);
      unlockSubmission();
      const displayMsg = error instanceof Error && error.message
        ? error.message
        : getFriendlyErrorMessage(error, 'Não foi possível concluir o cadastro da composição.');
      setFormError(displayMsg);
    }
  };

  const renderUploadStatus = (kind: UploadKind) => {
    const state = uploadStates[kind];
    if (state.stage === 'idle' && !state.message) return null;
    const labels: Record<UploadState['stage'], string> = {
      idle: state.message || 'Aguardando nova tentativa',
      uploading: 'Enviando arquivo...',
      validating: 'Validando segurança...',
      complete: 'Arquivo validado',
      error: state.message || 'Falha no envio',
      cancelled: state.message || 'Envio cancelado'
    };
    const isProblem = state.stage === 'error' || state.stage === 'cancelled';
    const isWorking = state.stage === 'uploading' || state.stage === 'validating';
    return (
      <div role="status" className={`mt-3 text-[11px] ${isProblem ? 'text-red-300' : 'text-emerald-300'}`}>
        <div className="mb-1 flex items-center justify-between gap-2"><span>{labels[state.stage]}</span><span>{state.stage === 'uploading' ? 'Etapa 1 de 2' : state.stage === 'validating' ? 'Etapa 2 de 2' : state.stage === 'complete' ? 'Concluído' : ''}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${isProblem ? 'bg-red-500' : 'bg-emerald-500'} ${isWorking ? 'w-1/2 animate-pulse' : state.stage === 'complete' ? 'w-full' : 'w-0'}`} /></div>
      </div>
    );
  };

  if (isEditing && !songLookupComplete) {
    return <div role="status" className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-300">Carregando música...</div>;
  }

  if (isEditing && songLookupComplete && !existingSong) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/30 bg-slate-900 p-8 text-center">
        <p className="text-sm text-red-200">{songLookupError || 'Música não encontrada ou sem permissão de acesso.'}</p>
        <button type="button" onClick={() => navigate('/dashboard/musicas')} className="mt-4 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950">Voltar para minhas músicas</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">

      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard/musicas')}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Minhas Músicas</span>
        </button>

        <div className="flex items-center gap-2">
          {draftSaveState !== 'idle' && (
            <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] uppercase tracking-wide text-slate-300">
              {draftSaveState === 'saving' && 'Sincronizando rascunho...'}
              {draftSaveState === 'saved' && `Formulário recuperável às ${draftSavedAt}`}
              {draftSaveState === 'error' && 'Rascunho não sincronizado'}
            </span>
          )}
          <button
            type="button"
            onClick={clearDraft}
            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-300 hover:text-white"
          >
            Limpar rascunho
          </button>
        </div>
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
          {!isEditing && !successMessage && <p className="mt-2 text-xs text-amber-200">Este formulário ainda não é uma música cadastrada. Para aparecer em Minhas Músicas, use “Salvar rascunho privado” ou “Publicar no perfil”.</p>}
          {subscription.status !== 'active' && !successMessage && (
            <div role="status" className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong className="block">Sua assinatura não está ativa</strong>
                <span className="text-xs text-amber-100/80">Você pode cadastrar e salvar como rascunho, mas só consegue publicar no perfil com uma assinatura ativa.</span>
              </div>
              <button type="button" onClick={() => navigate('/dashboard/assinatura')} className="shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300">Ver assinatura</button>
            </div>
          )}
        </div>

        {/* Rejection Feedback Banner for the Composer */}
        {isEditing && existingSong?.status === 'rejected' && existingSong?.notes && (
          <div role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200 animate-fadeIn space-y-1">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Orientações da Moderação / Motivo da Revisão:</span>
            </div>
            <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed pl-6 font-medium">
              {existingSong.notes}
            </p>
          </div>
        )}

        {/* Success Confirmation Notification required by Section 7 */}
        {successMessage && (
          <div role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/20 p-4 text-emerald-200 animate-fadeIn">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{isEditing ? 'Música atualizada com sucesso' : 'Música cadastrada com sucesso'}</p>
                <p className="mt-1 text-xs font-normal leading-relaxed text-emerald-100/80">{savedStatus === 'pending_approval' ? 'A obra foi enviada para análise. Você poderá acompanhar o status no catálogo.' : savedStatus === 'draft' ? 'A obra foi salva como rascunho privado.' : 'A obra já está disponível no seu perfil público.'}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => navigate('/dashboard/musicas')} className="min-h-11 rounded-xl bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300">Ir para o catálogo</button>
              {savedStatus === 'published' && savedSongId && (
                <button type="button" onClick={() => navigate(`/compositor/${profile.username}?musica=${savedSongId}`)} className="min-h-11 rounded-xl border border-emerald-400/40 px-4 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-500/10">Ver no perfil público</button>
              )}
              <span className="self-center text-[11px] font-normal text-emerald-100/60">Retorno automático ao catálogo em alguns segundos.</span>
            </div>
          </div>
        )}

        {!isEditing && planCapacity && !planCapacity.canAddSong && (
          <div role="alert" className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-200 text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-bold text-amber-300">{planCapacity.planName === 'Não verificado' ? 'Não foi possível verificar o plano' : 'Capacidade do plano atingida'}</p>
                <p className="text-xs text-slate-300 mt-0.5">{planCapacity.message || `Seu plano atual atingiu o limite de ${planCapacity.maxSongs} músicas.`}</p>
              </div>
            </div>
            {planCapacity.planName !== 'Não verificado' && (
              <button
                type="button"
                onClick={() => navigate('/dashboard/assinatura')}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shrink-0 transition"
              >
                Fazer Upgrade
              </button>
            )}
          </div>
        )}

        {pendingEditDraft && (
          <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong className="block">Há alterações desta música que não foram salvas</strong>
              <span className="text-xs text-amber-100/80">Elas ficaram de uma edição anterior. O formulário mostra a versão atual da obra até você decidir.</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={restoreEditDraft} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300">Restaurar alterações</button>
              <button type="button" onClick={discardEditDraft} className="rounded-xl border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/10">Descartar</button>
            </div>
          </div>
        )}

        {formError && (
          <div ref={formErrorRef} role="alert" className="scroll-mt-28 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-200 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="flex-1">{formError}</span>
            <button type="button" onClick={() => setFormError(null)} aria-label="Fechar mensagem de erro" className="text-red-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Preview pública</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <img src={coverUrl || defaultCoverUrl} alt="Preview da capa" className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border border-slate-700 object-cover shrink-0 mx-auto sm:mx-0" />
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-white truncate w-full sm:w-auto">{title.trim() || 'Título da música'}</h3>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300 shrink-0">
                  {publicPreviewStatus}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-300">{authors.trim() || 'Autor não informado'}</p>
              <p className="mt-1 text-xs text-slate-400">{genre} • {subgenre || 'Sem subgênero'}</p>
              <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-slate-400">{publicPreviewSummary}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          <nav aria-label="Etapas do cadastro da composição" className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-white">Progresso do cadastro</p>
                <p className="mt-0.5 text-xs text-slate-400">{completedChecklistItems} de {checklistItemCount} itens essenciais concluídos</p>
              </div>
              <span className="text-sm font-extrabold text-amber-400">{formProgress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label="Progresso do cadastro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={formProgress}>
              <div className="h-full rounded-full bg-amber-400 transition-all duration-300" style={{ width: `${formProgress}%` }} />
            </div>
            <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <li key={step.id}>
                  <a href={`#${step.id}`} className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${step.complete ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${step.complete ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                      {step.complete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs font-bold ${step.complete ? 'text-emerald-300' : 'text-white'}`}>{step.label}</span>
                      <span className="block truncate text-[11px] text-slate-500">{step.description}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Basic Info */}
          <div id="dados-da-obra" className="scroll-mt-28 space-y-1 border-b border-slate-800 pb-2">
            <h2 className="text-base font-bold text-white">1. Dados da obra</h2>
            <p className="text-xs text-slate-400">Informe como a composição será identificada no catálogo.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="song-title" className="block text-xs font-semibold text-slate-300 mb-1">
                Título da Música *
              </label>
              <input
                id="song-title"
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={e => { setTitle(e.target.value); clearFieldError('title'); }}
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? 'song-title-error' : undefined}
                placeholder="Ex: Te Encontrei na Chuva"
                className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none ${fieldErrors.title ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-amber-500'}`}
              />
              {fieldErrors.title && <p id="song-title-error" role="alert" className="mt-1.5 text-xs text-red-300">{fieldErrors.title}</p>}
            </div>

            <div>
              <label htmlFor="song-authors" className="block text-xs font-semibold text-slate-300 mb-1">
                Nome dos Autores / Compositores *
              </label>
              <input
                id="song-authors"
                type="text"
                required={status !== 'draft'}
                maxLength={180}
                value={authors}
                onChange={e => { setAuthors(e.target.value); clearFieldError('authors'); }}
                aria-invalid={Boolean(fieldErrors.authors)}
                aria-describedby={fieldErrors.authors ? 'song-authors-error' : undefined}
                placeholder="Ex: Rafael Monteiro / Lucas Andrade"
                className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none ${fieldErrors.authors ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-amber-500'}`}
              />
              {fieldErrors.authors && <p id="song-authors-error" role="alert" className="mt-1.5 text-xs text-red-300">{fieldErrors.authors}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="song-genre" className="block text-xs font-semibold text-slate-300 mb-1">
                Gênero Musical *
              </label>
              <select
                id="song-genre"
                value={genre}
                onChange={e => {
                  const newG = e.target.value;
                  setGenre(newG);
                  const newSubs = getSubgenresForGenre(newG);
                  if (newSubs.length > 0) {
                    if (!subgenre || !newSubs.includes(subgenre)) {
                      setSubgenre(newSubs[0]);
                    }
                  } else {
                    setSubgenre('');
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {MUSIC_GENRES.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="song-subgenre" className="block text-xs font-semibold text-slate-300">
                  Subgênero / Estilo
                </label>
                <span className="text-[10px] text-slate-400">Sugestões dinâmicas</span>
              </div>
              <input
                id="song-subgenre"
                list="song-subgenres-list"
                type="text"
                value={subgenre}
                maxLength={80}
                onChange={e => setSubgenre(e.target.value)}
                placeholder="Ex: Vanerão, Bailão Sulista, etc."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <datalist id="song-subgenres-list">
                {suggestedSubgenres.map(s => (
                  <option key={s} value={s} />
                ))}
              </datalist>

              {/* Quick suggestion pills */}
              {suggestedSubgenres.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                  {suggestedSubgenres.slice(0, 4).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSubgenre(s)}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition cursor-pointer ${
                        subgenre === s
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="song-dateComposed" className="block text-xs font-semibold text-slate-300 mb-1">
                Data da Composição
              </label>
              <input
                id="song-dateComposed"
                type="date"
                max={new Date().toISOString().split('T')[0]}
                value={dateComposed}
                onChange={e => { setDateComposed(e.target.value); clearFieldError('dateComposed'); }}
                aria-invalid={Boolean(fieldErrors.dateComposed)}
                aria-describedby={fieldErrors.dateComposed ? 'song-dateComposed-error' : undefined}
                className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none ${fieldErrors.dateComposed ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-amber-500'}`}
              />
              {fieldErrors.dateComposed && <p id="song-dateComposed-error" role="alert" className="mt-1.5 text-xs text-red-300">{fieldErrors.dateComposed}</p>}
            </div>
          </div>

          {/* Lyrics */}
          <div>
            <label htmlFor="song-lyrics" className="block text-xs font-semibold text-slate-300 mb-1">
              Letra Completa da Obra *
            </label>
            <textarea
              id="song-lyrics"
              rows={6}
              required={status !== 'draft'}
              minLength={status !== 'draft' ? 20 : undefined}
              maxLength={20000}
              value={lyrics}
              onChange={e => { setLyrics(e.target.value); clearFieldError('lyrics'); }}
              aria-invalid={Boolean(fieldErrors.lyrics)}
              aria-describedby={fieldErrors.lyrics ? 'song-lyrics-error' : undefined}
              placeholder="Digite ou cole a letra da música aqui (separe por versos e refrão)..."
              className={`w-full bg-slate-950 border rounded-xl p-3.5 text-sm text-white focus:outline-none font-mono resize-none leading-relaxed ${fieldErrors.lyrics ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-amber-500'}`}
            />
            {fieldErrors.lyrics && <p id="song-lyrics-error" role="alert" className="mt-1.5 text-xs text-red-300">{fieldErrors.lyrics}</p>}
          </div>

          {/* Uploads permanentes para Storage */}
          <div id="midia-da-obra" className="scroll-mt-28 space-y-1 border-b border-slate-800 pb-2 pt-2">
            <h2 className="text-base font-bold text-white">2. Áudio e capa</h2>
            <p className="text-xs text-slate-400">Prepare o conteúdo que os visitantes verão e ouvirão no perfil público.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Public Preview Upload */}
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, 'preview')}
              aria-busy={isProcessingPreview || ['uploading', 'validating'].includes(uploadStates.preview.stage)}
              className={`bg-slate-950 border-2 border-dashed ${mediaErrors.preview ? 'border-red-500/60' : 'border-slate-800 hover:border-emerald-500/50'} rounded-2xl p-6 text-center space-y-2 transition relative`}
            >
              <input
                id="song-previewAudioUrl"
                type="file"
                disabled={isSubmitting || isProcessingPreview}
                accept="audio/mpeg,.mp3"
                aria-label="Selecionar música completa ou prévia de 60 segundos"
                onChange={handlePreviewUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                <Disc className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-white text-xs">{isProcessingPreview ? 'Gerando MP3 protegido de 60s...' : previewFileName || 'Carregue a música completa ou uma prévia de 60s'}</h4>
              <p className="text-[11px] text-slate-400">
                Você pode enviar <strong className="text-white font-semibold">a música na íntegra</strong> ou <strong className="text-white font-semibold">uma prévia já pronta de até 60 segundos</strong>, em MP3 e com até 25 MB. O sistema armazena somente o trecho de até 60 segundos e todo o restante será descartado.
              </p>
              {renderUploadStatus('preview')}
              {mediaErrors.preview && <p role="alert" className="relative z-10 rounded-lg bg-red-500/10 px-3 py-2 text-left text-xs leading-relaxed text-red-300">{mediaErrors.preview}</p>}
            </div>

            {/* Cover Upload */}
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, 'cover')}
              aria-busy={['uploading', 'validating'].includes(uploadStates.cover.stage)}
              className={`bg-slate-950 border-2 border-dashed ${mediaErrors.cover ? 'border-red-500/60' : 'border-slate-800 hover:border-amber-500/50'} rounded-2xl p-6 text-center space-y-2 transition relative`}
            >
              <input
                type="file"
                disabled={isSubmitting}
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                aria-label="Selecionar imagem de capa"
                onChange={handleCoverUpload}
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
              {renderUploadStatus('cover')}
              {mediaErrors.cover && <p role="alert" className="relative z-10 rounded-lg bg-red-500/10 px-3 py-2 text-left text-xs leading-relaxed text-red-300">{mediaErrors.cover}</p>}
            </div>

          </div>

          {previewSourceFile && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex-1 text-xs font-semibold text-slate-300">
                  Início do trecho público: {Math.floor(previewStartSeconds / 60)}:{String(Math.floor(previewStartSeconds % 60)).padStart(2, '0')}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, Math.floor(previewSourceDuration - 1))}
                    step={1}
                    value={previewStartSeconds}
                    disabled={isProcessingPreview || isSubmitting}
                    onChange={event => setPreviewStartSeconds(Number(event.target.value))}
                    className="mt-2 w-full accent-emerald-400"
                  />
                </label>
                <button
                  type="button"
                  disabled={isProcessingPreview || isSubmitting}
                  onClick={() => void processPreviewFile(previewSourceFile, previewStartSeconds)}
                  className="min-h-10 rounded-xl border border-emerald-500/40 px-4 text-xs font-bold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Gerar novamente
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Duração original: {Math.floor(previewSourceDuration / 60)}:{String(Math.floor(previewSourceDuration % 60)).padStart(2, '0')}. Ajuste o início e gere novamente para ouvir o resultado.</p>
            </div>
          )}

          {(activePreviewUrl || coverUrl) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-300">{previewObjectUrl ? 'Prévia processada (máx. 60s)' : 'Prévia pública (máx. 60s)'}</span>{previewObjectUrl && <button type="button" onClick={() => { URL.revokeObjectURL(previewObjectUrl); setPreviewObjectUrl(null); setRecoveredPreviewMediaId(null); setPreviewFile(null); setPreviewFileName(null); setPreviewSourceFile(null); setPreviewSourceDuration(0); setPreviewStartSeconds(0); }} className="text-xs text-red-400 hover:text-red-300">Remover</button>}</div>
                {activePreviewUrl ? <audio controls src={activePreviewUrl} className="w-full h-10" aria-label="Prévia pública selecionada" onTimeUpdate={event => { if (previewObjectUrl && event.currentTarget.currentTime >= 60) { event.currentTarget.pause(); event.currentTarget.currentTime = 60; } }} /> : <p className="text-xs text-slate-500">Nenhuma prévia pública selecionada.</p>}
                {previewObjectUrl && <p className="text-[11px] text-emerald-300/80">Somente esta nova prévia será publicada ao salvar.</p>}
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
                        setCoverFile(null);
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

          {(previewObjectUrl?.startsWith('blob:') || coverUrl.startsWith('blob:')) && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>A capa e somente a prévia de 60 segundos serão enviadas quando você salvar, inclusive no rascunho. A faixa completa é descartada após o recorte. Se sair sem salvar, selecione os arquivos novamente.</span>
            </div>
          )}

          {/* Registry & Value */}
          <div id="publicacao-da-obra" className="scroll-mt-28 space-y-1 border-b border-slate-800 pb-2 pt-2">
            <h2 className="text-base font-bold text-white">3. Publicação</h2>
            <p className="text-xs text-slate-400">Defina as condições comerciais e escolha entre salvar em privado ou enviar ao catálogo.</p>
          </div>
          {isEditing && existingSong?.status === 'published' && platformSettings.requireApprovalForNewSongs && !isAdminAuthenticated && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Alterações nesta música publicada serão enviadas novamente para aprovação antes de aparecerem no perfil.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Registro ou Identificação da Obra (ECAD / EDA / ISWC)
              </label>
              <input
                type="text"
                value={registryCode}
                maxLength={80}
                onChange={e => setRegistryCode(e.target.value)}
                placeholder="Ex: EDA-GO-2024-9982"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Opcional. Se a obra for inédita e ainda não tiver código de registro, deixe em branco.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Código ISWC
              </label>
              <input
                type="text"
                value={iswc}
                maxLength={40}
                onChange={e => setIswc(e.target.value.toUpperCase())}
                placeholder="Ex: T-123.456.789-0"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Opcional. Aparece no termo de liberação da obra.</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Disponibilidade e Valor de Autorização
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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
                    id="song-suggestedValue"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={suggestedValue}
                    onChange={e => { setSuggestedValue(e.target.value === '' ? '' : Number(e.target.value)); clearFieldError('suggestedValue'); }}
                    aria-invalid={Boolean(fieldErrors.suggestedValue)}
                    aria-describedby={fieldErrors.suggestedValue ? 'song-suggestedValue-error' : undefined}
                    placeholder="Valor em R$"
                    className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none ${fieldErrors.suggestedValue ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-amber-500'}`}
                  />
                )}
              </div>
              {fieldErrors.suggestedValue && <p id="song-suggestedValue-error" role="alert" className="mt-1.5 text-xs text-red-300">{fieldErrors.suggestedValue}</p>}
              <span className="text-[11px] text-slate-500 mt-1 block">Dica: valores regionais costumam variar entre R$ 1.500 e R$ 5.000. O valor final pode ser ajustado com o intérprete.</span>
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

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="submit"
              name="saveIntent"
              value="draft"
              formNoValidate
              disabled={isSubmitting || isProcessingPreview || successMessage}
              className="min-h-14 rounded-xl border border-slate-600 bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Salvar rascunho privado
            </button>
            <button
              type="submit"
              name="saveIntent"
              value="publish"
              disabled={isSubmitting || isProcessingPreview || successMessage}
              className="min-h-14 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 text-sm font-extrabold text-slate-950 shadow-xl shadow-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 fill-slate-950" />
                {isProcessingPreview ? 'Processando áudio...' : isSubmitting ? 'Salvando composição...' : hasUploadError ? 'Tentar envio novamente' : platformSettings.requireApprovalForNewSongs && !isAdminAuthenticated ? 'Enviar para aprovação' : 'Publicar no perfil'}
              </span>
            </button>
          </div>

          {isSubmitting && isUploadingMedia && (
            <button type="button" onClick={cancelUploads} className="w-full rounded-xl border border-red-500/30 px-4 py-3 text-sm font-bold text-red-300 hover:bg-red-500/10">
              Cancelar envio
            </button>
          )}

        </form>

      </div>

    </div>
  );
};
