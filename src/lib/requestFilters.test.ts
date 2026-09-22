import { describe, expect, it } from 'vitest';
import { parseRequestFilters, serializeRequestFilters } from './requestFilters';

describe('request URL filters', () => {
  it('rejects unknown status and invalid pages', () => {
    expect(parseRequestFilters(new URLSearchParams('status=inventado&page=1.5')).status).toBe('todas');
    expect(parseRequestFilters(new URLSearchParams('status=inventado&page=1.5')).page).toBe(1);
    expect(parseRequestFilters(new URLSearchParams('page=-2')).page).toBe(1);
    expect(parseRequestFilters(new URLSearchParams('status=DESCONHECIDO&page=2.7')).status).toBe('todas');
    expect(parseRequestFilters(new URLSearchParams('status=DESCONHECIDO&page=2.7')).page).toBe(1);
  });

  it('restores a valid filtered page from a shared URL', () => {
    expect(parseRequestFilters(new URLSearchParams('status=arquivada&sort=oldest&page=3')))
      .toMatchObject({ status: 'arquivada', sort: 'oldest', page: 3 });
  });

  it('serializes valid filters into canonical URLSearchParams', () => {
    const params = serializeRequestFilters({
      status: 'arquivada',
      song: 'song-123',
      query: 'joao',
      sort: 'oldest',
      page: 3
    });
    expect(params.toString()).toBe('status=arquivada&song=song-123&q=joao&sort=oldest&page=3');
  });

  it('omits defaults and invalid values when serializing', () => {
    const params = serializeRequestFilters({
      status: 'todas',
      song: 'todas',
      query: '',
      sort: 'recent',
      page: 1
    });
    expect(params.toString()).toBe('');
  });
});
