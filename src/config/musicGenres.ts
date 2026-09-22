/**
 * Configuração e Catálogo de Gêneros Musicais e Subgêneros / Estilos
 * Mercado do Compositor
 */

export const MUSIC_GENRES = [
  'Sertanejo',
  'Bailão',
  'Bandas de Baile',
  'Forró / Piseiro',
  'Arrocha / Brega',
  'Samba / Pagode',
  'Gospel / Cristão',
  'MPB',
  'Pop',
  'Trap / Rap / Hip-Hop',
  'Funk',
  'Rock / Reggae',
  'Música Regional / Gaúcha',
  'Romântico / Seresta',
  'Axé / Pagodão',
  'Eletrônica',
  'Outro'
] as const;

export type MusicGenre = typeof MUSIC_GENRES[number];

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
  'Forró / Piseiro': [
    'Piseiro',
    'Forró Eletrônico',
    'Forró Romântico',
    'Forró Pé de Serra',
    'Xote Universitário',
    'Baião',
    'Arrasta-pé',
    'Pisadinha'
  ],
  'Arrocha / Brega': [
    'Arrocha Romântico',
    'Arrochadeira',
    'Brega Funk',
    'Brega Romântico / Saudade',
    'Tecnobrega',
    'Seresta Moderna'
  ],
  'Samba / Pagode': [
    'Pagode Romântico',
    'Pagode Moderno',
    'Samba de Raiz',
    'Partido Alto',
    'Samba Rock',
    'Samba-Enredo',
    'Samba de Roda'
  ],
  'Gospel / Cristão': [
    'Worship / Adoração',
    'Gospel Contemporâneo',
    'Pentecostal',
    'Louvor Congregacional',
    'Sertanejo Gospel',
    'Forró Gospel',
    'Pop Gospel',
    'Black Gospel'
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
  'Trap / Rap / Hip-Hop': [
    'Trap Brasileiro',
    'Boom Bap',
    'Drill',
    'R&B Nacional',
    'Rap Acústico',
    'Trap Funk'
  ],
  'Funk': [
    'Funk Pop',
    'Funk Melody',
    'Funk Consciente',
    'Funk Mandelão',
    'Funk Rave'
  ],
  'Rock / Reggae': [
    'Pop Rock Nacional',
    'Rock Clássico',
    'Indie Rock',
    'Hard Rock',
    'Reggae Nacional',
    'Reggae Roots'
  ],
  'Música Regional / Gaúcha': [
    'Vanera Tradicional',
    'Chamamé',
    'Milonga',
    'Chimarrita',
    'Bugio',
    'Carimbó'
  ],
  'Romântico / Seresta': [
    'Seresta / Seresta de Teclado',
    'Bolero',
    'Balada Romântica',
    'Canção de Amor'
  ],
  'Axé / Pagodão': [
    'Axé Music',
    'Pagodão Baiano',
    'Samba Reggae',
    'Afro-Pop'
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
