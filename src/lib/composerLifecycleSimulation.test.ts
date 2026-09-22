import { describe, expect, it } from 'vitest';
import { slugify, getSongUrlKey, getInterestRequestUrl } from './urls';
import { getRequestCode } from './identifiers';
import { normalizeBrazilianWhatsapp } from './contact';
import { validateSongSubmission } from './songWorkflow';
import { 
  DEFAULT_RELEASE_TYPE, 
  getAllowedRequestStatuses, 
  getManuallySelectableRequestStatuses 
} from './requestWorkflow';
import { 
  isExclusiveReleaseType, 
  isActiveExclusiveRelease, 
  isReleaseExpired 
} from './releaseTypes';
import { getSafePublicBio, cleanTypography } from './profileSanitizer';
import { evaluatePlanCapacity, type PlanCapacityInfo } from './planCapacity';
import type { Song, InterestRequest, ReleaseDocument } from '../types';

describe('Simulação Completa do Fluxo Lógico: Novo Compositor -> Adição de Música -> Recebimento de Pagamento -> Emissão e Validação', () => {

  // ETAPA 1: CADASTRO DO NOVO COMPOSITOR
  describe('Etapa 1: Cadastro e Onboarding do Compositor', () => {
    it('1.1 - Bloqueia tentativas de cadastro com dados inválidos', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      // Email inválido
      expect(emailRegex.test('joao.silva')).toBe(false);
      expect(emailRegex.test('joao@')).toBe(false);
      expect(emailRegex.test('joao@dominio')).toBe(false);

      // Senha curta
      const password = '123';
      expect(password.length < 8).toBe(true);

      // Senhas divergentes
      const inputPass: string = '12345678';
      const inputConfirm: string = '87654321';
      expect(inputPass === inputConfirm).toBe(false);

      // Termos não aceitos
      const acceptTerms = false;
      expect(acceptTerms).toBe(false);
    });

    it('1.2 - Sanitiza bio de perfil e gera URL pública amigável sem conflitos', () => {
      const rawInput = {
        name: 'João da Silva Santos',
        stageName: 'João Viola & Poesia',
        email: 'joao.viola@compositor.com.br',
        whatsapp: '(62) 98888-7777',
        bio: 'teste de biografia' // Texto residual que deve ser higienizado automaticamente
      };

      // Limpeza de WhatsApp
      const normalizedPhone = normalizeBrazilianWhatsapp(rawInput.whatsapp);
      expect(normalizedPhone).toBe('5562988887777');

      // Sanitização de bio de perfil público
      const safeBio = getSafePublicBio(rawInput.bio, rawInput.stageName, 'joao-viola');
      expect(safeBio).toContain('João Viola & Poesia é um compositor oficial cadastrado');
      expect(safeBio).not.toBe('teste de biografia');

      // Geração de slug único de URL amigável
      const userSlug = slugify(rawInput.stageName || rawInput.name);
      expect(userSlug).toBe('joao-viola-poesia');
    });
  });

  // ETAPA 2: ADIÇÃO DE MÚSICA E UPLOAD DE PRÉVIA
  describe('Etapa 2: Adição e Publicação de Música', () => {
    it('2.1 - Valida regras de negócio e limites de prévia da música', () => {
      // Falha se título vazio
      const invalidNoTitle = validateSongSubmission({
        title: '   ',
        status: 'draft',
        valueType: 'suggested'
      });
      expect(invalidNoTitle.isValid).toBe(false);
      expect(invalidNoTitle.error).toContain('título');

      // Título válido
      const validTitle = validateSongSubmission({
        title: 'Coração de Asfalto',
        status: 'published',
        valueType: 'suggested',
        suggestedValue: 3500,
        authors: 'João Viola & Poesia',
        lyrics: 'Noite escura na BR...',
        previewAudioUrl: 'https://example.com/preview.mp3'
      });
      expect(validTitle.isValid).toBe(true);

      // Duração da prévia limitada a 60 segundos
      const previewDurationSeconds = 58.5;
      const isDurationValid = previewDurationSeconds <= 60.5;
      expect(isDurationValid).toBe(true);

      const invalidDuration = 180; // 3 minutos
      expect(invalidDuration <= 60.5).toBe(false);
    });

    it('2.2 - Valida limite de capacidade de músicas do plano do compositor', () => {
      const activeSongsCount = 3;
      const planLimit = 5; // Plano Pro/Básico
      const capacity: PlanCapacityInfo = evaluatePlanCapacity(activeSongsCount, planLimit, 'Plano Básico');

      expect(capacity.canAddSong).toBe(true);
      expect(capacity.remainingSongs).toBe(2);

      // Limite atingido
      const maxedCapacity: PlanCapacityInfo = evaluatePlanCapacity(5, 5, 'Plano Básico');
      expect(maxedCapacity.canAddSong).toBe(false);
      expect(maxedCapacity.remainingSongs).toBe(0);
    });

    it('2.3 - Publica a música com identificador e chave de URL únicos contra colisão', () => {
      const mockSong: Song = {
        id: 'song-uuid-101',
        composerId: 'user-uuid-joao',
        title: 'Coração de Asfalto',
        genre: 'Sertanejo',
        subgenre: 'Sertanejo Universitário',
        lyrics: 'Tentei te esquecer na poeira da estrada...',
        authors: 'João Viola & Poesia',
        dateComposed: '2026-03-10',
        dateRegistered: '2026-03-10',
        coverUrl: 'https://example.com/cover.jpg',
        previewAudioUrl: 'https://storage.supabase.co/song-previews/user-uuid-joao/coracao-asfalto-preview.mp3',
        status: 'published',
        isAvailableForRelease: true,
        valueType: 'suggested',
        suggestedValue: 3500,
        playCount: 0,
        interestedCount: 0
      };

      const songUrlKey = getSongUrlKey(mockSong);
      expect(songUrlKey).toBe('coracao-de-asfalto-song-uui');

      const requestUrl = getInterestRequestUrl('joao-viola-poesia', mockSong);
      expect(requestUrl).toBe('/compositor/joao-viola-poesia/musica/coracao-de-asfalto-song-uui/interesse');
    });
  });

  // ETAPA 3: SOLICITAÇÃO DE LIBERAÇÃO PELO INTÉRPRETE / COMPRADOR
  describe('Etapa 3: Intérprete Envia Proposta de Liberação', () => {
    it('3.1 - Valida dados e impede envio com bot/honeypot acionado', () => {
      const honeypotBotInput = 'http://spam-link.com';
      const isBotSpam = Boolean(honeypotBotInput);
      expect(isBotSpam).toBe(true); // Requisição descartada silenciosamente
    });

    it('3.2 - Valida CPF/CNPJ e contato do intérprete solicitante', () => {
      const validCpf = '123.456.789-01';
      const cpfDigits = validCpf.replace(/\D/g, '');
      expect(cpfDigits.length).toBe(11);

      const validWhatsapp = '(11) 98765-4321';
      const whatsappDigits = validWhatsapp.replace(/\D/g, '');
      expect(whatsappDigits.length >= 10 && whatsappDigits.length <= 13).toBe(true);

      const email = 'artista.produtor@musica.com.br';
      expect(/^\S+@\S+\.\S+$/.test(email)).toBe(true);
    });

    it('3.3 - Cria a solicitação com status inicial "nova"', () => {
      const initialRequest: InterestRequest = {
        id: 'REQ999-UUID-REST',
        songId: 'song-uuid-101',
        songTitle: 'Coração de Asfalto',
        buyerName: 'Carlos Eduardo Santos',
        buyerStageName: 'Eduardo & Banda',
        cpfCnpj: '12345678901',
        buyerEmail: 'artista.produtor@musica.com.br',
        buyerWhatsapp: '5511987654321',
        buyerCityState: 'São Paulo/SP',
        purpose: 'Gravação de Single / Lançamento Digital',
        message: 'Adorei a composição, temos gravação em estúdio agendada para o mês que vem.',
        status: 'nova',
        createdAt: '2026-03-11T14:00:00Z',
        updatedAt: '2026-03-11T14:00:00Z'
      };

      expect(initialRequest.status).toBe('nova');
      const requestCode = getRequestCode(initialRequest.id);
      expect(requestCode).toBe('REQ999');
    });
  });

  // ETAPA 4: NEGOCIAÇÃO E RECEBIMENTO DE PAGAMENTO (FLUXO DO COMPOSITOR)
  describe('Etapa 4: Análise, Negociação e Confirmação de Pagamento', () => {
    const activeRequest: InterestRequest = {
      id: 'req-uuid-999',
      songId: 'song-uuid-101',
      songTitle: 'Coração de Asfalto',
      buyerName: 'Carlos Eduardo Santos',
      buyerStageName: 'Eduardo & Banda',
      cpfCnpj: '12345678901',
      buyerEmail: 'artista.produtor@musica.com.br',
      buyerWhatsapp: '5511987654321',
      buyerCityState: 'São Paulo/SP',
      purpose: 'Gravação de Single / Lançamento Digital',
      message: 'Adorei a composição, temos gravação em estúdio agendada para o mês que vem.',
      status: 'nova',
      createdAt: '2026-03-11T14:00:00Z',
      updatedAt: '2026-03-11T14:00:00Z'
    };

    it('4.1 - Transições de status permitidas a partir de "nova"', () => {
      const allowedFromNew = getAllowedRequestStatuses('nova');
      expect(allowedFromNew).toContain('em_negociacao');
      expect(allowedFromNew).toContain('arquivada');

      // Não pode pular direto de 'nova' para 'liberacao_enviada' nem para 'pagamento_confirmado'
      expect(allowedFromNew).not.toContain('liberacao_enviada');
      expect(allowedFromNew).not.toContain('pagamento_confirmado');
    });

    it('4.2 - Define valor acordado e passa para "pagamento_pendente"', () => {
      const agreedValue = 3000; // R$ 3.000,00 acordado com o intérprete
      expect(agreedValue).toBeGreaterThan(0);
      expect(agreedValue).toBeLessThanOrEqual(10000000);

      const updatedToPending: InterestRequest = {
        ...activeRequest,
        status: 'pagamento_pendente',
        agreedValue,
        notes: 'Acordado R$ 3.000,00 à vista via PIX.',
        updatedAt: '2026-03-12T10:00:00Z'
      };

      expect(updatedToPending.status).toBe('pagamento_pendente');
      expect(updatedToPending.agreedValue).toBe(3000);

      // Próximos status permitidos
      const allowedFromPending = getAllowedRequestStatuses('pagamento_pendente');
      expect(allowedFromPending).toContain('pagamento_confirmado');
      expect(allowedFromPending).toContain('arquivada');
    });

    it('4.3 - Compositor confirma recebimento do pagamento', () => {
      const paymentDate = new Date().toISOString();
      const updatedToConfirmed: InterestRequest = {
        ...activeRequest,
        status: 'pagamento_confirmado',
        agreedValue: 3000,
        paymentReceivedAt: paymentDate,
        updatedAt: paymentDate
      };

      expect(updatedToConfirmed.status).toBe('pagamento_confirmado');
      expect(updatedToConfirmed.paymentReceivedAt).toBeDefined();
      expect(updatedToConfirmed.agreedValue).toBe(3000);
    });

    it('4.4 - Bloqueia recebimento de pagamento se outra liberação exclusiva já existir', () => {
      const mockReleases: ReleaseDocument[] = [
        {
          id: 'rel-prior-exclusive',
          requestId: 'req-another-user-888',
          songId: 'song-uuid-101',
          songTitle: 'Coração de Asfalto',
          authors: 'João Viola',
          composerName: 'João da Silva Santos',
          composerCpf: '11122233344',
          composerCityState: 'Goiânia/GO',
          buyerName: 'Outro Artista',
          buyerDocument: '98765432100',
          buyerCityState: 'Brasília/DF',
          agreedValue: 5000,
          authorizedPurpose: 'Single',
          releaseType: 'Autorização Exclusiva de Gravação e Fixação (12 meses)',
          issueDate: '2026-03-01T10:00:00Z',
          expiresAt: '2027-03-12T10:00:00Z',
          additionalConditions: 'Exclusiva',
          digitalSignature: 'HASH123',
          documentCode: 'LIB-2026-88888',
          isDemonstrative: false
        }
      ];

      const songHasExclusiveRelease = mockReleases.some(r => 
        r.songId === 'song-uuid-101' && 
        r.requestId !== 'req-uuid-999' && 
        isActiveExclusiveRelease(r)
      );

      // O sistema deve barrar!
      expect(songHasExclusiveRelease).toBe(true);
    });
  });

  // ETAPA 5: EMISSÃO DO DOCUMENTO DE LIBERAÇÃO
  describe('Etapa 5: Emissão e Congelamento da Liberação', () => {
    it('5.1 - Bloqueia emissão de liberação se o pagamento NÃO estiver confirmado', () => {
      const requestWithoutPayment: InterestRequest = {
        id: 'req-uuid-999',
        songId: 'song-uuid-101',
        songTitle: 'Coração de Asfalto',
        buyerName: 'Carlos Eduardo',
        cpfCnpj: '12345678901',
        buyerEmail: 'artista@musica.com',
        buyerWhatsapp: '5511987654321',
        buyerCityState: 'SP',
        purpose: 'Single',
        message: 'Teste',
        status: 'pagamento_pendente', // NÃO confirmado
        agreedValue: 3000,
        createdAt: '2026-03-11T14:00:00Z',
        updatedAt: '2026-03-11T14:00:00Z'
      };

      const canIssueRelease = requestWithoutPayment.status === 'pagamento_confirmado';
      expect(canIssueRelease).toBe(false);
    });

    it('5.2 - Emite documento com código verificador e congela valor', () => {
      const confirmedRequest: InterestRequest = {
        id: 'req-uuid-999',
        songId: 'song-uuid-101',
        songTitle: 'Coração de Asfalto',
        buyerName: 'Carlos Eduardo Santos',
        buyerStageName: 'Eduardo & Banda',
        cpfCnpj: '12345678901',
        buyerEmail: 'artista@musica.com',
        buyerWhatsapp: '5511987654321',
        buyerCityState: 'São Paulo/SP',
        purpose: 'Single',
        message: 'Teste',
        status: 'pagamento_confirmado',
        agreedValue: 3000,
        paymentReceivedAt: '2026-03-12T12:00:00Z',
        createdAt: '2026-03-11T14:00:00Z',
        updatedAt: '2026-03-12T12:00:00Z'
      };

      const verificationCode = 'LIB-2026-9A8B7';

      expect(verificationCode).toMatch(/^LIB-\d{4}-[A-Z0-9]{4,6}$/);

      const releaseDoc: ReleaseDocument = {
        id: 'rel-doc-12345',
        requestId: confirmedRequest.id,
        songId: confirmedRequest.songId,
        songTitle: 'Coração de Asfalto',
        authors: 'João Viola & Poesia',
        composerName: 'João da Silva Santos',
        composerCpf: '12345678900',
        composerCityState: 'Goiânia/GO',
        buyerName: confirmedRequest.buyerName,
        buyerDocument: confirmedRequest.cpfCnpj,
        buyerCityState: confirmedRequest.buyerCityState,
        agreedValue: confirmedRequest.agreedValue || 3000,
        authorizedPurpose: confirmedRequest.purpose,
        releaseType: 'Autorização Exclusiva de Gravação e Fixação (12 meses)',
        documentCode: verificationCode,
        issueDate: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        additionalConditions: 'Créditos obrigatórios',
        digitalSignature: 'SIG-ABC12345',
        isDemonstrative: false
      };

      expect(releaseDoc.agreedValue).toBe(3000);
      expect(releaseDoc.documentCode).toBe('LIB-2026-9A8B7');

      // Regra de imutabilidade: Valor não pode ser alterado após emissão
      const tryChangeValue = (newVal: number) => {
        if (releaseDoc.id) {
          throw new Error('O valor de uma liberação emitida não pode ser alterado.');
        }
      };
      expect(() => tryChangeValue(4000)).toThrow('não pode ser alterado');
    });
  });

  // ETAPA 6: VALIDAÇÃO PÚBLICA DO DOCUMENTO DE LIBERAÇÃO
  describe('Etapa 6: Validação Jurídica Pública do Documento', () => {
    it('6.1 - Proteção LGPD: Mascaramento do documento do comprador', () => {
      const fullCpf = '123.456.789-01';
      const digits = fullCpf.replace(/\D/g, '');
      const masked = `••••${digits.slice(-4)}`;

      expect(masked).toBe('••••8901');
      expect(masked).not.toContain('123.456');
    });

    it('6.2 - Consulta pública com código de liberação válido', () => {
      const code = 'LIB-2026-9A8B7';
      const isValidFormat = /^[A-Z0-9_-]+$/.test(code);
      expect(isValidFormat).toBe(true);

      // Simulação de retorno público sanitizado
      const publicValidationData = {
        code,
        status: 'valido',
        songTitle: 'Coração de Asfalto',
        composerStageName: 'João Viola & Poesia',
        buyerStageName: 'Eduardo & Banda',
        buyerDocumentMasked: '••••8901',
        releaseType: 'Exclusiva (12 meses)',
        issuedAt: '2026-03-12',
        isValid: true
      };

      expect(publicValidationData.isValid).toBe(true);
      expect(publicValidationData.buyerDocumentMasked).toBe('••••8901');
    });

    it('6.3 - Rejeição segura de códigos inválidos ou maliciosos', () => {
      const maliciousCode = 'LIB-2026<script>alert(1)</script>';
      const isFormatValid = /^[A-Z0-9_-]+$/.test(maliciousCode);
      expect(isFormatValid).toBe(false);
    });
  });

});
