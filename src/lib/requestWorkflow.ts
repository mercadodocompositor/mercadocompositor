import type { RequestStatus } from '../types';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  nova: 'Nova',
  em_negociacao: 'Em negociação',
  pagamento_pendente: 'Pagamento pendente',
  pagamento_confirmado: 'Pagamento confirmado',
  liberacao_enviada: 'Liberação emitida',
  arquivada: 'Arquivada',
};

export const REQUEST_STATUS_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  nova: ['nova', 'em_negociacao', 'arquivada'],
  em_negociacao: ['em_negociacao', 'pagamento_pendente', 'arquivada'],
  pagamento_pendente: ['pagamento_pendente', 'em_negociacao', 'pagamento_confirmado', 'arquivada'],
  pagamento_confirmado: ['pagamento_confirmado', 'arquivada'],
  liberacao_enviada: ['liberacao_enviada'],
  arquivada: ['arquivada', 'nova'],
};

export const RELEASE_TYPE_OPTIONS = [
  'Autorização de Gravação e Exploração Fonográfica (Não-Exclusiva)',
  'Autorização Exclusiva de Gravação e Fixação (12 meses)',
  'Autorização Exclusiva de Gravação e Fixação (24 meses)',
  'Cessão Exclusiva Definitiva de Direitos Patrimoniais',
] as const;

export const DEFAULT_RELEASE_TYPE = RELEASE_TYPE_OPTIONS[0];

export const getAllowedRequestStatuses = (status: RequestStatus) => [...REQUEST_STATUS_TRANSITIONS[status]];

// A confirmação de pagamento é uma ação sensível e possui modal próprio. A
// transição continua válida no fluxo, mas não aparece no seletor genérico.
export const getManuallySelectableRequestStatuses = (status: RequestStatus) =>
  getAllowedRequestStatuses(status).filter(nextStatus =>
    nextStatus !== 'pagamento_confirmado' || status === 'pagamento_confirmado'
  );

export const getReleaseConditions = (exclusive: boolean) => exclusive
  ? 'Liberação com cláusula de exclusividade. Créditos de autoria obrigatórios em todos os fonogramas e sistemas de arrecadação ECAD.'
  : 'Créditos de autoria obrigatórios em todos os fonogramas e sistemas de arrecadação ECAD.';

export type RequestErrorCode =
  | 'CONCURRENCY_CONFLICT'
  | 'INVALID_STATUS_TRANSITION'
  | 'EXCLUSIVE_RELEASE_EXISTS'
  | 'RELEASE_ISSUED_VALUE_FROZEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';

export class RequestUpdateError extends Error {
  readonly code: RequestErrorCode;
  readonly isConflict: boolean;
  readonly requestId: string;
  readonly originalError?: unknown;

  constructor(
    message: string,
    options: {
      code: RequestErrorCode;
      isConflict?: boolean;
      requestId: string;
      originalError?: unknown;
    }
  ) {
    super(message);
    this.name = 'RequestUpdateError';
    this.code = options.code;
    this.isConflict = Boolean(options.isConflict ?? (options.code === 'CONCURRENCY_CONFLICT'));
    this.requestId = options.requestId;
    this.originalError = options.originalError;
  }
}

export function parseRequestUpdateError(error: unknown, requestId: string): RequestUpdateError {
  if (error instanceof RequestUpdateError) return error;

  const rawMessage = (error as any)?.message || (typeof error === 'string' ? error : '');
  const code = (error as any)?.code || (error as any)?.errcode || '';

  if (code === '40001' || /outra aba|recarregue|foi alterada|concorrência|expected_updated_at/i.test(rawMessage)) {
    return new RequestUpdateError(
      'Esta solicitação foi alterada em outra aba. Carregue a versão atual antes de salvar novamente.',
      {
        code: 'CONCURRENCY_CONFLICT',
        isConflict: true,
        requestId,
        originalError: error
      }
    );
  }

  if (/transição de status não permitida|status de solicitação inválido/i.test(rawMessage)) {
    return new RequestUpdateError(
      rawMessage || 'Essa mudança de status não é permitida no fluxo atual.',
      {
        code: 'INVALID_STATUS_TRANSITION',
        isConflict: false,
        requestId,
        originalError: error
      }
    );
  }

  if (/exclusiva emitida para outro interessado|não aceita novos pagamentos/i.test(rawMessage)) {
    return new RequestUpdateError(
      'Esta obra já possui uma liberação exclusiva emitida para outro interessado.',
      {
        code: 'EXCLUSIVE_RELEASE_EXISTS',
        isConflict: true,
        requestId,
        originalError: error
      }
    );
  }

  if (/valor de uma liberação emitida não pode ser alterado/i.test(rawMessage)) {
    return new RequestUpdateError(
      'O valor de uma liberação emitida não pode ser alterado.',
      {
        code: 'RELEASE_ISSUED_VALUE_FROZEN',
        isConflict: false,
        requestId,
        originalError: error
      }
    );
  }

  if (code === '42501' || /não encontrada para este compositor|permissão/i.test(rawMessage)) {
    return new RequestUpdateError(
      'Solicitação não encontrada ou você não tem permissão para alterá-la.',
      {
        code: 'PERMISSION_DENIED',
        isConflict: false,
        requestId,
        originalError: error
      }
    );
  }

  return new RequestUpdateError(
    rawMessage || 'Não foi possível atualizar a solicitação.',
    {
      code: 'UNKNOWN',
      isConflict: false,
      requestId,
      originalError: error
    }
  );
}
