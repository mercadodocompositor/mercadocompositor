import type { Song } from '../types';

export const slugify = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const getSongUrlKey = (song: Pick<Song, 'id' | 'title'>) => {
  const title = slugify(song.title) || 'musica';
  return `${title}-${song.id.slice(0, 8).toLowerCase()}`;
};

export const getInterestRequestUrl = (username: string, song: Pick<Song, 'id' | 'title'>) =>
  `/compositor/${encodeURIComponent(username)}/musica/${getSongUrlKey(song)}/interesse`;
