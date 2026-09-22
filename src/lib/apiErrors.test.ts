import { describe, expect, it } from 'vitest';
import { parseApiError, handleApiError, getFriendlyErrorMessage, authErrorMessage } from './apiErrors';

describe('Auditoria de Tratamento de Erros: parseApiError & Observabilidade', () => {
  it('identifica e trata erros de Timeout com mensagem compreensível', () => {
    const abortError = new DOMException('The user aborted a request.', 'AbortError');
    const parsedAbort = parseApiError(abortError);
    expect(parsedAbort.code).toBe('TIMEOUT');
    expect(parsedAbort.userMessage).toContain('demorou mais que o esperado');

    const timeoutStringError = new Error('Connection timed out after 10000ms');
    const parsedTimeout = parseApiError(timeoutStringError);
    expect(parsedTimeout.code).toBe('TIMEOUT');
  });

  it('identifica e trata perda de conexão / offline', () => {
    const networkError = new TypeError('Failed to fetch');
    const parsed = parseApiError(networkError);
    expect(parsed.code).toBe('NETWORK_ERROR');
    expect(parsed.statusCode).toBe(0);
    expect(parsed.userMessage).toContain('Sem conexão com a internet');
  });

  it('identifica e trata respostas inválidas ou corrompidas da API', () => {
    const jsonError = new SyntaxError('Unexpected token < in JSON at position 0');
    const parsed = parseApiError(jsonError);
    expect(parsed.code).toBe('INVALID_RESPONSE');
    expect(parsed.userMessage).toContain('resposta em formato inválido');
  });

  it('identifica e trata erro HTTP 401 (Não Autorizado / Sessão Expirada)', () => {
    const err401 = { status: 401, message: 'JWT expired' };
    const parsed = parseApiError(err401);
    expect(parsed.code).toBe('UNAUTHORIZED');
    expect(parsed.statusCode).toBe(401);
    expect(parsed.userMessage).toContain('sessão expirou');

    const pgrst301 = { code: 'PGRST301', message: 'Unauthorized' };
    expect(parseApiError(pgrst301).code).toBe('UNAUTHORIZED');
  });

  it('identifica e trata erro HTTP 403 (Proibido / Sem Permissão)', () => {
    const err403 = { status: 403, message: 'Forbidden access to resource' };
    const parsed = parseApiError(err403);
    expect(parsed.code).toBe('FORBIDDEN');
    expect(parsed.statusCode).toBe(403);
    expect(parsed.userMessage).toContain('não possui permissão');

    const pgInsufficient = { code: '42501', message: 'insufficient_privilege' };
    expect(parseApiError(pgInsufficient).code).toBe('FORBIDDEN');
  });

  it('identifica e trata erro HTTP 404 (Recurso Não Encontrado)', () => {
    const err404 = { status: 404, message: 'Resource not found' };
    const parsed = parseApiError(err404);
    expect(parsed.code).toBe('NOT_FOUND');
    expect(parsed.statusCode).toBe(404);
    expect(parsed.userMessage).toContain('não foi encontrado');
  });

  it('identifica e trata erro HTTP 409 (Conflito / Duplicidade de Dados)', () => {
    const err409 = { status: 409, message: 'duplicate key value violates unique constraint' };
    const parsed = parseApiError(err409);
    expect(parsed.code).toBe('CONFLICT');
    expect(parsed.statusCode).toBe(409);
    expect(parsed.userMessage).toContain('Já existe um registro cadastrado');

    const pgUnique = { code: '23505', message: 'duplicate key value' };
    expect(parseApiError(pgUnique).code).toBe('CONFLICT');
  });

  it('identifica e trata erro HTTP 422 (Dados Inválidos ou Não Processáveis)', () => {
    const err422 = { status: 422, message: 'Unprocessable Entity' };
    const parsed = parseApiError(err422);
    expect(parsed.code).toBe('UNPROCESSABLE');
    expect(parsed.statusCode).toBe(422);
    expect(parsed.userMessage).toContain('inconsistências ou campos obrigatórios');

    const pgCheck = { code: '23514', message: 'check constraint violation' };
    expect(parseApiError(pgCheck).code).toBe('UNPROCESSABLE');
  });

  it('identifica e trata erro HTTP 429 (Rate Limit / Limite de Requisições)', () => {
    const err429 = { status: 429, message: 'Too many requests, please slow down' };
    const parsed = parseApiError(err429);
    expect(parsed.code).toBe('RATE_LIMITED');
    expect(parsed.statusCode).toBe(429);
    expect(parsed.userMessage).toContain('Limite de solicitações atingido');
  });

  it('identifica e trata erro HTTP 500 / 5xx (Instabilidade no Servidor)', () => {
    const err500 = { status: 500, message: 'Internal Server Error' };
    const parsed = parseApiError(err500);
    expect(parsed.code).toBe('SERVER_ERROR');
    expect(parsed.statusCode).toBe(500);
    expect(parsed.userMessage).toContain('Instabilidade temporária no servidor');
  });

  it('protege a privacidade do usuário sem expor dados técnicos, senhas ou SQL', () => {
    const technicalDbError = new Error('SELECT * FROM users WHERE password_hash = "secret_123" failed due to syntax');
    const safeMessage = handleApiError(technicalDbError);
    expect(safeMessage).not.toContain('password_hash');
    expect(safeMessage).not.toContain('secret_123');
    expect(safeMessage).not.toContain('SELECT * FROM');
    expect(typeof safeMessage).toBe('string');
  });

  describe('Centralização de Mensagens Amigáveis e Regras de Negócio', () => {
    it('traduz erros de autenticação do Supabase via authErrorMessage', () => {
      expect(authErrorMessage('Invalid login credentials')).toBe('E-mail ou senha inválidos.');
      expect(authErrorMessage('Email not confirmed')).toBe('Confirme seu e-mail antes de entrar.');
      expect(authErrorMessage('User already registered')).toBe('Já existe uma conta com este e-mail.');
      expect(authErrorMessage('Password should be at least 6 characters')).toBe('A senha não atende aos requisitos mínimos de segurança.');
      expect(authErrorMessage('Email rate limit exceeded')).toBe('Limite temporário de envio atingido. Aguarde antes de solicitar outro e-mail.');
      expect(authErrorMessage(null)).toBe('Não foi possível concluir a operação. Tente novamente.');
    });

    it('traduz erros do Storage e da Edge Function de validação de mídia', () => {
      expect(getFriendlyErrorMessage('quarantine_file_not_found')).toBe(
        'Arquivo temporário não encontrado ou expirado. Tente enviar novamente.'
      );
      expect(getFriendlyErrorMessage('invalid_upload_target')).toBe(
        'Destino de upload inválido ou sem permissão.'
      );
      expect(getFriendlyErrorMessage('invalid_preview_duration')).toBe(
        'A prévia de áudio deve ter no máximo 60 segundos.'
      );
      expect(getFriendlyErrorMessage('invalid_file_size')).toBe(
        'O arquivo ultrapassa o limite permitido. Selecione um arquivo menor.'
      );
      expect(getFriendlyErrorMessage('invalid_file_content')).toBe(
        'O formato real do arquivo não é aceito. Verifique o formato e selecione outro arquivo.'
      );
      expect(getFriendlyErrorMessage('empty_file')).toBe(
        'O arquivo está vazio. Selecione outro arquivo e tente novamente.'
      );
    });

    it('preserva mensagens intencionais de negócio geradas pelas triggers do banco', () => {
      const futureDateError = { code: '23514', message: 'A data da composição não pode estar no futuro.' };
      expect(getFriendlyErrorMessage(futureDateError)).toBe('A data da composição não pode estar no futuro.');

      const draftTitleError = { code: '23514', message: 'Informe ao menos um título provisório para salvar o rascunho.' };
      expect(getFriendlyErrorMessage(draftTitleError)).toBe('Informe ao menos um título provisório para salvar o rascunho.');

      const planLimitError = { code: 'P0001', message: 'Limite de 5 músicas atingido para esta conta.' };
      expect(getFriendlyErrorMessage(planLimitError)).toBe('Limite de 5 músicas atingido para esta conta.');

      const approvalError = { code: '42501', message: 'Esta música precisa ser enviada para aprovação antes da publicação.' };
      expect(getFriendlyErrorMessage(approvalError)).toBe('Esta música precisa ser enviada para aprovação antes da publicação.');
    });

    it('getFriendlyErrorMessage aceita mensagem de fallback quando o erro for vazio', () => {
      expect(getFriendlyErrorMessage(null, 'Falha ao salvar rascunho.')).toBe('Falha ao salvar rascunho.');
      expect(getFriendlyErrorMessage('', 'Operação indisponível.')).toBe('Operação indisponível.');
    });
  });
});
