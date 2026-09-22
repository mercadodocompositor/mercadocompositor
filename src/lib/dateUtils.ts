/**
 * Utilitários centralizados de data e fuso horário para o Mercado do Compositor.
 * Trata o clássico bug de fuso horário UTC (conversão indevida para o dia anterior no Brasil UTC-3)
 * e fornece formatação padronizada e filtros seguros de período.
 */

/**
 * Converte com segurança uma string de data (seja "YYYY-MM-DD" ou ISO completo "YYYY-MM-DDTHH:mm:ss.sssZ")
 * para um objeto Date ajustado ao horário local, sem retroceder um dia por causa do fuso UTC.
 */
export function parseIsoDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Caso 1: Formato puro de data "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [yearStr, monthStr, dayStr] = trimmed.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed no JS
    const day = parseInt(dayStr, 10);
    
    const parsed = new Date(year, month, day, 12, 0, 0); // Meio-dia local evita variações de horário de verão e fuso
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Caso 2: Formato ISO ou timestamp completo
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formata uma data para o padrão brasileiro: "DD/MM/AAAA" ou "DD/MM/AAAA às HH:mm".
 */
export function formatBrazilianDate(
  dateInput: string | Date | null | undefined, 
  includeTime = false
): string {
  if (!dateInput) return '';

  let date: Date | null;
  if (dateInput instanceof Date) {
    date = isNaN(dateInput.getTime()) ? null : dateInput;
  } else {
    date = parseIsoDate(dateInput);
  }

  if (!date) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  if (!includeTime) {
    return `${day}/${month}/${year}`;
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}

/**
 * Retorna o início do dia (00:00:00.000) no horário local do usuário.
 */
export function getStartOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/**
 * Retorna o fim do dia (23:59:59.999) no horário local do usuário.
 */
export function getEndOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export type PeriodPreset = 'all' | 'today' | '7d' | '30d' | 'month';

/**
 * Verifica se uma data de registro pertence ao preset de período selecionado.
 */
export function isDateWithinPeriod(
  dateInput: string | Date | null | undefined, 
  preset: PeriodPreset, 
  referenceDate: Date = new Date()
): boolean {
  if (preset === 'all') return true;
  if (!dateInput) return false;

  const targetDate = dateInput instanceof Date ? dateInput : parseIsoDate(dateInput);
  if (!targetDate) return false;

  const targetTime = targetDate.getTime();
  const startOfToday = getStartOfDay(referenceDate).getTime();
  const endOfToday = getEndOfDay(referenceDate).getTime();

  switch (preset) {
    case 'today':
      return targetTime >= startOfToday && targetTime <= endOfToday;

    case '7d': {
      const sevenDaysAgo = getStartOfDay(new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000)).getTime();
      return targetTime >= sevenDaysAgo && targetTime <= endOfToday;
    }

    case '30d': {
      const thirtyDaysAgo = getStartOfDay(new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000)).getTime();
      return targetTime >= thirtyDaysAgo && targetTime <= endOfToday;
    }

    case 'month': {
      const startOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0).getTime();
      return targetTime >= startOfMonth && targetTime <= endOfToday;
    }

    default:
      return true;
  }
}
