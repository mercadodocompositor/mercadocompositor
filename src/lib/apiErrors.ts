import { captureException } from './monitoring';

export type ApiErrorCode = 
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export interface ParsedApiError {
  code: ApiErrorCode;
  statusCode?: number;
  userMessage: string;
  technicalMessage?: string;
}

const extractStatusCode = (error: any): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  if (typeof error.status === 'number') return error.status;
  if (typeof error.statusCode === 'number') return error.statusCode;
  if (typeof error.status_code === 'number') return error.status_code;
  if (error.context?.status && typeof error.context.status === 'number') return error.context.status;
  if (error.response?.status && typeof error.response.status === 'number') return error.response.status;
  return undefined;
};

const extractPostgresCode = (error: any): string | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  if (typeof error.code === 'string') return error.code;
  if (typeof error.error_code === 'string') return error.error_code;
  return undefined;
};

/**
 * Dicionário centralizado de códigos e mensagens conhecidas do Supabase,
 * Edge Functions, Storage e PostgreSQL para português amigável.
 */
export const KNOWN_FRIENDLY_TRANSLATIONS: Record<string, string> = {
  // Autenticação
  'invalid login credentials': 'E-mail ou senha inválidos.',
  'invalid_credentials': 'E-mail ou senha inválidos.',
  'email not confirmed': 'Confirme seu e-mail antes de entrar.',
  'user already registered': 'Já existe uma conta com este e-mail.',
  'user already exists': 'Já existe uma conta com este e-mail.',
  'password should be at least': 'A senha não atende aos requisitos mínimos de segurança.',
  'password should be': 'A senha não atende aos requisitos mínimos de segurança.',
  'signup requires a valid password': 'Informe uma senha válida para realizar o cadastro.',
  'token has expired or is invalid': 'O link de recuperação ou confirmação expirou ou é inválido. Solicite um novo envio.',
  'email rate limit exceeded': 'Limite temporário de envio atingido. Aguarde antes de solicitar outro e-mail.',
  'over_email_send_rate_limit': 'Limite temporário de envio atingido. Aguarde antes de solicitar outro e-mail.',
  'new password should be different': 'A nova senha deve ser diferente da senha anterior.',
  'anonymous sign-ins are disabled': 'Acesso anônimo não permitido. Faça login com sua conta.',

  // Storage & Edge Function de Validação
  'quarantine_file_not_found': 'Arquivo temporário não encontrado ou expirado. Tente enviar novamente.',
  'invalid_upload_target': 'Destino de upload inválido ou sem permissão.',
  'invalid_preview_duration': 'A prévia de áudio deve ter no máximo 60 segundos.',
  'invalid_audio_duration': 'Não foi possível determinar a duração do áudio enviado.',
  'empty_file': 'O arquivo está vazio. Selecione outro arquivo e tente novamente.',
  'invalid_file_size': 'O arquivo ultrapassa o limite permitido. Selecione um arquivo menor.',
  'invalid_file_content': 'O formato real do arquivo não é aceito. Verifique o formato e selecione outro arquivo.',
  'validated_upload_failed': 'Não foi possível concluir o armazenamento seguro do arquivo.',
  'validated_media_registry_failed': 'Não foi possível registrar a validação segura do arquivo.',
  'object not found': 'O arquivo solicitado não foi encontrado no armazenamento.',
  'payload too large': 'O arquivo selecionado ultrapassa o tamanho máximo permitido.',
  'file is too large': 'O arquivo selecionado ultrapassa o limite permitido.',

  // Capacidade e Assinatura
  'a conta não possui um plano de assinatura válido.': 'Sua conta não possui um plano de assinatura ativo configurado.',
  'somente contas com assinatura ativa podem publicar ou enviar músicas para aprovação.': 'Somente contas com assinatura ativa podem publicar ou enviar músicas para aprovação.',
};

const sanitizeHtmlEntities = (text: string): string => {
  return text
    .replace(/&#x20;|&#32;|&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Detecta se a mensagem é um texto de negócio em português legítimo gerado
 * por triggers do banco de dados ou código de aplicação, e não um vazamento técnico.
 */
const isFriendlyBusinessMessage = (message: string): boolean => {
  if (!message || message.length < 5) return false;

  // Rejeita mensagens que contenham fragmentos óbvios de SQL ou dados sensíveis
  const leaksSensitiveData = /select\s+.*from|insert\s+into|update\s+.*set|delete\s+from|password_hash|secret|bearer|foreign\s+key\s+constraint|syntax\s+error/i.test(message);
  if (leaksSensitiveData) return false;

  // Reconhece termos típicos das nossas mensagens em português
  const hasPortugueseContext = /música|título|autor|letra|composição|plano|conta|assinatura|aprovação|publicar|valor|rascunho|registro|solicitação|não pode|informe|somente|acesso|preencha|limite|inválid|expirad|provisório|conexão|permissão|áudio|arquivo|mídia|quarentena|separação|privad|segur|depend|duração|formato/i.test(message);
  return hasPortugueseContext;
};

/**
 * Converte qualquer exceção em uma mensagem amigável para o usuário final,
 * sanitizando SQL interno, restrições do banco, credenciais e senhas.
 */
export function parseApiError(error: unknown): ParsedApiError {
  const rawMsg = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : (error as any)?.message || (error as any)?.details || (error as any)?.hint || '';
  const cleanedRawMsg = sanitizeHtmlEntities(rawMsg);
  const lowerMsg = cleanedRawMsg.toLowerCase();
  const statusCode = extractStatusCode(error);
  const pgCode = extractPostgresCode(error);

  // 1. TIMEOUT (AbortError ou timeout explícito)
  if (
    (error instanceof DOMException && error.name === 'AbortError') ||
    /timeout|timed out|abort/i.test(lowerMsg)
  ) {
    return {
      code: 'TIMEOUT',
      statusCode: statusCode || 408,
      userMessage: 'A operação demorou mais que o esperado. Verifique sua conexão e tente novamente.',
      technicalMessage: rawMsg
    };
  }

  // 2. DICIONÁRIO DE TRADUÇÕES DIRETAS CONHECIDAS (Auth, Storage, Functions)
  for (const [key, translated] of Object.entries(KNOWN_FRIENDLY_TRANSLATIONS)) {
    if (lowerMsg.includes(key.toLowerCase())) {
      return {
        code: statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : statusCode === 409 ? 'CONFLICT' : 'UNPROCESSABLE',
        statusCode: statusCode || (key.includes('credentials') ? 401 : 422),
        userMessage: translated,
        technicalMessage: rawMsg
      };
    }
  }

  // 3. MENSAGENS DE NEGÓCIO EM PORTUGUÊS DAS TRIGGERS DO BANCO
  // Preserva mensagens intencionais como "A data da composição não pode estar no futuro."
  if (isFriendlyBusinessMessage(cleanedRawMsg)) {
    return {
      code: statusCode === 403 || pgCode === '42501' ? 'FORBIDDEN' : 'UNPROCESSABLE',
      statusCode: statusCode || 422,
      userMessage: cleanedRawMsg,
      technicalMessage: rawMsg
    };
  }

  // Se o Postgres disparou um raise exception (P0001) com mensagem textual
  if (pgCode === 'P0001' && cleanedRawMsg) {
    return {
      code: 'UNPROCESSABLE',
      statusCode: statusCode || 422,
      userMessage: cleanedRawMsg,
      technicalMessage: rawMsg
    };
  }

  // 4. ESTRUTURA DO BANCO DE DADOS DESATUALIZADA OU COLUNAS AUSENTES
  if (
    ['42703', '42P01', 'PGRST204', 'PGRST200', 'PGRST202'].includes(pgCode || '') ||
    /schema cache|relation.*does not exist|column.*does not exist|function.*does not exist/i.test(lowerMsg)
  ) {
    return {
      code: 'SERVER_ERROR',
      statusCode: statusCode || 500,
      userMessage: 'A estrutura do banco de dados precisa ser atualizada. Execute o script update_all_migrations.sql no Supabase.',
      technicalMessage: rawMsg
    };
  }

  // 5. STATUS HTTP ESPECÍFICOS E CÓDIGOS POSTGRESQL PADRÃO
  if (statusCode === 401 || pgCode === 'PGRST301' || /jwt expired|invalid claim|session expired|sessão expirada/i.test(lowerMsg)) {
    return {
      code: 'UNAUTHORIZED',
      statusCode: 401,
      userMessage: 'Sua sessão expirou ou você não está autenticado. Por favor, entre novamente na sua conta.',
      technicalMessage: rawMsg
    };
  }

  if (statusCode === 403 || pgCode === '42501' || /permiss|unauthorized|forbidden|not allowed|acesso negado/i.test(lowerMsg)) {
    return {
      code: 'FORBIDDEN',
      statusCode: 403,
      userMessage: 'Acesso negado. Você não possui permissão para realizar esta ação.',
      technicalMessage: rawMsg
    };
  }

  if (statusCode === 404 || pgCode === 'PGRST116' || /not found|não encontrad|recurso inexistente/i.test(lowerMsg)) {
    return {
      code: 'NOT_FOUND',
      statusCode: 404,
      userMessage: 'O registro ou recurso solicitado não foi encontrado no catálogo.',
      technicalMessage: rawMsg
    };
  }

  if (statusCode === 409 || pgCode === '23505' || /already exists|duplicate key|já cadastrad|já existe|conflito/i.test(lowerMsg)) {
    return {
      code: 'CONFLICT',
      statusCode: 409,
      userMessage: 'Já existe um registro cadastrado com estes dados (e-mail, CPF ou identificador duplicado).',
      technicalMessage: rawMsg
    };
  }

  if (
    statusCode === 422 || 
    ['23514', '23502', '23503'].includes(pgCode || '') || 
    /violates|invalid input|invalid format|dados inválidos|não processável|check constraint/i.test(lowerMsg)
  ) {
    const userMessage = pgCode === '23503'
      ? 'Esta ação não pode ser concluída porque o registro possui dependências vinculadas no catálogo.'
      : 'Os dados enviados contêm inconsistências ou campos obrigatórios inválidos. Por favor, revise as informações preenchidas.';

    return {
      code: 'UNPROCESSABLE',
      statusCode: 422,
      userMessage,
      technicalMessage: rawMsg
    };
  }

  if (statusCode === 429 || /rate limit|too many requests|muitas tentativas/i.test(lowerMsg)) {
    return {
      code: 'RATE_LIMITED',
      statusCode: 429,
      userMessage: 'Limite de solicitações atingido temporariamente. Por favor, aguarde alguns instantes antes de tentar novamente.',
      technicalMessage: rawMsg
    };
  }

  if ((statusCode && statusCode >= 500) || /internal server error|server error|database error|postgres error/i.test(lowerMsg)) {
    return {
      code: 'SERVER_ERROR',
      statusCode: statusCode || 500,
      userMessage: 'Instabilidade temporária no servidor. Ocorrência registrada para resolução por nossa equipe.',
      technicalMessage: rawMsg
    };
  }

  // 6. RESPOSTA INVÁLIDA DA API (JSON malformado, HTML inesperado)
  if (/unexpected token|invalid json|syntaxerror|malformed/i.test(lowerMsg)) {
    return {
      code: 'INVALID_RESPONSE',
      statusCode: statusCode || 502,
      userMessage: 'O servidor retornou uma resposta em formato inválido ou corrompido. Nossa equipe técnica foi notificada.',
      technicalMessage: rawMsg
    };
  }

  // 7. PERDA DE CONEXÃO / OFFLINE (Sem status HTTP retornado do servidor)
  if (
    !statusCode &&
    ((typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false) ||
     /failed to fetch|networkerror|network error|conex|sem conex|offline|econnrefused/i.test(lowerMsg))
  ) {
    return {
      code: 'NETWORK_ERROR',
      statusCode: 0,
      userMessage: 'Sem conexão com a internet ou servidor inacessível. Verifique sua conexão de rede e tente novamente.',
      technicalMessage: rawMsg
    };
  }

  return {
    code: 'UNKNOWN',
    statusCode,
    userMessage: 'Ocorreu um imprevisto ao processar a operação. Tente novamente em alguns instantes.',
    technicalMessage: rawMsg
  };
}

/**
 * Retorna uma string segura e amigável para exibição direta em Toasts, Alertas ou Formulários,
 * registrando o erro detalhado no sistema de monitoramento sem vazar dados sensíveis.
 */
export function handleApiError(error: unknown, fallbackMessage?: string, context?: Record<string, unknown>): string {
  if (!error || (typeof error === 'string' && !error.trim())) {
    return fallbackMessage || 'Não foi possível concluir a operação.';
  }

  const parsed = parseApiError(error);
  
  captureException(error, {
    errorCode: parsed.code,
    statusCode: parsed.statusCode,
    ...context
  });

  if (parsed.code === 'UNKNOWN' && fallbackMessage) {
    const rawMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : (error as any)?.message || '';
    const safeDetail = rawMsg && !/password_hash|secret|bearer|token/i.test(rawMsg) ? `: ${rawMsg}` : '';
    return `${fallbackMessage}${safeDetail}`;
  }

  return parsed.userMessage || fallbackMessage || 'Não foi possível concluir a operação.';
}

/**
 * Helper com nome semântico para obtenção direta de mensagens amigáveis em UI components.
 */
export const getFriendlyErrorMessage = (error: unknown, fallbackMessage?: string): string => {
  return handleApiError(error, fallbackMessage);
};

/**
 * Helper específico para formatação amigável de erros do fluxo de autenticação.
 */
export const authErrorMessage = (error: unknown): string => {
  if (!error) return 'Não foi possível concluir a operação. Tente novamente.';
  return getFriendlyErrorMessage(error, 'Não foi possível concluir a autenticação. Verifique seus dados.');
};
