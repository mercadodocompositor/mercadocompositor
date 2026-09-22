/**
 * Utilitários de sanitização e apresentação de perfis de compositores públicos.
 * Garante que textos de teste (ex.: 'teste de biografiaooo'), placeholders ou bios vazias
 * sejam apresentados com redação profissional e elegante em toda a interface pública.
 */

export function getSafePublicBio(bio?: string | null, stageName?: string, username?: string): string {
  const trimmed = (bio || '').trim();

  // Expressões para detecção de textos residuais de homologação ou teste
  const isTestPlaceholder =
    !trimmed ||
    /^(teste|test)(\s+de\s+biografia.*)?$/i.test(trimmed) ||
    /teste de biografia/i.test(trimmed) ||
    /^teste(\s+[a-z0-9_-]+)?$/i.test(trimmed) ||
    /lorem ipsum/i.test(trimmed) ||
    trimmed.length < 15;

  if (isTestPlaceholder) {
    const cleanUsername = (username || '').trim().toLowerCase();
    const cleanName = (stageName || '').trim().toLowerCase();

    if (cleanUsername === 'mercado' || cleanName === 'mercado') {
      return 'Perfil de curadoria oficial do Mercado do Compositor, reunindo obras selecionadas em diversos gêneros prontas para liberação e gravação fonográfica imediata.';
    }

    const displayName = stageName ? stageName.trim() : 'Compositor';
    return `${displayName} é um compositor oficial cadastrado na plataforma Mercado do Compositor, disponibilizando suas obras autorais para audição e liberação fonográfica.`;
  }

  // Higieniza pequenos vícios tipográficos (ex: "sucessos ." -> "sucessos.")
  return cleanTypography(trimmed);
}

export function cleanTypography(text?: string | null): string {
  if (!text) return '';
  return text.trim().replace(/\s+([.,;:!?])/g, '$1');
}

