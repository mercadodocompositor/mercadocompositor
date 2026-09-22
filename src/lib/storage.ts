import { captureException } from './monitoring';

/**
 * Constantes canônicas de todos os buckets do Supabase Storage utilizados pela plataforma.
 */
export const STORAGE_BUCKETS = {
  PROFILE_MEDIA: 'profile-media',
  SONG_COVERS: 'song-covers',
  SONG_PREVIEWS: 'song-previews',
  SONG_ORIGINALS: 'song-originals',
  RELEASE_DOCUMENTS: 'release-documents',
  MEDIA_QUARANTINE: 'media-quarantine',
} as const;

export type StorageBucket = typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS];

export type PublicStorageBucket =
  | typeof STORAGE_BUCKETS.PROFILE_MEDIA
  | typeof STORAGE_BUCKETS.SONG_COVERS
  | typeof STORAGE_BUCKETS.SONG_PREVIEWS;

export type PrivateStorageBucket =
  | typeof STORAGE_BUCKETS.SONG_ORIGINALS
  | typeof STORAGE_BUCKETS.RELEASE_DOCUMENTS
  | typeof STORAGE_BUCKETS.MEDIA_QUARANTINE;

export const PUBLIC_STORAGE_BUCKETS: ReadonlySet<string> = new Set([
  STORAGE_BUCKETS.PROFILE_MEDIA,
  STORAGE_BUCKETS.SONG_COVERS,
  STORAGE_BUCKETS.SONG_PREVIEWS,
]);

export const PRIVATE_STORAGE_BUCKETS: ReadonlySet<string> = new Set([
  STORAGE_BUCKETS.SONG_ORIGINALS,
  STORAGE_BUCKETS.RELEASE_DOCUMENTS,
  STORAGE_BUCKETS.MEDIA_QUARANTINE,
]);

export interface StorageFileRef {
  bucket: StorageBucket | string;
  value?: string | null;
}

export interface StorageRule {
  maxBytes: number;
  kinds: string[];
  maxDuration?: number;
  isPublic: boolean;
}

/**
 * Regras e restrições por bucket correspondentes às políticas do Supabase e à Edge Function.
 */
export const BUCKET_RULES: Record<StorageBucket, StorageRule> = {
  [STORAGE_BUCKETS.PROFILE_MEDIA]: {
    maxBytes: 5 * 1024 * 1024,
    kinds: ['jpg', 'jpeg', 'png', 'webp'],
    isPublic: true,
  },
  [STORAGE_BUCKETS.SONG_COVERS]: {
    maxBytes: 5 * 1024 * 1024,
    kinds: ['jpg', 'jpeg', 'png', 'webp'],
    isPublic: true,
  },
  [STORAGE_BUCKETS.SONG_PREVIEWS]: {
    maxBytes: 25 * 1024 * 1024,
    kinds: ['mp3'],
    maxDuration: 60,
    isPublic: true,
  },
  [STORAGE_BUCKETS.SONG_ORIGINALS]: {
    maxBytes: 25 * 1024 * 1024,
    kinds: ['mp3', 'wav', 'm4a', 'aac', 'ogg'],
    isPublic: false,
  },
  [STORAGE_BUCKETS.RELEASE_DOCUMENTS]: {
    maxBytes: 10 * 1024 * 1024,
    kinds: ['pdf'],
    isPublic: false,
  },
  [STORAGE_BUCKETS.MEDIA_QUARANTINE]: {
    maxBytes: 25 * 1024 * 1024,
    kinds: ['jpg', 'jpeg', 'png', 'webp', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'pdf'],
    isPublic: false,
  },
};

/**
 * Informa se um bucket é publicamente acessível via CDN.
 */
export const isPublicBucket = (bucket: string): boolean =>
  PUBLIC_STORAGE_BUCKETS.has(bucket);

/**
 * Informa se um bucket possui acesso privado restrito (requer URL assinada ou download autenticado).
 */
export const isPrivateBucket = (bucket: string): boolean =>
  PRIVATE_STORAGE_BUCKETS.has(bucket);

/**
 * Higieniza um caminho de Storage, removendo barras duplicadas, espaços e prevenindo path traversal.
 */
export const sanitizeStoragePath = (path: string): string => {
  if (!path) return '';
  const trimmed = path.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';

  // Bloqueia tentativas de path traversal (..)
  const segments = trimmed.split(/\/+/);
  if (segments.some(seg => seg === '..' || seg === '.')) {
    return '';
  }

  return segments.join('/');
};

/**
 * Extrai a extensão limpa de um nome de arquivo ou extensão isolada.
 */
export const extractExtension = (filenameOrExt: string): string => {
  const parts = filenameOrExt.trim().split('.');
  const ext = parts.length > 1 ? parts.pop() : parts[0];
  return (ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Constrói o caminho canônico para um objeto de usuário no Storage.
 * Padrão: {userId}/{fileId}.{ext} ou {userId}/{subfolder}/{fileId}.{ext}
 */
export const buildStoragePath = (
  userId: string,
  filenameOrExt: string,
  subfolder?: string
): string => {
  const cleanUserId = sanitizeStoragePath(userId);
  if (!cleanUserId) {
    throw new Error('Identificador de usuário inválido para caminho de Storage.');
  }

  const ext = extractExtension(filenameOrExt);
  const fileId = crypto.randomUUID();
  const cleanSubfolder = subfolder ? sanitizeStoragePath(subfolder) : '';

  return cleanSubfolder
    ? `${cleanUserId}/${cleanSubfolder}/${fileId}.${ext}`
    : `${cleanUserId}/${fileId}.${ext}`;
};

/**
 * Constrói o caminho temporário de entrada na quarentena antes da validação.
 */
export const buildQuarantinePath = (userId: string, filenameOrExt: string, subfolder?: string): string =>
  buildStoragePath(userId, filenameOrExt, subfolder);

/**
 * Extrai o caminho canônico do objeto (ex: "userId/uuid.ext") a partir de qualquer valor:
 * - Caminho relativo simples: "userId/uuid.ext" ou "/userId/uuid.ext"
 * - Caminho com prefixo do bucket: "song-originals/userId/uuid.ext"
 * - URL pública do Supabase: "https://.../storage/v1/object/public/bucket/userId/uuid.ext"
 * - URL assinada do Supabase: "https://.../storage/v1/object/sign/bucket/userId/uuid.ext?token=..."
 * - URL autenticada do Supabase: "https://.../storage/v1/object/authenticated/bucket/userId/uuid.ext"
 * - URL de transformação de imagem: "https://.../storage/v1/render/image/public/bucket/userId/uuid.ext"
 *
 * Retorna `null` com segurança para:
 * - Valores nulos, vazios ou apenas espaços
 * - URLs de blobs locais ("blob:http...")
 * - Data URLs ("data:image/...")
 * - URLs externas (Unsplash, Google, CDNs externos)
 * - Caminhos maliciosos com path traversal ("..")
 */
export const extractStoragePath = (bucket: string, value?: string | null): string | null => {
  if (!value || typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  // Ignora blobs e data URLs
  if (/^(blob:|data:)/i.test(raw)) return null;

  try {
    let candidate = '';

    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const pathname = decodeURIComponent(url.pathname);

      const markers = [
        `/storage/v1/object/public/${bucket}/`,
        `/storage/v1/object/sign/${bucket}/`,
        `/storage/v1/object/authenticated/${bucket}/`,
        `/storage/v1/render/image/public/${bucket}/`,
        `/storage/v1/render/image/sign/${bucket}/`,
      ];

      const marker = markers.find(m => pathname.includes(m));
      if (!marker) {
        // A URL é externa (ex: Unsplash, CDN de terceiro) e não pertence a este bucket
        return null;
      }

      candidate = pathname.split(marker)[1] || '';
    } else {
      // Caminho relativo
      const clean = decodeURIComponent(raw.split('?')[0].split('#')[0]).replace(/^\/+/, '');
      // Remove prefixo acidental do bucket se presente (ex: "song-covers/userId/uuid.jpg")
      const bucketPrefix = `${bucket}/`;
      candidate = clean.startsWith(bucketPrefix) ? clean.slice(bucketPrefix.length) : clean;
    }

    const sanitized = sanitizeStoragePath(candidate);
    return sanitized || null;
  } catch (err) {
    captureException(err, { operation: 'extractStoragePath', bucket, value: raw.slice(0, 80) });
    return null;
  }
};

/**
 * Valida se um caminho pertence à pasta do usuário especificado.
 */
export const isUserStoragePath = (path: string, userId: string): boolean => {
  if (!path || !userId) return false;
  const segments = path.split('/');
  return segments.length >= 2 && segments[0] === userId;
};

/**
 * Normaliza e agrupa referências de arquivos para deleção em lote,
 * filtrando URLs externas, arquivos inválidos e garantindo isolamento de usuário.
 */
export const groupStorageFilesForDeletion = (
  files: StorageFileRef[],
  currentUserId?: string
): Map<string, string[]> => {
  const grouped = new Map<string, string[]>();

  for (const file of files) {
    if (!file?.bucket) continue;
    const path = extractStoragePath(file.bucket, file.value);
    if (!path) continue;

    // Se fornecido currentUserId, valida estritamente a raiz do caminho
    if (currentUserId && !isUserStoragePath(path, currentUserId)) {
      continue;
    }

    const currentList = grouped.get(file.bucket) || [];
    if (!currentList.includes(path)) {
      currentList.push(path);
      grouped.set(file.bucket, currentList);
    }
  }

  return grouped;
};

/**
 * Resolve o identificador canônico de um valor para exibição ou salvamento:
 * Se for uma URL externa ou blob, mantém inalterado.
 * Se for caminho relativo de bucket público, pode ser resolvido para a URL canônica pública.
 */
export const resolveStorageUrl = (
  bucket: string,
  pathOrValue: string,
  supabaseBaseUrl?: string
): string => {
  if (!pathOrValue) return '';
  if (/^https?:\/\/|^blob:|^data:/i.test(pathOrValue)) {
    return pathOrValue;
  }

  const cleanPath = sanitizeStoragePath(pathOrValue);
  if (!cleanPath) return '';

  if (isPublicBucket(bucket) && supabaseBaseUrl) {
    const base = supabaseBaseUrl.replace(/\/+$/, '');
    return `${base}/storage/v1/object/public/${bucket}/${cleanPath}`;
  }

  return cleanPath;
};
