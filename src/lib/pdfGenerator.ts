import { jsPDF } from 'jspdf';
import type { ReleaseDocument } from '../types';
import type { PublicReleaseValidation } from './database';
import { APP_CONFIG } from '../config/appConfig';

export type AnyReleaseData = ReleaseDocument | (PublicReleaseValidation & {
  agreedValue?: number;
  additionalConditions?: string;
});

// Cláusulas da Declaração de Eficácia exibidas no PDF e na pré-visualização do termo.
export const RELEASE_LEGAL_CLAUSES = [
  'É vedado ao PRODUTOR/ARRANJADOR efetuar alterações no título e na letra da obra, podendo adaptá-la, arranjá-la ou modificar o ritmo e o andamento.',
  'Caso haja alterações não autorizadas, serão solidariamente acionados ARTISTA, RESPONSÁVEL, PRODUTOR e ARRANJADOR, DE ACORDO COM LEGISLAÇÃO VIGENTE.',
  'A presente Autorização é única, valendo a todos os compositores citados acima.',
  'Esta autorização concede ao intérprete o direito de cumprir em qualquer tipo de fonograma ou videofonograma, a obra citada, na sua totalidade ou em fragmentos, sob qualquer forma de instrumentação ou vocalização.',
  'O compositor declara e é responsável pelas informações desta liberação.',
];

export const formatCpfCnpj = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
};

const formatDate = (date: string) => {
  if (!date) return '';
  const [year, month, day] = date.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
};

/**
 * Gera o PDF do Termo de Liberação Fonográfica registrado na plataforma.
 */
export function generateReleasePdf(data: AnyReleaseData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const footerTop = pageHeight - 20;
  const navy: [number, number, number] = [15, 23, 42];
  const slate: [number, number, number] = [51, 65, 85];
  const muted: [number, number, number] = [100, 116, 139];
  const line: [number, number, number] = [203, 213, 225];
  const gold: [number, number, number] = [180, 131, 36];
  let cursorY = 18;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mercadodocompositor.com.br';
  const validationUrl = `${origin}/validar-documento?codigo=${data.documentCode}`;

  const drawHeader = () => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 4, 'F');
    doc.setFillColor(...gold);
    doc.rect(0, 4, pageWidth, 0.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...navy);
    doc.text(APP_CONFIG.name.toUpperCase(), margin, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text('Gestão e segurança de direitos fonográficos', margin, 21);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...navy);
    doc.text(`Registro nº ${data.documentCode}`, pageWidth - margin, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(`Emitido em ${formatDate(data.issueDate)}`, pageWidth - margin, 21, { align: 'right' });
    doc.setDrawColor(...line);
    doc.line(margin, 26, pageWidth - margin, 26);
  };

  const startPage = () => {
    if (doc.getNumberOfPages() > 1 || cursorY > 18) doc.addPage();
    drawHeader();
    cursorY = 34;
  };

  const ensureSpace = (height: number) => {
    if (cursorY + height <= footerTop) return;
    startPage();
  };

  const sectionHeader = (number: string, title: string) => {
    ensureSpace(14);
    doc.setFillColor(...gold);
    doc.rect(margin, cursorY - 4.5, 1.4, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...navy);
    doc.text(`${number}.  ${title.toUpperCase()}`, margin + 5, cursorY);
    doc.setDrawColor(...line);
    doc.line(margin, cursorY + 4, pageWidth - margin, cursorY + 4);
    cursorY += 11;
  };

  const field = (x: number, y: number, label: string, value: string, width: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...navy);
    const lines = doc.splitTextToSize(value || 'Não informado', width) as string[];
    doc.text(lines, x, y + 4.3);
    return lines.length;
  };

  const tableRow = (label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.6);
    const valueLines = doc.splitTextToSize(value || 'Não informado', contentWidth - 52) as string[];
    const height = Math.max(11.5, valueLines.length * 4.8 + 4.5);
    ensureSpace(height);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, cursorY, 46, height, 'F');
    doc.setDrawColor(...line);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    doc.line(margin, cursorY + height, pageWidth - margin, cursorY + height);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(), margin + 4, cursorY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.6);
    doc.setTextColor(...navy);
    doc.text(valueLines, margin + 51, cursorY + 7);
    cursorY += height;
  };

  drawHeader();
  cursorY = 35;
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...navy);
  doc.text('TERMO DE LIBERAÇÃO E AUTORIZAÇÃO DE GRAVAÇÃO', pageWidth / 2, cursorY, { align: 'center' });
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 14, cursorY + 7, pageWidth / 2 + 14, cursorY + 7);
  cursorY += 17;

  const composerDoc = 'composerCpf' in data && data.composerCpf
    ? formatCpfCnpj(data.composerCpf)
    : ('composerDocumentLast4' in data && data.composerDocumentLast4 ? `****${data.composerDocumentLast4}` : '****');

  const buyerDoc = 'buyerDocument' in data && data.buyerDocument
    ? formatCpfCnpj(data.buyerDocument)
    : ('buyerDocumentLast4' in data && data.buyerDocumentLast4 ? `****${data.buyerDocumentLast4}` : '****');

  const interpreterName = data.interpreterName?.trim() || data.buyerName;
  const iswc = data.iswc?.trim() || 'Não informado';
  sectionHeader('I', 'Qualificação das partes');
  const colWidth = (contentWidth - 6) / 2;
  const rightX = margin + colWidth + 6;
  doc.setDrawColor(...navy);
  doc.setLineWidth(1);
  doc.line(margin, cursorY, margin + colWidth, cursorY);
  doc.line(rightX, cursorY, pageWidth - margin, cursorY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...navy);
  doc.text('OUTORGANTE', margin, cursorY + 7);
  doc.text('OUTORGADO', rightX, cursorY + 7);
  doc.setFont('times', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text('Compositor titular', margin, cursorY + 12);
  doc.text('Intérprete / Produtor', rightX, cursorY + 12);
  const partyY = cursorY + 20;
  field(margin, partyY, 'Nome', data.composerName, colWidth - 4);
  field(margin, partyY + 14, 'CPF', composerDoc, colWidth - 4);
  field(margin, partyY + 28, 'Cidade / UF', data.composerCityState || 'Não informado', colWidth - 4);
  field(rightX, partyY, 'Nome do responsável', data.buyerName, colWidth - 4);
  field(rightX, partyY + 14, 'Intérprete', interpreterName, colWidth - 4);
  field(rightX, partyY + 28, 'CPF / CNPJ', buyerDoc, colWidth - 4);
  field(rightX, partyY + 42, 'Cidade / UF', data.buyerCityState || 'Não informado', colWidth - 4);
  cursorY = partyY + 54;

  sectionHeader('II', 'Obra musical objeto da autorização');
  cursorY -= 7;
  tableRow('Título', data.songTitle);
  tableRow('Autoria / Compositores', data.authors);
  tableRow('Código ISWC', iswc);
  tableRow('Intérprete', interpreterName);
  cursorY += 5;

  sectionHeader('III', 'Condições da autorização');
  cursorY -= 7;
  tableRow('Modalidade de licença', data.releaseType);
  const valueText = typeof data.agreedValue === 'number'
    ? `R$ ${data.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'Conforme Termo de Negociação';
  tableRow('Valor acordado', valueText);
  tableRow('Finalidade autorizada', data.authorizedPurpose || 'Gravação, fixação e distribuição fonográfica comercial e promocional.');
  cursorY += 5;

  let legalSection = 'IV';
  if (data.additionalConditions) {
    sectionHeader('IV', 'Cláusulas e condições especiais');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.6);
    doc.setTextColor(...navy);
    doc.text('4.1', margin, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...slate);
    const specialLines = doc.splitTextToSize(data.additionalConditions, contentWidth - 11) as string[];
    doc.text(specialLines, margin + 9, cursorY);
    cursorY += specialLines.length * 4.8 + 7;
    legalSection = 'V';
  }

  const legalClauses = [
    ...RELEASE_LEGAL_CLAUSES,
    'O presente instrumento é emitido por via eletrônica nos termos da Lei Federal nº 9.610/1998 (Lei de Direitos Autorais) e em conformidade com o art. 10, § 2º da Medida Provisória nº 2.200-2/2001, constituindo título hábil para fins de registro fonográfico, liberação em produtoras, distribuidoras digitais e órgãos arrecadadores de direitos autorais.'
  ];

  // Mantém o título junto da primeira cláusula. Antes ele podia ficar
  // isolado no final da página anterior, prejudicando a leitura do documento.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.8);
  const firstLegalLines = doc.splitTextToSize(legalClauses[0], contentWidth - 11) as string[];
  ensureSpace(11 + firstLegalLines.length * 4.1 + 4);
  sectionHeader(legalSection, 'Declaração de eficácia e validade jurídica');

  legalClauses.forEach((clause, index) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.8);
    const clauseX = margin + 10;
    const lines = doc.splitTextToSize(clause, pageWidth - margin - clauseX) as string[];
    const clauseLineHeight = 5.05;
    ensureSpace(lines.length * clauseLineHeight + 5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text(`${legalSection}.${index + 1}`, margin, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...slate);
    lines.forEach((lineText, lineIndex) => {
      doc.text(lineText, clauseX, cursorY + lineIndex * clauseLineHeight);
    });
    cursorY += lines.length * clauseLineHeight + 4;
  });

  ensureSpace(54);
  cursorY += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.2);
  doc.setTextColor(...slate);
  doc.text(`${data.composerCityState || 'Local não informado'}, ${formatDate(data.issueDate)}.`, margin, cursorY);
  cursorY += 10;
  const sigWidth = 88;
  const authX = margin + 98;
  doc.setFont('times', 'italic');
  doc.setFontSize(14.4);
  doc.setTextColor(...navy);
  doc.text(data.composerName, margin + sigWidth / 2, cursorY + 8, { align: 'center' });
  doc.setDrawColor(...navy);
  doc.line(margin, cursorY + 11, margin + sigWidth, cursorY + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(data.composerName.toUpperCase(), margin + sigWidth / 2, cursorY + 17, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...muted);
  doc.text(`CPF ${composerDoc}  -  Outorgante`, margin + sigWidth / 2, cursorY + 22, { align: 'center' });
  doc.setFontSize(7.3);
  const signatureText = `Assinado eletronicamente - ${data.digitalSignature || 'Assinatura Eletrônica Autenticada'}`;
  const signatureLines = doc.splitTextToSize(signatureText, sigWidth - 8) as string[];
  doc.text(signatureLines.slice(0, 2), margin + sigWidth / 2, cursorY + 27, { align: 'center' });

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...line);
  doc.roundedRect(authX, cursorY - 2, pageWidth - margin - authX, 36, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...gold);
  doc.text('AUTENTICIDADE VERIFICÁVEL', authX + 5, cursorY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...slate);
  doc.text('Consulte a autenticidade deste documento', authX + 5, cursorY + 11);
  doc.text('pelo código ou pelo endereço abaixo.', authX + 5, cursorY + 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  doc.text(data.documentCode, authX + 5, cursorY + 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...muted);
  doc.textWithLink('mercadodocompositor.com.br/validar-documento', authX + 5, cursorY + 28, { url: validationUrl });
  doc.setFontSize(6.7);
  doc.text('Clique no endereço ou informe o código acima.', authX + 5, cursorY + 32);

  const totalPages = doc.getNumberOfPages();
  const footerY = pageHeight - 10;
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...line);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...muted);
    doc.text(`${APP_CONFIG.name} - Documento emitido e registrado eletronicamente - ${data.documentCode}`, margin, footerY);
    doc.text(`Página ${page} de ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
  }

  return doc;
}

/**
 * Faz o download direto do arquivo PDF gerado.
 */
export function downloadReleasePdf(data: AnyReleaseData, customFilename?: string): void {
  const doc = generateReleasePdf(data);
  const code = (data.documentCode || 'DOCUMENTO').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = customFilename || `Termo_Liberacao_${code}.pdf`;
  doc.save(filename);
}

/**
 * Retorna o Blob do PDF gerado (para upload, pré-visualização em nova aba ou armazenamento).
 */
export function getReleasePdfBlob(data: AnyReleaseData): Blob {
  const doc = generateReleasePdf(data);
  return doc.output('blob');
}

/**
 * Retorna a Data URL base64 do PDF.
 */
export function getReleasePdfDataUrl(data: AnyReleaseData): string {
  const doc = generateReleasePdf(data);
  return doc.output('dataurlstring');
}
