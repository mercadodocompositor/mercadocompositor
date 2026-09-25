import { describe, it, expect } from 'vitest';
import { MUSIC_GENRES, GENRE_SUBGENRES_MAP, LEGACY_GENRE_SPLITS, getSubgenresForGenre, normalizeGenre, normalizeGenreList, ALL_SUBGENRES } from './musicGenres';

describe('Catálogo de Gêneros Musicais e Subgêneros / Estilos', () => {
  it('contém os gêneros solicitados: Bailão e Bandas de Baile', () => {
    expect(MUSIC_GENRES).toContain('Bailão');
    expect(MUSIC_GENRES).toContain('Bandas de Baile');
    expect(MUSIC_GENRES).toContain('Sertanejo');
    expect(MUSIC_GENRES).toContain('Forró');
    expect(MUSIC_GENRES).toContain('Piseiro');
    expect(MUSIC_GENRES).not.toContain('Forró / Piseiro');
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
    const pagodeSubs = getSubgenresForGenre('Pagode');
    const forroSubs = getSubgenresForGenre('Forró');

    expect(pagodeSubs).toContain('Pagode Romântico');
    expect(forroSubs).not.toContain('Pagode Romântico');
    expect(getSubgenresForGenre('Piseiro')[0]).toBe('Piseiro');
  });

  it('todo gênero do catálogo tem subgêneros próprios', () => {
    MUSIC_GENRES.forEach(genre => {
      expect(GENRE_SUBGENRES_MAP[genre]?.length, genre).toBeGreaterThan(0);
    });
  });

  it('converte gêneros agrupados antigos para os gêneros separados', () => {
    expect(normalizeGenre('Forró / Piseiro', 'Pisadinha')).toBe('Piseiro');
    expect(normalizeGenre('Forró / Piseiro', 'Baião')).toBe('Forró');
    expect(normalizeGenre('Trap / Rap / Hip-Hop', 'R&B Nacional')).toBe('Hip-Hop');
    expect(normalizeGenre('Samba / Pagode')).toBe('Samba');
    expect(normalizeGenre('MPB', 'Bossa Nova')).toBe('MPB');
    Object.values(LEGACY_GENRE_SPLITS).flat().forEach(genre => expect(MUSIC_GENRES).toContain(genre));
    expect(normalizeGenreList(['Sertanejo', 'Forró / Piseiro', 'Forró'])).toEqual(['Sertanejo', 'Forró', 'Piseiro']);
    expect(normalizeGenreList(['Trap / Rap / Hip-Hop', 'Rock / Reggae', 'MPB'], 5)).toEqual(['Trap', 'Rap', 'Hip-Hop', 'Rock', 'Reggae']);
  });
});
