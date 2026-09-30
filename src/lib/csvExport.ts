/**
 * Exportação CSV compartilhada pelos relatórios.
 *
 * Os relatórios do admin montavam um `data:` URI com `encodeURI`, que não
 * codifica `#`: um título como "Tema #1" cortava o arquivo nesse ponto. E o
 * relatório de músicas levava título e autores sem proteção contra fórmulas
 * (um texto iniciado por `=` é executado pelo Excel de quem abre o arquivo).
 */

/** Célula entre aspas, com proteção contra fórmulas de planilha. */
export const csvCell = (value: unknown): string => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

/** Monta o CSV (separador `;`, BOM para o Excel) e dispara o download. */
export const downloadCsv = (filename: string, headers: string[], rows: unknown[][]): void => {
  const content = '﻿' + [headers.map(csvCell).join(';'), ...rows.map(row => row.map(csvCell).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar no mesmo instante cancela o download no Safari e no Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
