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

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 18;
  const contentWidth = pageWidth - margin * 2; // 174mm
  let cursorY = margin;
  const footerTop = pageHeight - 18;

  // Condições especiais longas podem passar de uma página.
  const ensureSpace = (height: number) => {
    if (cursorY + height <= footerTop) return;
    doc.addPage();
    cursorY = margin;
  };

  // 1. Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, cursorY, contentWidth, 24, 'F');

  // Accent line
  doc.setFillColor(245, 158, 11); // amber-500
  doc.rect(margin, cursorY + 23, contentWidth, 1.5, 'F');

  // Header Text
  doc.setTextColor(245, 158, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(APP_CONFIG.name.toUpperCase() + ' — GESTÃO E SEGURANÇA FONOGRÁFICA', margin + 6, cursorY + 8);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('TERMO DE LIBERAÇÃO E AUTORIZAÇÃO DE GRAVAÇÃO', margin + 6, cursorY + 16);

  cursorY += 30;

  // 2. Authenticity & Registration Box
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mercadodocompositor.com.br';
  const validationUrl = `${origin}/validar-documento?codigo=${data.documentCode}`;

  doc.setFillColor(240, 253, 244); // emerald-50
  doc.setDrawColor(187, 247, 208); // emerald-200
  doc.roundedRect(margin, cursorY, contentWidth, 20, 2, 2, 'FD');

  doc.setTextColor(22, 101, 52); // emerald-800
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('REGISTRO ELETRÔNICO COM AUTENTICIDADE VERIFICÁVEL', margin + 5, cursorY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(21, 128, 61);
  // Em uma linha só, o código + URL passava da borda direita da página.
  doc.text(`Código de Registro: ${data.documentCode}`, margin + 5, cursorY + 11.5);
  doc.text(`Validação Pública: ${validationUrl}`, margin + 5, cursorY + 15.5);

  cursorY += 25;

  // 3. Parties Box (Outorgante & Outorgado)
  // Documento completo: CPF/CNPJ por extenso. A validação pública só recebe os
  // quatro últimos dígitos, então o PDF gerado a partir dela segue mascarado.
  const composerDoc = 'composerCpf' in data && data.composerCpf
    ? formatCpfCnpj(data.composerCpf)
    : ('composerDocumentLast4' in data && data.composerDocumentLast4 ? `••••${data.composerDocumentLast4}` : '••••');

  const buyerDoc = 'buyerDocument' in data && data.buyerDocument
    ? formatCpfCnpj(data.buyerDocument)
    : ('buyerDocumentLast4' in data && data.buyerDocumentLast4 ? `••••${data.buyerDocumentLast4}` : '••••');

  const interpreterName = data.interpreterName?.trim() || data.buyerName;
  const iswc = data.iswc?.trim() || 'Não informado';

  const colWidth = (contentWidth - 6) / 2;
  const colTextWidth = colWidth - 8;
  const lineHeight = 3.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const composerLines: string[] = doc.splitTextToSize(data.composerName, colTextWidth);
  doc.setFontSize(8);
  const responsibleLines: string[] = doc.splitTextToSize(`Nome do Responsável: ${data.buyerName}`, colTextWidth);
  const interpreterLines: string[] = doc.splitTextToSize(`Intérprete: ${interpreterName}`, colTextWidth);

  const composerBodyHeight = composerLines.length * 4.2 + 2 * lineHeight + 3;
  const buyerBodyHeight = (responsibleLines.length + interpreterLines.length + 2) * lineHeight + 3;
  const partiesHeight = 12 + Math.max(composerBodyHeight, buyerBodyHeight);

  // Outorgante
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, cursorY, colWidth, partiesHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9); // amber-700
  doc.text('OUTORGANTE (COMPOSITOR TITULAR):', margin + 4, cursorY + 6);

  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(composerLines, margin + 4, cursorY + 12);
  let leftY = cursorY + 12 + composerLines.length * 4.2 + 1.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`CPF: ${composerDoc}`, margin + 4, leftY);
  leftY += lineHeight;
  doc.text(`Cidade / UF: ${data.composerCityState || 'Não informado'}`, margin + 4, leftY);

  // Outorgado: a liberação sai em nome do responsável (CPF/CNPJ), mas quem
  // grava pode ser uma banda ou dupla.
  const rightX = margin + colWidth + 10;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin + colWidth + 6, cursorY, colWidth, partiesHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text('OUTORGADO (INTÉRPRETE / PRODUTOR):', rightX, cursorY + 6);

  let rightY = cursorY + 12;
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(responsibleLines, rightX, rightY);
  rightY += responsibleLines.length * lineHeight;
  doc.text(interpreterLines, rightX, rightY);
  rightY += interpreterLines.length * lineHeight;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`CPF / CNPJ: ${buyerDoc}`, rightX, rightY);
  rightY += lineHeight;
  doc.text(`Cidade / UF: ${data.buyerCityState || 'Não informado'}`, rightX, rightY);

  cursorY += partiesHeight + 6;

  // 4. Obra Musical Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const titleLines: string[] = doc.splitTextToSize(`"${data.songTitle}"`, contentWidth - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const authorLines: string[] = doc.splitTextToSize(`Autoria / Compositores: ${data.authors}`, contentWidth - 12);
  const songInterpreterLines: string[] = doc.splitTextToSize(`Intérprete: ${interpreterName}`, contentWidth - 12);
  // Espelha o avanço de linhas abaixo (título, autoria, ISWC, intérprete, modalidade) + margem inferior.
  const songBoxHeight = 13 + titleLines.length * 5 + 1 + (authorLines.length + 1 + songInterpreterLines.length) * 4 + 3 + 5;

  ensureSpace(songBoxHeight + 5);
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, cursorY, contentWidth, songBoxHeight, 2, 2, 'FD');

  // Left Amber indicator bar
  doc.setFillColor(245, 158, 11);
  doc.rect(margin, cursorY, 2.5, songBoxHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('OBRA MUSICAL OBJETO DA AUTORIZAÇÃO:', margin + 6, cursorY + 6);

  let songY = cursorY + 13;
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(titleLines, margin + 6, songY);
  songY += titleLines.length * 5 + 1;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(authorLines, margin + 6, songY);
  songY += authorLines.length * 4;
  doc.text(`Código ISWC: ${iswc}`, margin + 6, songY);
  songY += 4;
  doc.text(songInterpreterLines, margin + 6, songY);
  songY += songInterpreterLines.length * 4 + 3;

  // Split details row: Modalidade & Valor
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9);
  doc.text(`Modalidade de Licença: ${data.releaseType}`, margin + 6, songY);

  const valueText = typeof data.agreedValue === 'number'
    ? `Valor Acordado: R$ ${data.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'Valor Acordado: Conforme Termo de Negociação';

  doc.setTextColor(22, 101, 52);
  doc.text(valueText, margin + 95, songY);

  cursorY += songBoxHeight + 5;

  // 5. Finalidade e Condições
  const writeSection = (title: string, paragraphs: string[], fontSize = 8, paragraphLineHeight = 3.8) => {
    ensureSpace(4.5 + paragraphLineHeight * 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(title, margin, cursorY);
    cursorY += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(51, 65, 85);
    paragraphs.forEach(paragraph => {
      const lines: string[] = doc.splitTextToSize(paragraph, contentWidth - 4);
      lines.forEach(line => {
        ensureSpace(paragraphLineHeight);
        doc.text(line, margin, cursorY);
        cursorY += paragraphLineHeight;
      });
      cursorY += 1.5;
    });
    cursorY += 2.5;
  };

  writeSection('1. FINALIDADE DECLARADA E AUTORIZADA', [
    data.authorizedPurpose || 'Gravação, fixação e distribuição fonográfica comercial e promocional.'
  ]);

  if (data.additionalConditions) {
    writeSection('2. CLÁUSULAS E CONDIÇÕES ESPECIAIS', [data.additionalConditions]);
  }

  // 6. Base Legal
  writeSection(`${data.additionalConditions ? '3' : '2'}. DECLARAÇÃO DE EFICÁCIA E VALIDADE JURÍDICA`, [
    ...RELEASE_LEGAL_CLAUSES,
    'O presente instrumento é emitido por via eletrônica nos termos da Lei Federal nº 9.610/1998 (Lei de Direitos Autorais) e em conformidade com o art. 10, § 2º da Medida Provisória nº 2.200-2/2001, constituindo título hábil para fins de registro fonográfico, liberação em produtoras, distribuidoras digitais e órgãos arrecadadores de direitos autorais.'
  ], 7.5, 3.6);
  cursorY += 2;

  // 7. Signature & Electronic Verification Box
  // A URL fica em linha própria, quebrada antes do selo de assinatura (à direita).
  const sigBoxWidth = 65;
  const sigBoxX = margin + contentWidth - sigBoxWidth - 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const urlLines: string[] = doc.splitTextToSize(validationUrl, sigBoxX - (margin + 6) - 3);
  const verificationBoxHeight = Math.max(28, 23 + urlLines.length * 3 + 2);

  ensureSpace(verificationBoxHeight + 2);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, cursorY, contentWidth, verificationBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Data de Emissão: ${formatDate(data.issueDate)}`, margin + 6, cursorY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Código do Registro: ${data.documentCode}`, margin + 6, cursorY + 13);
  doc.text('Endereço de Consulta:', margin + 6, cursorY + 19);
  doc.setFontSize(6.5);
  doc.text(urlLines, margin + 6, cursorY + 23);

  // Digital Signature seal box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(sigBoxX, cursorY + 3, sigBoxWidth, 22, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text('ASSINATURA DIGITAL REGISTRADA', sigBoxX + 4, cursorY + 8);

  doc.setFont('times', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(data.composerName, sigBoxX + 4, cursorY + 14);

  doc.setFont('courier', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  const sigSnippet = data.digitalSignature ? (data.digitalSignature.length > 38 ? `${data.digitalSignature.slice(0, 38)}...` : data.digitalSignature) : 'Assinatura Eletrônica Autenticada';
  doc.text(sigSnippet, sigBoxX + 4, cursorY + 20);

  // 8. Footer
  const totalPages = doc.getNumberOfPages();
  const footerY = pageHeight - 12;
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, footerY - 4, margin + contentWidth, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${APP_CONFIG.name} • Plataforma de conexão fonográfica e gestão de registros`, margin, footerY);
    doc.text(`Página ${page} de ${totalPages}  •  Emitido em ${new Date().toLocaleDateString('pt-BR')}`, margin + contentWidth - 45, footerY);
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
