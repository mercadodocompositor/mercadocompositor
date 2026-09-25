import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getSongStatusAfterAudioReplacement, validateSongSubmission } from './songWorkflow';

describe('Moderação após substituição de áudio', () => {
  it('envia novamente para aprovação uma música publicada alterada pelo compositor', () => {
    expect(getSongStatusAfterAudioReplacement('published', true, false)).toBe('pending_approval');
  });

  it('mantém o status para administradores, moderação desativada e músicas ainda não publicadas', () => {
    expect(getSongStatusAfterAudioReplacement('published', true, true)).toBe('published');
    expect(getSongStatusAfterAudioReplacement('published', false, false)).toBe('published');
    expect(getSongStatusAfterAudioReplacement('draft', true, false)).toBe('draft');
    expect(getSongStatusAfterAudioReplacement('rejected', true, false)).toBe('rejected');
    expect(getSongStatusAfterAudioReplacement('pending_approval', true, false)).toBe('pending_approval');
  });
});

describe('Unificação de Validações de Rascunho (Frontend e Trigger SQL)', () => {
  const migrationsSql = readFileSync('supabase/update_all_migrations.sql', 'utf8');
  const approvalSql = readFileSync('supabase/approval_workflow.sql', 'utf8');
  const hardeningSql = readFileSync('supabase/production_hardening.sql', 'utf8');
  const mediaSecuritySql = readFileSync('supabase/music_security.sql', 'utf8');
  const insertPermissionsSql = readFileSync('supabase/fix_song_insert_permissions.sql', 'utf8');
  const draftPublishFixSql = readFileSync('supabase/fix_publish_draft_media_validation.sql', 'utf8');
  // Script canônico da pilha: é o último a rodar e define a versão em vigor de
  // enforce_song_media_separation.
  const auditFixSql = readFileSync('supabase/fix_auditoria_2026_09.sql', 'utf8');
  const addSongPageSrc = readFileSync('src/pages/dashboard/AddSongTab.tsx', 'utf8');
  const mySongsPageSrc = readFileSync('src/pages/dashboard/MySongsTab.tsx', 'utf8');

  it('não confunde formulário recuperado com música enviada para aprovação', () => {
    expect(addSongPageSrc).toContain("setStatus(existingSong?.status || 'draft')");
    expect(addSongPageSrc).toContain("status: existingSong?.status || 'draft'");
    expect(addSongPageSrc).toContain("!existingSong && !successMessage");
    expect(addSongPageSrc).toContain('Rascunho não enviado');
    expect(mySongsPageSrc).toContain("loadSongDraft(currentUserId, 'new')");
    expect(mySongsPageSrc).toContain('Cadastro não concluído:');
    expect(mySongsPageSrc).toContain('ainda não aparece em “Rascunhos”');
  });

  it('só mostra o novo status após salvar e mantém o total do progresso consistente', () => {
    const submitStart = addSongPageSrc.indexOf('const handleSubmit =');
    const saveSuccess = addSongPageSrc.indexOf('setSavedStatus(effectiveStatus)', submitStart);
    const statusChange = addSongPageSrc.indexOf('setStatus(effectiveStatus)', submitStart);
    expect(statusChange).toBeGreaterThan(submitStart);
    expect(statusChange).toBeLessThan(saveSuccess);
    expect(addSongPageSrc.slice(submitStart, statusChange)).not.toContain('setStatus(requestedStatus)');
    expect(addSongPageSrc).toContain('{completedChecklistItems} de {checklistItemCount} itens essenciais concluídos');
  });

  it('mantém cópia local imediata até a revisão mais recente sincronizar', () => {
    expect(addSongPageSrc).toContain('window.localStorage.setItem(legacyDraftStorageKey, JSON.stringify(payload))');
    expect(addSongPageSrc).toContain('revision !== draftRevisionRef.current');
    expect(addSongPageSrc).toContain('rawLegacyDraft\n          ? JSON.parse(rawLegacyDraft)');
    expect(addSongPageSrc).toContain('previewObjectUrl, recoveredPreviewMediaId');
  });

  it('cancela o debounce e exclui somente depois das gravações já iniciadas', () => {
    const clearDraftStart = addSongPageSrc.indexOf('const clearDraft');
    const clearTimeoutPosition = addSongPageSrc.indexOf('window.clearTimeout(draftSaveTimeoutRef.current)', clearDraftStart);
    const enqueueDeletePosition = addSongPageSrc.indexOf('.then(() => deleteSongDraft(currentUserId, draftKey))', clearDraftStart);

    expect(addSongPageSrc).toContain('const draftSaveTimeoutRef = useRef<number | null>(null)');
    expect(clearTimeoutPosition).toBeGreaterThan(clearDraftStart);
    expect(enqueueDeletePosition).toBeGreaterThan(clearTimeoutPosition);
  });

  it('revalida a prévia ao publicar um rascunho mesmo quando URL e mediaId não mudam', () => {
    for (const sql of [migrationsSql, mediaSecuritySql, draftPublishFixSql, auditFixSql]) {
      expect(sql).toContain("old.status not in ('published', 'pending_approval')");
      expect(sql).toContain("bucket_id = 'song-previews'");
      expect(sql).toContain('duration_seconds <= 60');
      expect(sql).toContain('consumed_by_song_id is null or consumed_by_song_id = new.id');
    }
  });

  // Contrato invertido de propósito. As versões anteriores do trigger zeravam
  // preview_audio_url, preview_media_id, original_audio_path, original_media_id
  // e cover_url sempre que a obra voltava para rascunho. Como o cliente só
  // mesclava {status:'draft'} no estado local, a tela seguia exibindo capa e
  // prévia inexistentes, os arquivos ficavam órfãos no Storage e republicar
  // exigia reenviar tudo.
  it('preserva a mídia da obra quando ela volta para rascunho', () => {
    expect(auditFixSql).not.toContain('new.preview_audio_url := null');
    expect(auditFixSql).not.toContain('new.preview_media_id := null');
    expect(auditFixSql).not.toContain('new.original_audio_path := null');
    expect(auditFixSql).not.toContain("new.cover_url := ''");
  });

  it('mantém o confinamento de caminho da mídia no script canônico', () => {
    // Estas validações vinham de music_security.sql e foram removidas pelos
    // patches posteriores; o script canônico as recupera.
    expect(auditFixSql).toContain("new.original_audio_path not like new.composer_id::text || '/%'");
    expect(auditFixSql).toContain("/storage/v1/object/public/song-previews/");
    expect(auditFixSql).toContain("position('/song-originals/' in new.preview_audio_url) > 0");
  });

  it('não devolve privilégio amplo de escrita em songs e profiles', () => {
    // fix_song_insert_permissions.sql fazia `grant ... on public.songs` sem
    // lista de colunas, o que permitia ao compositor alterar is_featured,
    // play_count, interested_count e profiles.is_verified por PATCH direto.
    const stripSqlComments = (sql: string) => sql
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
      .join('\n');

    for (const sql of [insertPermissionsSql, auditFixSql].map(stripSqlComments)) {
      expect(sql).not.toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.songs/i);
      expect(sql).not.toMatch(/grant\s+select,\s*update\s+on\s+public\.profiles/i);
      expect(sql).toContain('revoke insert, update on table public.songs from anon, authenticated;');
    }
  });

  describe('Validação no Frontend (validateSongSubmission)', () => {
    it('permite salvar rascunho com dados parciais (apenas título provisório)', () => {
      const result = validateSongSubmission({
        title: 'Ideia de Refrão',
        authors: '',
        lyrics: '',
        status: 'draft',
        valueType: 'consultation',
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('permite salvar rascunho com valueType = suggested e valor em branco', () => {
      const result = validateSongSubmission({
        title: 'Rascunho Sertanejo',
        status: 'draft',
        valueType: 'suggested',
        suggestedValue: null,
      });
      expect(result.isValid).toBe(true);
    });

    it('permite salvar rascunho com valueType = suggested e valor válido', () => {
      const result = validateSongSubmission({
        title: 'Rascunho Sertanejo',
        status: 'draft',
        valueType: 'suggested',
        suggestedValue: 3500,
      });
      expect(result.isValid).toBe(true);
    });

    it('rejeita rascunho se o título for vazio ou apenas espaços', () => {
      const result = validateSongSubmission({
        title: '   ',
        status: 'draft',
        valueType: 'consultation',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Informe ao menos um título provisório para salvar o rascunho.');
      expect(result.field).toBe('title');
    });

    it('rejeita rascunho com data no futuro', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const result = validateSongSubmission({
        title: 'Minha Composição',
        dateComposed: futureDate.toISOString().split('T')[0],
        status: 'draft',
        valueType: 'consultation',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('A data da composição não pode estar no futuro.');
      expect(result.field).toBe('dateComposed');
    });

    it('rejeita rascunho se valor sugerido preenchido for menor ou igual a zero', () => {
      const resultZero = validateSongSubmission({
        title: 'Rascunho',
        status: 'draft',
        valueType: 'suggested',
        suggestedValue: 0,
      });
      expect(resultZero.isValid).toBe(false);
      expect(resultZero.error).toBe('O valor sugerido deve ser maior que zero.');

      const resultNegative = validateSongSubmission({
        title: 'Rascunho',
        status: 'draft',
        valueType: 'suggested',
        suggestedValue: -150,
      });
      expect(resultNegative.isValid).toBe(false);
      expect(resultNegative.error).toBe('O valor sugerido deve ser maior que zero.');
    });

    it('rejeita rascunho se valor sugerido ultrapassar R$ 10.000.000,00', () => {
      const result = validateSongSubmission({
        title: 'Rascunho Valioso',
        status: 'draft',
        valueType: 'suggested',
        suggestedValue: 15000000,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('O valor sugerido não pode ultrapassar R$ 10.000.000,00.');
    });

    it('rejeita publicação se faltar autores, letra ou prévia', () => {
      const missingAuthors = validateSongSubmission({
        title: 'Música Pronta',
        authors: '',
        lyrics: 'Letra completa da música',
        previewAudioUrl: 'https://storage/preview.mp3',
        status: 'published',
        valueType: 'consultation',
      });
      expect(missingAuthors.isValid).toBe(false);
      expect(missingAuthors.error).toBe(
        'Para publicar, informe título, autores, letra e a música completa para gerar a prévia pública.'
      );

      const missingPreview = validateSongSubmission({
        title: 'Música Pronta',
        authors: 'Compositor Famoso',
        lyrics: 'Letra completa da música',
        previewAudioUrl: '',
        status: 'published',
        valueType: 'consultation',
      });
      expect(missingPreview.isValid).toBe(false);
      expect(missingPreview.error).toBe(
        'Para publicar, informe título, autores, letra e a música completa para gerar a prévia pública.'
      );
    });

    it('rejeita publicação com valueType = suggested sem valor definido', () => {
      const result = validateSongSubmission({
        title: 'Música Pronta',
        authors: 'Compositor',
        lyrics: 'Letra completa',
        previewAudioUrl: 'https://storage/preview.mp3',
        status: 'published',
        valueType: 'suggested',
        suggestedValue: null,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('O valor sugerido deve ser maior que zero.');
    });
  });

  describe('Paridade com as Triggers SQL (enforce_song_write_rules)', () => {
    it('garante que a mensagem de título provisório está idêntica no SQL', () => {
      const expectedTitleMsg = 'Informe ao menos um título provisório para salvar o rascunho.';
      expect(migrationsSql).toContain(expectedTitleMsg);
      expect(approvalSql).toContain(expectedTitleMsg);
      expect(hardeningSql).toContain(expectedTitleMsg);
    });

    it('garante que a validação de data futura está presente nas triggers SQL', () => {
      const expectedDateMsg = 'A data da composição não pode estar no futuro.';
      expect(migrationsSql).toContain(expectedDateMsg);
      expect(approvalSql).toContain(expectedDateMsg);
      expect(hardeningSql).toContain(expectedDateMsg);
    });

    it('garante que a trigger SQL aceita rascunho com valor sugerido nulo', () => {
      expect(migrationsSql).toContain(
        "if new.status in ('published', 'pending_approval') and (new.suggested_value is null or new.suggested_value <= 0)"
      );
      expect(approvalSql).toContain(
        "if new.status in ('published', 'pending_approval') and (new.suggested_value is null or new.suggested_value <= 0)"
      );
    });

    it('garante que o teto de R$ 10.000.000,00 está espelhado nas triggers SQL', () => {
      const expectedCeilingMsg = 'O valor sugerido não pode ultrapassar R$ 10.000.000,00.';
      expect(migrationsSql).toContain(expectedCeilingMsg);
      expect(approvalSql).toContain(expectedCeilingMsg);
      expect(hardeningSql).toContain(expectedCeilingMsg);
    });

    it('garante que a sanitização de autores e letra vazios está na trigger', () => {
      expect(migrationsSql).toContain("new.authors := coalesce(new.authors, '');");
      expect(migrationsSql).toContain("new.lyrics := coalesce(new.lyrics, '');");
      expect(migrationsSql).toContain("new.cover_url := coalesce(new.cover_url, '');");
    });
  });
});
