export const DEFAULT_SONG_COVER_URL = '/song-cover-default.svg';

/**
 * Duração máxima da prévia pública, em segundos. A Edge Function
 * validate-media-upload e o gatilho enforce_song_media_separation conferem o
 * mesmo limite no servidor: ao mudar aqui, mude lá também.
 */
export const PREVIEW_MAX_SECONDS = 85;
