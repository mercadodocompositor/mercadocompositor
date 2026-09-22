import { describe, expect, it } from 'vitest';
import { parseIsoDate, formatBrazilianDate, getStartOfDay, getEndOfDay, isDateWithinPeriod } from './dateUtils';

describe('Auditoria de Datas e Fuso Horário (dateUtils)', () => {
  it('converte data pura YYYY-MM-DD com segurança sem mudar para o dia anterior', () => {
    const parsed = parseIsoDate('2026-09-10');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(8); // Setembro (0-indexed)
    expect(parsed!.getDate()).toBe(10); // Mantém dia 10 exatamente
  });

  it('formata datas para o padrão brasileiro dd/mm/aaaa', () => {
    expect(formatBrazilianDate('2026-09-10')).toBe('10/09/2026');
    expect(formatBrazilianDate('2025-01-05')).toBe('05/01/2025');
  });

  it('formata data e hora com includeTime = true', () => {
    const formatted = formatBrazilianDate('2026-09-10T15:30:00.000Z', true);
    expect(formatted).toContain('10/09/2026 às ');
  });

  it('retorna início e fim do dia com precisão de milissegundos', () => {
    const ref = new Date(2026, 8, 10, 14, 25, 30);
    const start = getStartOfDay(ref);
    const end = getEndOfDay(ref);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('filtra períodos corretamente (today, 7d, 30d, month)', () => {
    const today = new Date(2026, 8, 10, 12, 0, 0);
    const threeDaysAgo = new Date(2026, 8, 7, 10, 0, 0);
    const fortyDaysAgo = new Date(2026, 7, 1, 10, 0, 0);

    expect(isDateWithinPeriod(today, 'today', today)).toBe(true);
    expect(isDateWithinPeriod(threeDaysAgo, 'today', today)).toBe(false);
    expect(isDateWithinPeriod(threeDaysAgo, '7d', today)).toBe(true);
    expect(isDateWithinPeriod(fortyDaysAgo, '7d', today)).toBe(false);
    expect(isDateWithinPeriod(fortyDaysAgo, '30d', today)).toBe(false);
    expect(isDateWithinPeriod(today, 'all', today)).toBe(true);
  });

  it('lida com entradas nulas, indefinidas ou inválidas sem quebrar', () => {
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('data-invalida')).toBeNull();
    expect(formatBrazilianDate(null)).toBe('');
    expect(formatBrazilianDate('invalido')).toBe('');
    expect(isDateWithinPeriod(null, 'today')).toBe(false);
  });
});
