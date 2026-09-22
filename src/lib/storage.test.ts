import { describe, it, expect } from 'vitest';
import {
  STORAGE_BUCKETS,
  BUCKET_RULES,
  isPublicBucket,
  isPrivateBucket,
  sanitizeStoragePath,
  extractExtension,
  buildStoragePath,
  buildQuarantinePath,
  extractStoragePath,
  isUserStoragePath,
  groupStorageFilesForDeletion,
  resolveStorageUrl,
} from './storage';

describe('Contrato de Armazenamento (Storage): Constantes e Regras', () => {
  it('define os buckets padrão com tipos corretos de visibilidade', () => {
    expect(STORAGE_BUCKETS.PROFILE_MEDIA).toBe('profile-media');
    expect(STORAGE_BUCKETS.SONG_COVERS).toBe('song-covers');
    expect(STORAGE_BUCKETS.SONG_PREVIEWS).toBe('song-previews');
    expect(STORAGE_BUCKETS.SONG_ORIGINALS).toBe('song-originals');
    expect(STORAGE_BUCKETS.RELEASE_DOCUMENTS).toBe('release-documents');
    expect(STORAGE_BUCKETS.MEDIA_QUARANTINE).toBe('media-quarantine');

    expect(isPublicBucket(STORAGE_BUCKETS.SONG_COVERS)).toBe(true);
    expect(isPublicBucket(STORAGE_BUCKETS.SONG_PREVIEWS)).toBe(true);
    expect(isPublicBucket(STORAGE_BUCKETS.PROFILE_MEDIA)).toBe(true);

    expect(isPrivateBucket(STORAGE_BUCKETS.SONG_ORIGINALS)).toBe(true);
    expect(isPrivateBucket(STORAGE_BUCKETS.RELEASE_DOCUMENTS)).toBe(true);
    expect(isPrivateBucket(STORAGE_BUCKETS.MEDIA_QUARANTINE)).toBe(true);
  });

  it('valida regras de tamanho e extensões permitidas', () => {
    expect(BUCKET_RULES['song-previews'].maxDuration).toBe(60);
    expect(BUCKET_RULES['song-previews'].kinds).toContain('mp3');
    expect(BUCKET_RULES['song-originals'].kinds).toEqual(['mp3', 'wav', 'm4a', 'aac', 'ogg']);
    expect(BUCKET_RULES['release-documents'].kinds).toContain('pdf');
  });
});

describe('Contrato de Armazenamento: Sanitização e Construção de Caminhos', () => {
  it('higieniza caminhos removendo barras extras e espaços', () => {
    expect(sanitizeStoragePath('///user-123/musica.mp3///')).toBe('user-123/musica.mp3');
    expect(sanitizeStoragePath('  user-123//folder//musica.mp3  ')).toBe('user-123/folder/musica.mp3');
    expect(sanitizeStoragePath('')).toBe('');
  });

  it('bloqueia ataques de path traversal com dois pontos (..)', () => {
    expect(sanitizeStoragePath('user-123/../../etc/passwd')).toBe('');
    expect(sanitizeStoragePath('../malicious.mp3')).toBe('');
  });

  it('extrai extensão de forma padronizada', () => {
    expect(extractExtension('minha-musica.MP3')).toBe('mp3');
    expect(extractExtension('documento.final.v2.PDF')).toBe('pdf');
    expect(extractExtension('wav')).toBe('wav');
    expect(extractExtension('')).toBe('bin');
  });

  it('constrói caminhos canônicos no padrão {userId}/{fileId}.{ext}', () => {
    const path = buildStoragePath('user-abc', 'track.wav');
    expect(path).toMatch(/^user-abc\/[0-9a-f-]{36}\.wav$/);

    const scopedPath = buildStoragePath('user-abc', 'document.pdf', 'release-999');
    expect(scopedPath).toMatch(/^user-abc\/release-999\/[0-9a-f-]{36}\.pdf$/);

    const quarantine = buildQuarantinePath('user-abc', 'audio.mp3');
    expect(quarantine).toMatch(/^user-abc\/[0-9a-f-]{36}\.mp3$/);

    const scopedQuarantine = buildQuarantinePath('user-abc', 'document.pdf', 'release-999');
    expect(scopedQuarantine).toMatch(/^user-abc\/release-999\/[0-9a-f-]{36}\.pdf$/);
  });

  it('lança erro ao tentar construir caminho com userId vazio', () => {
    expect(() => buildStoragePath('', 'track.mp3')).toThrow();
  });
});

describe('Contrato de Armazenamento: Extração Canônica de Caminhos (extractStoragePath)', () => {
  const BUCKET = STORAGE_BUCKETS.SONG_ORIGINALS;
  const USER_ID = '018f92e6-8962-75d1-9da2-e4d6c1b3f942';
  const CANONICAL_PATH = `${USER_ID}/550e8400-e29b-41d4-a716-446655440000.mp3`;

  it('extrai a partir de caminho relativo simples', () => {
    expect(extractStoragePath(BUCKET, CANONICAL_PATH)).toBe(CANONICAL_PATH);
    expect(extractStoragePath(BUCKET, `/${CANONICAL_PATH}`)).toBe(CANONICAL_PATH);
  });

  it('extrai a partir de caminho com prefixo do bucket', () => {
    expect(extractStoragePath(BUCKET, `${BUCKET}/${CANONICAL_PATH}`)).toBe(CANONICAL_PATH);
  });

  it('extrai a partir de URL pública do Supabase', () => {
    const publicUrl = `https://xyz.supabase.co/storage/v1/object/public/${BUCKET}/${CANONICAL_PATH}`;
    expect(extractStoragePath(BUCKET, publicUrl)).toBe(CANONICAL_PATH);
  });

  it('extrai a partir de URL assinada do Supabase descartando tokens', () => {
    const signedUrl = `https://xyz.supabase.co/storage/v1/object/sign/${BUCKET}/${CANONICAL_PATH}?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9&expiry=1700000000`;
    expect(extractStoragePath(BUCKET, signedUrl)).toBe(CANONICAL_PATH);
  });

  it('extrai a partir de URL autenticada do Supabase', () => {
    const authUrl = `https://xyz.supabase.co/storage/v1/object/authenticated/${BUCKET}/${CANONICAL_PATH}`;
    expect(extractStoragePath(BUCKET, authUrl)).toBe(CANONICAL_PATH);
  });

  it('extrai a partir de URL de render/transformação de imagem', () => {
    const coverBucket = STORAGE_BUCKETS.SONG_COVERS;
    const coverPath = `${USER_ID}/cover.png`;
    const transformUrl = `https://xyz.supabase.co/storage/v1/render/image/public/${coverBucket}/${coverPath}?width=300&height=300`;
    expect(extractStoragePath(coverBucket, transformUrl)).toBe(coverPath);
  });

  it('decodifica caracteres URI encoded de modo seguro', () => {
    const pathWithSpaces = `${USER_ID}/Musica%20Favorita%20(Demo).mp3`;
    expect(extractStoragePath(BUCKET, pathWithSpaces)).toBe(`${USER_ID}/Musica Favorita (Demo).mp3`);
  });

  it('retorna null com segurança para URLs externas de terceiros', () => {
    const unsplashUrl = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';
    expect(extractStoragePath(STORAGE_BUCKETS.SONG_COVERS, unsplashUrl)).toBeNull();

    const googleAvatar = 'https://lh3.googleusercontent.com/a/ACg8ocK12345';
    expect(extractStoragePath(STORAGE_BUCKETS.PROFILE_MEDIA, googleAvatar)).toBeNull();
  });

  it('retorna null para valores vazios, blob URLs ou data URLs', () => {
    expect(extractStoragePath(BUCKET, null)).toBeNull();
    expect(extractStoragePath(BUCKET, undefined)).toBeNull();
    expect(extractStoragePath(BUCKET, '')).toBeNull();
    expect(extractStoragePath(BUCKET, '   ')).toBeNull();
    expect(extractStoragePath(BUCKET, 'blob:http://localhost:5173/d5b4a4-1234')).toBeNull();
    expect(extractStoragePath(BUCKET, 'data:image/png;base64,iVBORw0KGgo=')).toBeNull();
  });

  it('retorna null quando há tentativa de path traversal', () => {
    expect(extractStoragePath(BUCKET, `https://xyz.supabase.co/storage/v1/object/public/${BUCKET}/../etc/passwd`)).toBeNull();
  });
});

describe('Contrato de Armazenamento: Ownership e Agrupamento para Deleção', () => {
  const USER_A = 'user-aaa';
  const USER_B = 'user-bbb';

  it('valida ownership de caminho para o usuário correto', () => {
    expect(isUserStoragePath(`${USER_A}/track.mp3`, USER_A)).toBe(true);
    expect(isUserStoragePath(`${USER_A}/release/doc.pdf`, USER_A)).toBe(true);
    expect(isUserStoragePath(`${USER_B}/track.mp3`, USER_A)).toBe(false);
    expect(isUserStoragePath(`track.mp3`, USER_A)).toBe(false);
  });

  it('agrupa e desduplica arquivos para deleção em lote isolando por usuário', () => {
    const files = [
      { bucket: STORAGE_BUCKETS.SONG_ORIGINALS, value: `${USER_A}/audio1.mp3` },
      { bucket: STORAGE_BUCKETS.SONG_ORIGINALS, value: `https://supabase.co/storage/v1/object/sign/${STORAGE_BUCKETS.SONG_ORIGINALS}/${USER_A}/audio1.mp3?token=123` },
      { bucket: STORAGE_BUCKETS.SONG_COVERS, value: `https://supabase.co/storage/v1/object/public/${STORAGE_BUCKETS.SONG_COVERS}/${USER_A}/cover.jpg` },
      { bucket: STORAGE_BUCKETS.SONG_COVERS, value: 'https://images.unsplash.com/photo-example' }, // deve ser ignorado
      { bucket: STORAGE_BUCKETS.SONG_ORIGINALS, value: `${USER_B}/other-user-audio.mp3` }, // deve ser ignorado para USER_A
      { bucket: STORAGE_BUCKETS.SONG_COVERS, value: null }, // deve ser ignorado
    ];

    const grouped = groupStorageFilesForDeletion(files, USER_A);

    expect(grouped.get(STORAGE_BUCKETS.SONG_ORIGINALS)).toEqual([`${USER_A}/audio1.mp3`]);
    expect(grouped.get(STORAGE_BUCKETS.SONG_COVERS)).toEqual([`${USER_A}/cover.jpg`]);
    expect(grouped.size).toBe(2);
  });

  it('resolve URL pública apenas para buckets públicos quando informado supabaseBaseUrl', () => {
    const resolvedCover = resolveStorageUrl('song-covers', `${USER_A}/cover.jpg`, 'https://my-app.supabase.co');
    expect(resolvedCover).toBe('https://my-app.supabase.co/storage/v1/object/public/song-covers/user-aaa/cover.jpg');

    const externalUrl = 'https://images.unsplash.com/cover.jpg';
    expect(resolveStorageUrl('song-covers', externalUrl, 'https://my-app.supabase.co')).toBe(externalUrl);

    const privateAudio = resolveStorageUrl('song-originals', `${USER_A}/audio.mp3`, 'https://my-app.supabase.co');
    expect(privateAudio).toBe('user-aaa/audio.mp3');
  });
});
