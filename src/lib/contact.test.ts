import { describe, expect, it } from 'vitest';
import { normalizeBrazilianWhatsapp } from './contact';

describe('normalizeBrazilianWhatsapp', () => {
  it('normaliza telefones nacionais e preserva o DDI brasileiro', () => {
    expect(normalizeBrazilianWhatsapp('(11) 98765-4321')).toBe('5511987654321');
    expect(normalizeBrazilianWhatsapp('+55 11 98765-4321')).toBe('5511987654321');
  });

  it('rejeita telefones incompletos ou com prefixo nacional inválido', () => {
    expect(normalizeBrazilianWhatsapp('1234')).toBeNull();
    expect(normalizeBrazilianWhatsapp('011987654321')).toBeNull();
  });
});
