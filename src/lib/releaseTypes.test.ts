import { describe, expect, it } from 'vitest';
import {
  isExclusiveRelease,
  isExclusiveReleaseType,
  calculateReleaseExpiration,
  isReleaseExpired,
  isActiveExclusiveRelease
} from './releaseTypes';

describe('Classificação da autorização', () => {
  it.each([
    'Autorização de Gravação e Exploração Fonográfica (Não-Exclusiva)',
    'Autorização Não-Exclusiva (Padrão para regravações fonográficas)',
    'Não-Exclusiva',
    'Não Exclusiva',
    'nao-exclusiva',
    'nao exclusiva',
    'NÃO-EXCLUSIVA',
    'NÃO EXCLUSIVA',
    'não_exclusiva',
    'Autorização Não Exclusiva',
  ])('não atribui exclusividade para termos não-exclusivos: %s', type => {
    expect(isExclusiveReleaseType(type)).toBe(false);
    expect(isExclusiveRelease(type)).toBe(false);
  });

  it.each([
    'Autorização Exclusiva de Gravação e Fixação (12 meses)',
    'Autorização Exclusiva de Gravação e Fixação (24 meses)',
    'Cessão Exclusiva Definitiva de Direitos Patrimoniais',
    'Exclusiva por 12 meses',
    'Exclusiva por 24 meses',
    'Exclusiva',
    'Cessão Definitiva de Direitos Patrimoniais',
  ])('reconhece o tipo exclusivo: %s', type => {
    expect(isExclusiveReleaseType(type)).toBe(true);
    expect(isExclusiveRelease(type)).toBe(true);
  });

  it('não infere exclusividade a partir de texto arbitrário ou vazio', () => {
    expect(isExclusiveReleaseType('Texto com exclusividade')).toBe(false);
    expect(isExclusiveReleaseType('')).toBe(false);
    expect(isExclusiveReleaseType('   ')).toBe(false);
    expect(isExclusiveReleaseType(null as unknown as string)).toBe(false);
    expect(isExclusiveReleaseType(undefined as unknown as string)).toBe(false);
  });

  it('calcula a vigência e data de expiração para exclusividades temporárias', () => {
    const exp12 = calculateReleaseExpiration('Autorização Exclusiva de Gravação e Fixação (12 meses)', '2025-01-10');
    expect(exp12).toBe('2026-01-10');

    const exp24 = calculateReleaseExpiration('Autorização Exclusiva de Gravação e Fixação (24 meses)', '2025-01-10');
    expect(exp24).toBe('2027-01-10');

    // Cessão definitiva não expira
    const defExp = calculateReleaseExpiration('Cessão Exclusiva Definitiva de Direitos Patrimoniais', '2025-01-10');
    expect(defExp).toBeNull();
  });

  it('reconhece quando a exclusividade temporária expirou e deixa de ser ativa', () => {
    const expiredRelease = {
      releaseType: 'Autorização Exclusiva de Gravação e Fixação (12 meses)',
      issueDate: '2024-01-01',
      expiresAt: '2025-01-01'
    };
    // Em 2026, já expirou
    const checkDate = new Date('2026-06-01T00:00:00Z');
    expect(isReleaseExpired(expiredRelease.releaseType, expiredRelease.issueDate, expiredRelease.expiresAt, checkDate)).toBe(true);
    expect(isActiveExclusiveRelease(expiredRelease, checkDate)).toBe(false);

    // Em 2024-06-01, ainda estava ativa
    const activeDate = new Date('2024-06-01T00:00:00Z');
    expect(isReleaseExpired(expiredRelease.releaseType, expiredRelease.issueDate, expiredRelease.expiresAt, activeDate)).toBe(false);
    expect(isActiveExclusiveRelease(expiredRelease, activeDate)).toBe(true);
  });

  it('mantém exclusividade definitiva permanentemente ativa', () => {
    const defRelease = {
      releaseType: 'Cessão Exclusiva Definitiva de Direitos Patrimoniais',
      issueDate: '2020-01-01'
    };
    const futureDate = new Date('2035-01-01T00:00:00Z');
    expect(isActiveExclusiveRelease(defRelease, futureDate)).toBe(true);
  });
});
