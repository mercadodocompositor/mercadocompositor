const EXCLUSIVE_RELEASE_TYPES = new Set([
  'Autorização Exclusiva de Gravação e Fixação (12 meses)',
  'Autorização Exclusiva de Gravação e Fixação (24 meses)',
  'Cessão Exclusiva Definitiva de Direitos Patrimoniais',
  'Exclusiva por 12 meses',
  'Exclusiva por 24 meses',
  'Exclusiva',
  'Cessão Definitiva de Direitos Patrimoniais',
]);

const NORMALIZED_EXCLUSIVE_SET = new Set(
  Array.from(EXCLUSIVE_RELEASE_TYPES).map(t =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  )
);

export const isExclusiveReleaseType = (releaseType?: string | null): boolean => {
  if (!releaseType || typeof releaseType !== 'string') return false;

  const trimmed = releaseType.trim();
  if (!trimmed) return false;

  if (EXCLUSIVE_RELEASE_TYPES.has(trimmed)) return true;

  const normalized = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Se contiver qualquer variação de "não-exclusiva" / "não exclusiva" / "nao_exclusiva", nunca é exclusiva
  if (/nao[\s\-_]*exclusiv/i.test(normalized)) {
    return false;
  }

  // Verifica se bate com os tipos normalizados conhecidos
  if (NORMALIZED_EXCLUSIVE_SET.has(normalized)) {
    return true;
  }

  // Padrões canônicos que iniciam de forma inequívoca com exclusividade
  if (
    normalized.startsWith('autorizacao exclusiva') ||
    normalized.startsWith('cessao exclusiva') ||
    normalized.startsWith('exclusiva por') ||
    normalized === 'exclusiva'
  ) {
    return true;
  }

  return false;
};

export const isExclusiveRelease = isExclusiveReleaseType;

export const getReleaseDurationMonths = (releaseType?: string | null): number | null => {
  if (!releaseType || typeof releaseType !== 'string') return null;
  const match = releaseType.match(/(\d+)\s*meses/i);
  if (match) return parseInt(match[1], 10);
  return null;
};

export const calculateReleaseExpiration = (
  releaseType?: string | null,
  issueDate?: string | Date | null
): string | null => {
  if (!releaseType || !isExclusiveReleaseType(releaseType) || !issueDate) return null;
  const months = getReleaseDurationMonths(releaseType);
  if (!months) return null; // Exclusiva definitiva ou perpétua

  const base = typeof issueDate === 'string'
    ? new Date(issueDate.includes('T') ? issueDate : `${issueDate}T12:00:00Z`)
    : new Date(issueDate);
  if (isNaN(base.getTime())) return null;

  const exp = new Date(base);
  exp.setMonth(exp.getMonth() + months);
  return exp.toISOString().slice(0, 10);
};

export const isReleaseExpired = (
  releaseType?: string | null,
  issueDate?: string | Date | null,
  expiresAt?: string | Date | null,
  currentDate: Date = new Date()
): boolean => {
  if (expiresAt) {
    const exp = typeof expiresAt === 'string'
      ? new Date(expiresAt.includes('T') ? expiresAt : `${expiresAt}T23:59:59Z`)
      : new Date(expiresAt);
    if (!isNaN(exp.getTime())) return currentDate > exp;
  }
  const calculated = calculateReleaseExpiration(releaseType, issueDate);
  if (!calculated) return false;
  const exp = new Date(`${calculated}T23:59:59Z`);
  return currentDate > exp;
};

export const isActiveExclusiveRelease = (
  release: { releaseType?: string | null; issueDate?: string | null; expiresAt?: string | null },
  currentDate: Date = new Date()
): boolean => {
  if (!isExclusiveReleaseType(release?.releaseType)) return false;
  return !isReleaseExpired(release?.releaseType, release?.issueDate, release?.expiresAt, currentDate);
};

