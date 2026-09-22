import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { cleanupUserQuarantine } from './database';
import { supabase } from './supabase';

describe('Limpeza e Cancelamento da Quarentena de Mídia', () => {
  const databaseSrc = readFileSync('src/lib/database.ts', 'utf8');
  const addSongPageSrc = readFileSync('src/pages/dashboard/AddSongTab.tsx', 'utf8');
  const migrationSrc = readFileSync('supabase/update_all_migrations.sql', 'utf8');
  const validationMigrationSrc = readFileSync('supabase/media_validation.sql', 'utf8');

  it('declara política de SELECT para o proprietário na quarentena nas migrations', () => {
    expect(migrationSrc).toContain('create policy "quarantine owner select" on storage.objects');
    expect(migrationSrc).toContain("bucket_id = 'media-quarantine'");
    expect(migrationSrc).toContain("(storage.foldername(name))[1] = auth.uid()::text");

    expect(validationMigrationSrc).toContain('create policy "quarantine owner select"');
  });

  it('fornece função SQL cleanup_expired_quarantine para expurgo de arquivos abandonados', () => {
    expect(migrationSrc).toContain('create or replace function public.cleanup_expired_quarantine');
    expect(migrationSrc).toContain("bucket_id = 'media-quarantine'");
    expect(validationMigrationSrc).toContain('cleanup_expired_quarantine');
  });

  it('AddSongTab cancela envios, aborta requisições e limpa arquivos da quarentena', () => {
    expect(addSongPageSrc).toContain('cancelUploads');
    expect(addSongPageSrc).toContain('abortControllerRef.current?.abort()');
    expect(addSongPageSrc).toContain('activeQuarantinePathsRef.current');
    expect(addSongPageSrc).toContain("bucket: 'media-quarantine'");
    expect(addSongPageSrc).toContain('activeQuarantinePathsRef.current.delete(result.quarantinePath)');
    expect(addSongPageSrc).toContain('({ bucket, value, mediaId })');
  });

  it('limpa a mídia promovida se o cancelamento chegar durante a validação', () => {
    expect(databaseSrc).toContain('signal?.aborted && data?.mediaId');
    expect(databaseSrc).toContain("body: { action: 'cleanup', mediaIds: [data.mediaId] }");
  });

  it('AddSongTab intercepta fechamento de aba e limpa recursos no unmount / pagehide', () => {
    expect(addSongPageSrc).toContain("window.addEventListener('beforeunload', warnBeforeLeaving)");
    expect(addSongPageSrc).toContain("window.addEventListener('pagehide', cleanupActiveQuarantine)");
    expect(addSongPageSrc).toContain('cleanupUserQuarantine()');
  });

  it('database.ts solicita somente a limpeza segura de arquivos expirados', () => {
    expect(databaseSrc).toContain('export async function cleanupUserQuarantine');
    expect(databaseSrc).toContain("body: { action: 'cleanup-expired' }");
    expect(databaseSrc).not.toContain(".list(targetUserId, { limit: 100 })");
  });

  it('Edge Function remove somente arquivos do usuário com mais de 24 horas', () => {
    const validatorSrc = readFileSync('supabase/functions/validate-media-upload/index.ts', 'utf8');
    expect(validatorSrc).toContain("payload.action === 'cleanup-expired'");
    expect(validatorSrc).toContain('.list(userData.user.id');
    expect(validatorSrc).toContain('24 * 60 * 60 * 1000');
    expect(validatorSrc).toContain('createdAt < expiresBefore');
    expect(validatorSrc).toContain('`${userData.user.id}/${file.name}`');
  });
});
