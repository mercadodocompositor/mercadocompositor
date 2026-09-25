/**
 * Lê um valor em reais digitado ou colado pelo usuário.
 *
 * Aceita "3500", "3.500", "3500,5", "3.500,00" e "R$ 3.500,00". A vírgula é
 * sempre o separador decimal; o ponto é separador de milhar, exceto quando
 * aparece uma única vez seguido de 1 ou 2 dígitos ("3500.50", colado de
 * planilha). Devolve '' para campo vazio e null para texto inválido.
 */
export const parseBrlAmount = (input: string): number | '' | null => {
  const text = input.replace(/R\$|\s/gi, '');
  if (!text) return '';
  if (!/^[\d.,]+$/.test(text)) return null;

  let normalized: string;
  if (text.includes(',')) {
    if ((text.match(/,/g) || []).length > 1) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = (text.match(/\./g) || []).length;
    normalized = dots === 1 && /\.\d{1,2}$/.test(text) ? text : text.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
};

export const formatBrlAmount = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
