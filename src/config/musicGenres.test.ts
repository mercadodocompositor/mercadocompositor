import { describe, it, expect } from 'vitest';
import { MUSIC_GENRES, GENRE_SUBGENRES_MAP, getSubgenresForGenre, ALL_SUBGENRES } from './musicGenres';

describe('Catálogo de Gêneros Musicais e Subgêneros / Estilos', () => {
  it('contém os gêneros solicitados: Bailão e Bandas de Baile', () => {
    expect(MUSIC_GENRES).toContain('Bailão');
    expect(MUSIC_GENRES).toContain('Bandas de Baile');
    expect(MUSIC_GENRES).toContain('Sertanejo');
    expect(MUSIC_GENRES).toContain('Forró / Piseiro');
    expect(MUSIC_GENRES).toContain('Arrocha / Brega');
  });

  it('fornece subgêneros e estilos específicos para Bailão', () => {
    const bailaoSubs = getSubgenresForGenre('Bailão');
    expect(bailaoSubs).toBeDefined();
    expect(bailaoSubs.length).toBeGreaterThanOrEqual(5);
    expect(bailaoSubs).toContain('Vanerão');
    expect(bailaoSubs).toContain('Katchaka');
    expect(bailaoSubs).toContain('Chutaria');
    expect(bailaoSubs).toContain('Bailão Sulista');
  });

  it('fornece subgêneros e estilos específicos para Bandas de Baile', () => {
    const bandasSubs = getSubgenresForGenre('Bandas de Baile');
    expect(bandasSubs).toBeDefined();
    expect(bandasSubs.length).toBeGreaterThanOrEqual(5);
    expect(bandasSubs).toContain('Banda Show');
    expect(bandasSubs).toContain('Pop Baile');
    expect(bandasSubs).toContain('Clássicos de Baile');
    expect(bandasSubs).toContain('Vanera de Banda');
  });

  it('retorna fallback seguro para gêneros não mapeados', () => {
    const fallback = getSubgenresForGenre('Gênero Inexistente XYZ');
    expect(Array.isArray(fallback)).toBe(true);
    expect(fallback.length).toBeGreaterThan(0);
  });

  it('compila lista consolidada ALL_SUBGENRES com itens únicos', () => {
    expect(ALL_SUBGENRES.length).toBeGreaterThan(30);
    const unique = new Set(ALL_SUBGENRES);
    expect(unique.size).toBe(ALL_SUBGENRES.length);
  });

  it('valida coerência entre gêneros e subgêneros na troca de categorias', () => {
    const pagodeSubs = getSubgenresForGenre('Samba / Pagode');
    const forroSubs = getSubgenresForGenre('Forró / Piseiro');

    expect(pagodeSubs).toContain('Pagode Romântico');
    expect(forroSubs).not.toContain('Pagode Romântico');
    expect(forroSubs[0]).toBe('Piseiro');
  });
});
