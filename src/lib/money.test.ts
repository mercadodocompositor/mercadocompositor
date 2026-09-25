import { describe, expect, it } from 'vitest';
import { formatBrlAmount, parseBrlAmount } from './money';

describe('parseBrlAmount', () => {
  it('lê inteiros como reais, não centavos', () => {
    expect(parseBrlAmount('3500')).toBe(3500);
    expect(parseBrlAmount('35')).toBe(35);
  });

  it('entende separador de milhar e decimal brasileiros', () => {
    expect(parseBrlAmount('3.500')).toBe(3500);
    expect(parseBrlAmount('3.500,00')).toBe(3500);
    expect(parseBrlAmount('1.234.567,89')).toBe(1234567.89);
    expect(parseBrlAmount('3500,5')).toBe(3500.5);
    expect(parseBrlAmount('R$ 3.500,00')).toBe(3500);
  });

  it('aceita ponto decimal colado de planilha', () => {
    expect(parseBrlAmount('3500.50')).toBe(3500.5);
  });

  it('devolve vazio e inválido', () => {
    expect(parseBrlAmount('')).toBe('');
    expect(parseBrlAmount('  ')).toBe('');
    expect(parseBrlAmount('abc')).toBeNull();
    expect(parseBrlAmount('1,2,3')).toBeNull();
    expect(parseBrlAmount('10,555')).toBeNull();
  });

  it('formata em reais', () => {
    expect(formatBrlAmount(3500)).toBe('3.500,00');
  });
});
