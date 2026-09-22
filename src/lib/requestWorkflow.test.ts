import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RELEASE_TYPE,
  RELEASE_TYPE_OPTIONS,
  REQUEST_STATUS_TRANSITIONS,
  getManuallySelectableRequestStatuses,
  getReleaseConditions,
  RequestUpdateError,
  parseRequestUpdateError
} from './requestWorkflow';
import { isExclusiveReleaseType } from './releaseTypes';

describe('request workflow rules', () => {
  it('keeps the default authorization explicitly non-exclusive', () => {
    expect(DEFAULT_RELEASE_TYPE).toContain('Não-Exclusiva');
    expect(isExclusiveReleaseType(DEFAULT_RELEASE_TYPE)).toBe(false);
    expect(RELEASE_TYPE_OPTIONS.slice(1).every(isExclusiveReleaseType)).toBe(true);
  });

  it('requires the dedicated confirmation action to confirm payment', () => {
    expect(REQUEST_STATUS_TRANSITIONS.nova).not.toContain('pagamento_confirmado');
    expect(REQUEST_STATUS_TRANSITIONS.em_negociacao).not.toContain('pagamento_confirmado');
    expect(REQUEST_STATUS_TRANSITIONS.pagamento_pendente).toContain('pagamento_confirmado');
    expect(getManuallySelectableRequestStatuses('pagamento_pendente')).not.toContain('pagamento_confirmado');
    expect(getManuallySelectableRequestStatuses('pagamento_pendente')).toContain('em_negociacao');
    expect(getManuallySelectableRequestStatuses('pagamento_pendente')).toContain('arquivada');
  });

  it('adds exclusivity language only to exclusive releases', () => {
    expect(getReleaseConditions(false).toLowerCase()).not.toContain('exclusividade');
    expect(getReleaseConditions(true).toLowerCase()).toContain('exclusividade');
  });

  it('allows archiving unviable requests even after payment confirmation', () => {
    expect(REQUEST_STATUS_TRANSITIONS.pagamento_confirmado).toContain('arquivada');
    expect(getManuallySelectableRequestStatuses('pagamento_confirmado')).toContain('arquivada');
  });

  it('structures concurrency conflict errors with conflict flag and clear message', () => {
    const conflictError = parseRequestUpdateError({ code: '40001', message: 'Esta solicitação foi alterada em outra aba. Recarregue a página antes de salvar novamente.' }, 'req-123');
    expect(conflictError).toBeInstanceOf(RequestUpdateError);
    expect(conflictError.code).toBe('CONCURRENCY_CONFLICT');
    expect(conflictError.isConflict).toBe(true);
    expect(conflictError.requestId).toBe('req-123');
    expect(conflictError.message).toContain('outra aba');
  });

  it('structures status transition errors accurately', () => {
    const transitionError = parseRequestUpdateError({ message: 'Transição de status não permitida.' }, 'req-456');
    expect(transitionError.code).toBe('INVALID_STATUS_TRANSITION');
    expect(transitionError.isConflict).toBe(false);
  });
});
