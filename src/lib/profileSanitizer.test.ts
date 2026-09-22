import { describe, expect, it } from 'vitest';
import { getSafePublicBio, cleanTypography } from './profileSanitizer';

describe('profileSanitizer: getSafePublicBio', () => {
  it('substitui bio informal de teste "teste de biografiaooo" pelo texto oficial de curadoria para o perfil mercado', () => {
    const result = getSafePublicBio('teste de biografiaooo', 'Mercado', 'mercado');
    expect(result).toBe(
      'Perfil de curadoria oficial do Mercado do Compositor, reunindo obras selecionadas em diversos gêneros prontas para liberação e gravação fonográfica imediata.'
    );
  });

  it('substitui qualquer variação de "teste de biografia" mesmo sem username específico', () => {
    const result = getSafePublicBio('teste de biografia', 'João Silva', 'joao-silva');
    expect(result).toContain('João Silva é um compositor oficial');
    expect(result).not.toContain('teste de biografia');
  });

  it('substitui bio vazia ou com apenas espaços em branco por descrição profissional com nome do compositor', () => {
    const emptyResult = getSafePublicBio('', 'Amarildo Roque Ferrari', 'amarildo-roque-ferrari');
    expect(emptyResult).toBe(
      'Amarildo Roque Ferrari é um compositor oficial cadastrado na plataforma Mercado do Compositor, disponibilizando suas obras autorais para audição e liberação fonográfica.'
    );

    const spaceResult = getSafePublicBio('    ', 'Maria Cantora', 'maria-cantora');
    expect(spaceResult).toContain('Maria Cantora é um compositor oficial');
  });

  it('corrige pontuação com espaço antes do ponto final (BUG-08)', () => {
    const bioWithSpace = 'Músico com 5 anos compondo grandes sucessos . Mais de 20 faixas gravadas .';
    const clean = getSafePublicBio(bioWithSpace, 'Jo Zwirtes', 'jo-zwirtes');
    expect(clean).toBe('Músico com 5 anos compondo grandes sucessos. Mais de 20 faixas gravadas.');
  });

  it('preserva biografias legítimas e profissionais completas', () => {
    const legitBio =
      'Produtor cultural e empresário gaúcho com forte atuação no cenário do pop rock e da gestão musical no Sul do Brasil. Conhecido principalmente como baixista da banda gaúcha Dinamite Joe.';
    const result = getSafePublicBio(legitBio, 'Jo Zwirtes', 'jo-zwirtes');
    expect(result).toBe(legitBio);
  });
});

describe('profileSanitizer: cleanTypography', () => {
  it('remove espaço antes de ponto final em frases de experiência do compositor (BUG-08)', () => {
    const rawExperience = '5 anos compondo grandes sucessos .';
    expect(cleanTypography(rawExperience)).toBe('5 anos compondo grandes sucessos.');
  });

  it('remove espaços antes de múltiplos sinais de pontuação (vírgula, ponto e vírgula, exclamação, interrogação)', () => {
    const text = 'Composições sertanejas , românticas ; gravadas por grandes vozes ! Gostou ?';
    expect(cleanTypography(text)).toBe('Composições sertanejas, românticas; gravadas por grandes vozes! Gostou?');
  });

  it('retorna string vazia para valores nulos ou indefinidos', () => {
    expect(cleanTypography(null)).toBe('');
    expect(cleanTypography(undefined)).toBe('');
    expect(cleanTypography('   ')).toBe('');
  });
});

