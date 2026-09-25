/**
 * Configuração e Catálogo de Gêneros Musicais e Subgêneros / Estilos
 * Mercado do Compositor
 */

export const MUSIC_GENRES = [
  'Sertanejo',
  'Bailão',
  'Bandas de Baile',
  'Forró',
  'Piseiro',
  'Arrocha',
  'Brega',
  'Samba',
  'Pagode',
  'Gospel',
  'Cristão',
  'MPB',
  'Pop',
  'Trap',
  'Rap',
  'Hip-Hop',
  'Funk',
  'Rock',
  'Reggae',
  'Música Regional',
  'Gaúcha',
  'Romântico',
  'Seresta',
  'Axé',
  'Pagodão',
  'Eletrônica',
  'Outro'
] as const;

export type MusicGenre = typeof MUSIC_GENRES[number];

/**
 * Gêneros que antes eram agrupados ("Forró / Piseiro"). Músicas e perfis
 * antigos ainda podem trazer esses nomes; normalizeGenre/normalizeGenreList
 * convertem para os gêneros separados.
 */
export const LEGACY_GENRE_SPLITS: Record<string, string[]> = {
  'Forró / Piseiro': ['Forró', 'Piseiro'],
  'Arrocha / Brega': ['Arrocha', 'Brega'],
  'Samba / Pagode': ['Samba', 'Pagode'],
  'Gospel / Cristão': ['Gospel', 'Cristão'],
  'Trap / Rap / Hip-Hop': ['Trap', 'Rap', 'Hip-Hop'],
  'Rock / Reggae': ['Rock', 'Reggae'],
  'Música Regional / Gaúcha': ['Música Regional', 'Gaúcha'],
  'Romântico / Seresta': ['Romântico', 'Seresta'],
  'Axé / Pagodão': ['Axé', 'Pagodão']
};

export const GENRE_SUBGENRES_MAP: Record<string, string[]> = {
  'Bailão': [
    'Vanerão',
    'Katchaka',
    'Chutaria',
    'Bailão Sulista',
    'Chamamé de Baile',
    'Tchê Music',
    'Rancheira',
    'Xote de Baile',
    'Valsa de Salão',
    'Polca de Baile',
    'Bailão Sertanejo'
  ],
  'Bandas de Baile': [
    'Banda Show',
    'Bailão Popular',
    'Pop Baile',
    'Clássicos de Baile',
    'Vanera de Banda',
    'Marchinhas / Kerb',
    'Flashback de Baile',
    'Balada de Baile',
    'Cumbia / Chutaria',
    'Baile Gaúcho'
  ],
  'Sertanejo': [
    'Sertanejo Universitário',
    'Sertanejo Romântico',
    'Sertanejo Raiz / Modão',
    'Agronejo',
    'Bachanejo',
    'Sertanejo Acústico',
    'Sertanejo Sofrência',
    'Moda de Viola'
  ],
  'Forró': [
    'Forró Eletrônico',
    'Forró Romântico',
    'Forró Pé de Serra',
    'Xote Universitário',
    'Baião',
    'Arrasta-pé'
  ],
  'Piseiro': [
    'Piseiro',
    'Pisadinha',
    'Piseiro Romântico'
  ],
  'Arrocha': [
    'Arrocha Romântico',
    'Arrochadeira',
    'Seresta Moderna'
  ],
  'Brega': [
    'Brega Funk',
    'Brega Romântico / Saudade',
    'Tecnobrega'
  ],
  'Samba': [
    'Samba de Raiz',
    'Partido Alto',
    'Samba Rock',
    'Samba-Enredo',
    'Samba de Roda'
  ],
  'Pagode': [
    'Pagode Romântico',
    'Pagode Moderno'
  ],
  'Gospel': [
    'Gospel Contemporâneo',
    'Pentecostal',
    'Sertanejo Gospel',
    'Forró Gospel',
    'Pop Gospel',
    'Black Gospel'
  ],
  'Cristão': [
    'Worship / Adoração',
    'Louvor Congregacional'
  ],
  'MPB': [
    'MPB Contemporânea',
    'Nova MPB',
    'Bossa Nova',
    'Samba-Canção',
    'Folk Brasileiro',
    'Tropicália'
  ],
  'Pop': [
    'Pop Nacional',
    'Pop Romântico',
    'Pop Leve / Good Vibes',
    'Synthpop',
    'Eletropop',
    'Pop Acústico'
  ],
  'Trap': [
    'Trap Brasileiro',
    'Trap Funk',
    'Drill'
  ],
  'Rap': [
    'Boom Bap',
    'Rap Acústico'
  ],
  'Hip-Hop': [
    'Hip-Hop Nacional',
    'R&B Nacional'
  ],
  'Funk': [
    'Funk Pop',
    'Funk Melody',
    'Funk Consciente',
    'Funk Mandelão',
    'Funk Rave'
  ],
  'Rock': [
    'Pop Rock Nacional',
    'Rock Clássico',
    'Indie Rock',
    'Hard Rock'
  ],
  'Reggae': [
    'Reggae Nacional',
    'Reggae Roots'
  ],
  'Música Regional': [
    'Chamamé',
    'Carimbó'
  ],
  'Gaúcha': [
    'Vanera Tradicional',
    'Milonga',
    'Chimarrita',
    'Bugio'
  ],
  'Romântico': [
    'Bolero',
    'Balada Romântica',
    'Canção de Amor'
  ],
  'Seresta': [
    'Seresta / Seresta de Teclado'
  ],
  'Axé': [
    'Axé Music',
    'Samba Reggae',
    'Afro-Pop'
  ],
  'Pagodão': [
    'Pagodão Baiano'
  ],
  'Eletrônica': [
    'Brazilian Bass',
    'Slap House',
    'Deep House',
    'EDM / Festival',
    'Tech House'
  ],
  'Outro': [
    'Instrumental',
    'Acústico Voz e Violão',
    'Trilha Sonora',
    'Infantil'
  ]
};

/**
 * Retorna os subgêneros recomendados para um gênero específico
 */
export const getSubgenresForGenre = (genre: string): string[] => {
  return GENRE_SUBGENRES_MAP[genre] || GENRE_SUBGENRES_MAP['Outro'] || [];
};

/**
 * Lista plana e única de todos os subgêneros conhecidos no sistema
 */
export const ALL_SUBGENRES = Array.from(
  new Set(Object.values(GENRE_SUBGENRES_MAP).flat())
).sort((a, b) => a.localeCompare(b, 'pt-BR'));

/**
 * Converte um gênero agrupado antigo no gênero separado correspondente,
 * escolhido pelo subgênero quando ele pertence a uma das partes.
 */
export const normalizeGenre = (genre: string, subgenre?: string): string => {
  const parts = LEGACY_GENRE_SPLITS[genre];
  if (!parts) return genre;
  return parts.find(part => subgenre && GENRE_SUBGENRES_MAP[part]?.includes(subgenre)) || parts[0];
};

/** Separa gêneros agrupados antigos de uma lista, sem repetir e mantendo a ordem. */
export const normalizeGenreList = (genres: string[], max?: number): string[] => {
  const result: string[] = [];
  genres.forEach(genre => {
    (LEGACY_GENRE_SPLITS[genre] || [genre]).forEach(part => {
      if (!result.includes(part)) result.push(part);
    });
  });
  return max === undefined ? result : result.slice(0, max);
};
