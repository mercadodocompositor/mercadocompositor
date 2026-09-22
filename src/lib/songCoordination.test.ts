import { describe, it, expect, vi } from 'vitest';
import { buildCoordinatedSongPayload, rollbackCoordinatedUploads, cleanupOrphanedMedia } from './songCoordination';

describe('Fluxo Coordenado de Criação de Música', () => {
  it('prepara payload completo com campos de mídia e resumo calculados', () => {
    const payload = buildCoordinatedSongPayload({
      title: '  Coração Sertanejo  ',
      genre: 'Sertanejo',
      subgenre: 'Universitário',
      authors: '  Compositor Exemplo  ',
      dateComposed: '2026-09-01',
      lyrics: 'Esta é a primeira linha da letra da música sertaneja cadastrada pelo compositor no painel da plataforma Mercado do Compositor.',
      coverUrl: 'https://storage.supabase.co/cover.jpg',
      status: 'published',
      isAvailableForRelease: true,
      valueType: 'suggested',
      suggestedValue: 4500,
      previewAudioUrl: 'https://storage.supabase.co/preview.mp3',
      previewMediaId: 'media-123',
    });

    expect(payload.title).toBe('Coração Sertanejo');
    expect(payload.authors).toBe('Compositor Exemplo');
    expect(payload.previewAudioUrl).toBe('https://storage.supabase.co/preview.mp3');
    expect(payload.previewMediaId).toBe('media-123');
    expect(payload.summary).toContain('...');
    expect(payload.summary?.length).toBeLessThanOrEqual(124);
  });

  it('executa rollback seguro e retorna true para lista vazia', async () => {
    const res = await rollbackCoordinatedUploads([]);
    expect(res).toBe(true);
  });

  it('ignora itens com valores vazios no rollback', async () => {
    const res = await rollbackCoordinatedUploads([
      { bucket: 'song-previews', value: null },
      { bucket: 'song-covers', value: undefined },
    ]);
    expect(res).toBe(true);
  });

  it('retorna 0 para cleanupOrphanedMedia se cliente Supabase não estiver configurado', async () => {
    const res = await cleanupOrphanedMedia('user-123', 2, null as any);
    expect(res).toBe(0);
  });
});
