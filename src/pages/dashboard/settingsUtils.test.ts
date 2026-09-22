import { describe, expect, it } from 'vitest';
import { hasValidWhatsappNumber, maskEmail, maskPhone, normalizeBrazilianPhone } from './settingsUtils';

describe('utilitários seguros das configurações', () => {
  it('mascara o e-mail sem esconder o domínio de destino', () => {
    expect(maskEmail('compositor@example.com')).toBe('c*********@example.com');
    expect(maskEmail('')).toBe('E-mail não informado');
  });

  it('normaliza DDI brasileiro e valida telefone fixo ou celular', () => {
    expect(normalizeBrazilianPhone('+55 (51) 99999-1234')).toBe('51999991234');
    expect(hasValidWhatsappNumber('+55 (51) 99999-1234')).toBe(true);
    expect(hasValidWhatsappNumber('123')).toBe(false);
  });

  it('não revela o número completo do WhatsApp', () => {
    expect(maskPhone('(51) 99999-1234')).toBe('(**) *****-1234');
    expect(maskPhone('123')).toBe('WhatsApp não cadastrado');
  });
});
