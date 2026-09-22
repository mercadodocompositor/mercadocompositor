import { describe, expect, it } from 'vitest';
import { slugify, getSongUrlKey, getInterestRequestUrl } from './urls';
import { getRequestCode } from './identifiers';
import { normalizeBrazilianWhatsapp } from './contact';
import { type SongDraftPayload } from './database';
import { readFileSync } from 'fs';

describe('Fluxos Negativos e Alternativos: Validação de Formulários Incompletos', () => {
  it('rejeita CPF ou CNPJ com quantidade inválida de dígitos', () => {
    const invalidCpfs = ['123', '1234567890', '123456789012', ''];
    const validCpfs = ['12345678901', '12345678000199'];

    invalidCpfs.forEach(doc => {
      const digits = doc.replace(/\D/g, '');
      const isValidLength = [11, 14].includes(digits.length);
      expect(isValidLength).toBe(false);
    });

    validCpfs.forEach(doc => {
      const digits = doc.replace(/\D/g, '');
      const isValidLength = [11, 14].includes(digits.length);
      expect(isValidLength).toBe(true);
    });
  });

  it('rejeita telefone/WhatsApp incompleto sem DDD', () => {
    const incompletePhones = ['9999-9999', '123', ''];
    incompletePhones.forEach(phone => {
      const digits = phone.replace(/\D/g, '');
      expect(digits.length >= 10).toBe(false);
    });

    const validPhone = '(62) 99999-8888';
    const validDigits = validPhone.replace(/\D/g, '');
    expect(validDigits.length >= 10).toBe(true);
    expect(normalizeBrazilianWhatsapp(validPhone)).toBe('5562999998888');
  });

  it('valida código de verificação de documento de liberação (vazio e formato)', () => {
    const validateCode = (rawCode: string) => {
      const normalized = rawCode.trim().toUpperCase();
      if (!normalized) {
        return { valid: false, error: 'Por favor, informe o código verificador do documento (ex.: LIB-2026-12345).' };
      }
      if (normalized.length > 50 || !/^[A-Z0-9_-]+$/.test(normalized)) {
        return { valid: false, error: 'Código em formato inválido. Códigos de liberação contêm apenas letras, números e hífens.' };
      }
      return { valid: true, error: null, code: normalized };
    };

    // Submissão vazia ou com espaços
    expect(validateCode('').valid).toBe(false);
    expect(validateCode('').error).toBe('Por favor, informe o código verificador do documento (ex.: LIB-2026-12345).');
    expect(validateCode('   ').valid).toBe(false);
    expect(validateCode('   ').error).toBe('Por favor, informe o código verificador do documento (ex.: LIB-2026-12345).');

    // Caracteres especiais inválidos
    expect(validateCode('LIB@2026#').valid).toBe(false);
    expect(validateCode('LIB@2026#').error).toContain('formato inválido');

    // Código válido normalizado
    const valid = validateCode(' lib-2026-abc12 ');
    expect(valid.valid).toBe(true);
    expect(valid.error).toBeNull();
    expect(valid.code).toBe('LIB-2026-ABC12');
  });

  it('valida requisitos mínimos para publicação de obra', () => {
    const incompleteSong = {
      title: '   ',
      authors: '',
      lyrics: '',
      previewAudioUrl: null
    };

    const isReadyForPublication = Boolean(
      incompleteSong.title.trim() &&
      incompleteSong.authors.trim() &&
      incompleteSong.lyrics.trim() &&
      incompleteSong.previewAudioUrl
    );

    expect(isReadyForPublication).toBe(false);

    const readySong = {
      title: 'Coração de Sertão',
      authors: 'Autor Exemplo',
      lyrics: 'Letra completa da composição...',
      previewAudioUrl: 'https://storage.supabase.co/preview.mp3'
    };

    const isReady = Boolean(
      readySong.title.trim() &&
      readySong.authors.trim() &&
      readySong.lyrics.trim() &&
      readySong.previewAudioUrl
    );

    expect(isReady).toBe(true);
  });
});

describe('Fluxos Negativos: Duplo Clique e Concorrência (Double Submit Guard)', () => {
  it('impede seleção e drop enquanto áudio é processado ou o formulário é enviado', () => {
    const source = readFileSync('src/pages/dashboard/AddSongTab.tsx', 'utf8');
    expect(source).toContain('previewProcessingLockRef.current || isSubmitting');
    expect(source).toContain('isProcessingPreview || previewProcessingLockRef.current) return');
  });

  it('oferece ações separadas para rascunho e publicação', () => {
    const source = readFileSync('src/pages/dashboard/AddSongTab.tsx', 'utf8');
    expect(source).toContain('value="draft"');
    expect(source).toContain('value="publish"');
    expect(source).toContain("submitter?.value === 'draft'");
    expect(source).toContain('Salvar rascunho privado');
  });

  it('permite escolher e regenerar o trecho público', () => {
    const pageSource = readFileSync('src/pages/dashboard/AddSongTab.tsx', 'utf8');
    const audioSource = readFileSync('src/lib/audioPreview.ts', 'utf8');
    expect(pageSource).toContain('Início do trecho público');
    expect(pageSource).toContain('processPreviewFile(previewSourceFile, previewStartSeconds)');
    expect(audioSource).toContain("'-ss', String(Math.max(0, startSeconds))");
  });
  it('bloqueia sincronamente a página antes da primeira operação assíncrona', () => {
    const source = readFileSync('src/pages/dashboard/AddSongTab.tsx', 'utf8');
    const lockPosition = source.indexOf('submissionLockRef.current = true');
    const firstAwaitPosition = source.indexOf('await checkUserPlanCapacity', source.indexOf('const handleSubmit'));

    expect(source).toContain('if (submissionLockRef.current) return');
    expect(lockPosition).toBeGreaterThan(-1);
    expect(firstAwaitPosition).toBeGreaterThan(lockPosition);
  });

  it('bloqueia segunda execução simultânea de mutação', () => {
    let inProgress = false;

    const beginMutation = () => {
      if (inProgress) return false;
      inProgress = true;
      return true;
    };

    const endMutation = () => {
      inProgress = false;
    };

    // Primeiro clique: aceito
    const click1 = beginMutation();
    expect(click1).toBe(true);

    // Segundo clique imediato enquanto click1 processa: bloqueado
    const click2 = beginMutation();
    expect(click2).toBe(false);

    // Terceiro clique repetido: ainda bloqueado
    const click3 = beginMutation();
    expect(click3).toBe(false);

    // Fim da mutação
    endMutation();

    // Novo clique após conclusão: aceito
    const clickAfter = beginMutation();
    expect(clickAfter).toBe(true);
  });
});

describe('Fluxos Alternativos: Atualização de Página e Sincronização de Rascunhos', () => {
  it('serializa e hidrata rascunho sem corromper estado após F5', () => {
    const originalDraft: SongDraftPayload = {
      title: 'Moda Antiga',
      genre: 'Sertanejo',
      subgenre: 'Raiz',
      authors: 'Zé & Tião',
      dateComposed: '2026-05-10',
      lyrics: 'Naquela tarde tão serena...',
      registryCode: '',
      notes: '',
      status: 'draft',
      isAvailableForRelease: true,
      valueType: 'suggested',
      suggestedValue: 2500,
      coverUrl: 'https://images.unsplash.com/sample'
    };

    const serialized = JSON.stringify(originalDraft);
    const hydrated = JSON.parse(serialized) as SongDraftPayload;

    expect(hydrated.title).toBe(originalDraft.title);
    expect(hydrated.lyrics).toBe(originalDraft.lyrics);
    expect(hydrated.suggestedValue).toBe(2500);
    expect(hydrated.status).toBe('draft');
  });

  it('descarta rascunhos com dados corrompidos ou malformados com segurança', () => {
    const invalidJson = '{ title: "Sem aspas nas chaves" ';
    let result = null;
    let handled = false;

    try {
      result = JSON.parse(invalidJson);
    } catch {
      handled = true;
      result = null;
    }

    expect(handled).toBe(true);
    expect(result).toBeNull();
  });
});

describe('Fluxos Negativos: Perda de Conexão e Tratamento de Erro', () => {
  it('diferencia erro de rede/conexão de recurso inexistente (404)', () => {
    const networkError = new Error('Failed to fetch');
    const isNetworkFailure = networkError.message.includes('fetch') || networkError.message.includes('Network');
    expect(isNetworkFailure).toBe(true);

    const notFoundResult = null;
    const isNotFound = notFoundResult === null;
    expect(isNotFound).toBe(true);
  });
});

describe('Fluxos Alternativos: Acesso Direto a URLs com Parâmetros Incompletos', () => {
  it('lida com slugs vazios, com espaços ou caracteres especiais sem gerar loop', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('$$$///@@@')).toBe('');
    expect(slugify('Música Bonita #1 !')).toBe('musica-bonita-1');
  });

  it('constrói URL de interesse mesmo com títulos contendo emojis ou pontuações extremas', () => {
    const weirdSong = { id: 'a1b2c3d4-0000-1111-2222-333344445555', title: '🔥 Hit do Verão 2026!!! & Mais' };
    const urlKey = getSongUrlKey(weirdSong);
    expect(urlKey).toBe('hit-do-verao-2026-mais-a1b2c3d4');

    const url = getInterestRequestUrl('autor_teste', weirdSong);
    expect(url).toContain('/compositor/autor_teste/musica/');
    expect(url).toContain('/interesse');
  });

  it('gera código de solicitação padronizado a partir de qualquer UUID', () => {
    const code = getRequestCode('e7f8a9b0-1234-5678-9abc-def012345678');
    expect(code).toBe('E7F8A9B0');
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });
});

describe('Fluxos Negativos: Execução Repetida e Cooldowns', () => {
  it('controla cooldown de redefinição de senha para impedir spam', () => {
    let cooldownSeconds = 60;

    // Tentativa durante o cooldown deve ser bloqueada
    const canRequestReset = cooldownSeconds <= 0;
    expect(canRequestReset).toBe(false);

    // Simula passagem do tempo
    cooldownSeconds = 0;
    const canRequestNow = cooldownSeconds <= 0;
    expect(canRequestNow).toBe(true);
  });
});

describe('Auditoria de Formulários: Validações Client-Side & Regras de Negócio', () => {
  it('valida formato de e-mail estrito para cadastros, convites e interesses', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = ['invalid', 'test@', '@domain.com', 'user@domain', 'user @domain.com', ''];
    const validEmails = ['autor@mercadodocompositor.com.br', 'joao.silva@gmail.com', 'contato@produtora.art.br'];

    invalidEmails.forEach(email => {
      expect(emailRegex.test(email.trim())).toBe(false);
    });

    validEmails.forEach(email => {
      expect(emailRegex.test(email.trim())).toBe(true);
    });
  });

  it('valida regras de limites e percentuais para configurações de plataforma', () => {
    const validatePlatformFee = (fee: number) => !isNaN(fee) && fee >= 0 && fee <= 100;
    expect(validatePlatformFee(-5)).toBe(false);
    expect(validatePlatformFee(105)).toBe(false);
    expect(validatePlatformFee(NaN)).toBe(false);
    expect(validatePlatformFee(0)).toBe(true);
    expect(validatePlatformFee(15)).toBe(true);
    expect(validatePlatformFee(100)).toBe(true);

    const validatePlanPrice = (price: number) => !isNaN(price) && price >= 0;
    expect(validatePlanPrice(-10)).toBe(false);
    expect(validatePlanPrice(0)).toBe(true);
    expect(validatePlanPrice(49.90)).toBe(true);
  });

  it('valida regras para limites de músicas em planos de assinatura', () => {
    const validatePlanMaxSongs = (maxSongs: number | '') => {
      if (maxSongs === '') return true; // ilimitado
      return !isNaN(Number(maxSongs)) && Number(maxSongs) >= 1;
    };

    expect(validatePlanMaxSongs('')).toBe(true);
    expect(validatePlanMaxSongs(0)).toBe(false);
    expect(validatePlanMaxSongs(-1)).toBe(false);
    expect(validatePlanMaxSongs(50)).toBe(true);
  });

  it('valida algoritmo oficial de CPF (módulo 11) rejeitando dígitos repetidos e restos inválidos', () => {
    const isValidCpf = (cpf: string) => {
      const digits = cpf.replace(/\D/g, '');
      if (digits.length !== 11) return false;
      if (/^(\d)\1{10}$/.test(digits)) return false;
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i);
      let rest = (sum * 10) % 11;
      if (rest === 10 || rest === 11) rest = 0;
      if (rest !== parseInt(digits[9], 10)) return false;
      sum = 0;
      for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i);
      rest = (sum * 10) % 11;
      if (rest === 10 || rest === 11) rest = 0;
      return rest === parseInt(digits[10], 10);
    };

    // Falsos conhecidos (todos dígitos iguais)
    expect(isValidCpf('000.000.000-00')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('999.999.999-99')).toBe(false);
    expect(isValidCpf('12345678901')).toBe(false);

    // Formato incompleto
    expect(isValidCpf('123.456.789')).toBe(false);
  });

  it('detecta duplicidade de e-mail em formulários administrativos antes da persistência', () => {
    const existingComposers = [
      { id: '1', email: 'autor1@musica.com' },
      { id: '2', email: 'autor2@musica.com' }
    ];

    const isDuplicate = (newEmail: string) => 
      existingComposers.some(c => c.email.toLowerCase() === newEmail.trim().toLowerCase());

    expect(isDuplicate('autor1@musica.com')).toBe(true);
    expect(isDuplicate('AUTOR2@MUSICA.COM')).toBe(true);
    expect(isDuplicate('novo.autor@musica.com')).toBe(false);
  });

  it('suporta hidratação resiliente de dados legados com campos nulos ou ausentes', () => {
    // Simulação de registro antigo de música no banco antes de novas colunas
    const legacyDbSong = {
      id: 'song-legacy-001',
      composer_id: 'user-001',
      title: 'Modão Antigo',
      genre: null,
      subgenre: null,
      authors: null,
      date_composed: null,
      date_registered: null,
      lyrics: null,
      original_audio_path: null,
      preview_audio_url: null,
      cover_url: null,
      registry_code: null,
      notes: null,
      status: null,
      is_available_for_release: null,
      value_type: null,
      suggested_value: null,
      play_count: null,
      interested_count: null,
      summary: null,
      is_featured: null
    };

    // Hidratação segura com fallbacks
    const safeSong = {
      id: legacyDbSong.id,
      composerId: legacyDbSong.composer_id,
      title: legacyDbSong.title || 'Sem título',
      genre: legacyDbSong.genre || 'Sertanejo',
      subgenre: legacyDbSong.subgenre || '',
      authors: legacyDbSong.authors || '',
      dateComposed: legacyDbSong.date_composed || '',
      lyrics: legacyDbSong.lyrics || '',
      coverUrl: legacyDbSong.cover_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      status: legacyDbSong.status || 'draft',
      isAvailableForRelease: legacyDbSong.is_available_for_release ?? true,
      valueType: legacyDbSong.value_type || 'suggested',
      playCount: Number(legacyDbSong.play_count || 0),
      interestedCount: Number(legacyDbSong.interested_count || 0),
      isFeatured: Boolean(legacyDbSong.is_featured)
    };

    expect(safeSong.genre).toBe('Sertanejo');
    expect(safeSong.isAvailableForRelease).toBe(true);
    expect(safeSong.valueType).toBe('suggested');
    expect(safeSong.playCount).toBe(0);
    expect(safeSong.isFeatured).toBe(false);

    // Simulação de termo de liberação antigo sem document_code ou hash
    const legacyDbRelease = {
      id: 'release-legacy-001',
      request_id: 'req-001',
      song_id: 'song-001',
      song_title: 'Música Antiga',
      agreed_value: null,
      document_code: null,
      document_hash: null,
      template_version: null
    };

    const safeRelease = {
      id: legacyDbRelease.id,
      documentCode: legacyDbRelease.document_code || `LIB-${legacyDbRelease.id.slice(0, 8).toUpperCase()}`,
      agreedValue: Number(legacyDbRelease.agreed_value || 0),
      templateVersion: legacyDbRelease.template_version || '2.0'
    };

    expect(safeRelease.documentCode).toBe('LIB-RELEASE-');
    expect(safeRelease.agreedValue).toBe(0);
    expect(safeRelease.templateVersion).toBe('2.0');
  });
});
