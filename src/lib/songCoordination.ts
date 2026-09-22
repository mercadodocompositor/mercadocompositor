import type { Song, SongStatus, ValueType } from '../types';
import { supabase } from './supabase';
import { removeCurrentUserStorageFiles } from './database';
import { captureException } from './monitoring';

export interface CoordinatedUploadItem {
  kind: 'preview' | 'cover' | 'original';
  bucket: string;
  value: string;
  mediaId?: string;
}

export type CoordinationStage =
  | 'idle'
  | 'checking_capacity'
  | 'uploading'
  | 'validating'
  | 'persisting'
  | 'completed'
  | 'error';

export interface CoordinatedFlowState {
  stage: CoordinationStage;
  uploadedItems: CoordinatedUploadItem[];
  error: string | null;
  canRetryPersistence: boolean;
}

/**
 * Prepara o payload da música com base nos arquivos coordenados já validados
 * ou valores existentes/padrão.
 */
export const buildCoordinatedSongPayload = (params: {
  title: string;
  genre: string;
  subgenre?: string;
  authors: string;
  dateComposed: string;
  lyrics: string;
  coverUrl: string;
  registryCode?: string;
  notes?: string;
  status: SongStatus;
  isAvailableForRelease: boolean;
  valueType: ValueType;
  suggestedValue?: number;
  previewAudioUrl?: string | null;
  previewMediaId?: string | null;
  originalAudioPath?: string | null;
  originalMediaId?: string | null;
}): Partial<Song> => {
  const summary = params.lyrics.length > 120 ? `${params.lyrics.slice(0, 120)}...` : params.lyrics;

  return {
    title: params.title.trim(),
    genre: params.genre,
    subgenre: params.subgenre || '',
    authors: params.authors.trim(),
    dateComposed: params.dateComposed,
    lyrics: params.lyrics,
    coverUrl: params.coverUrl,
    registryCode: params.registryCode || '',
    notes: params.notes || '',
    status: params.status,
    isAvailableForRelease: params.isAvailableForRelease,
    valueType: params.valueType,
    suggestedValue: params.suggestedValue,
    previewAudioUrl: params.previewAudioUrl || undefined,
    previewMediaId: params.previewMediaId || undefined,
    originalAudioPath: params.originalAudioPath || undefined,
    originalMediaId: params.originalMediaId || undefined,
    summary,
  };
};

/**
 * Executa rollback seguro e coordenado de itens enviados ao Storage,
 * capturando exceções para não mascarar a causa raiz do erro de negócio.
 */
export const rollbackCoordinatedUploads = async (
  items: Array<{ bucket: string; value?: string | null; mediaId?: string | null }>
): Promise<boolean> => {
  if (!items || items.length === 0) return true;
  try {
    const validItems = items.filter(item => Boolean(item.value));
    if (validItems.length === 0) return true;
    await removeCurrentUserStorageFiles(validItems);
    return true;
  } catch (err) {
    captureException(err, { operation: 'rollbackCoordinatedUploads', itemsCount: items.length });
    return false;
  }
};

/**
 * Localiza e remove arquivos órfãos não consumidos de tentativas de upload
 * que falharam ou foram abandonadas há mais de determinado tempo.
 */
export const cleanupOrphanedMedia = async (
  userId?: string,
  olderThanHours = 2,
  supabaseClient = supabase
): Promise<number> => {
  if (!supabaseClient) return 0;
  try {
    let targetUserId = userId;
    if (!targetUserId) {
      const { data } = await supabaseClient.auth.getUser();
      targetUserId = data?.user?.id;
    }
    if (!targetUserId) return 0;

    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
    const { data: orphans, error } = await supabaseClient
      .from('validated_media')
      .select('id, bucket_id, object_path')
      .eq('user_id', targetUserId)
      .is('consumed_by_song_id', null)
      .lt('created_at', cutoff)
      .limit(50);

    if (error || !orphans || orphans.length === 0) return 0;

    const filesToRemove = orphans.map(o => ({
      bucket: o.bucket_id,
      value: o.object_path,
      mediaId: o.id,
    }));

    await removeCurrentUserStorageFiles(filesToRemove);

    return orphans.length;
  } catch (err) {
    captureException(err, { operation: 'cleanupOrphanedMedia', userId });
    return 0;
  }
};
