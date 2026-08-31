import { jsPDF } from 'jspdf';
import { ReleaseDocument } from '../types';
import { PublicReleaseValidation } from './database';
import { APP_CONFIG } from '../config/appConfig';

export type AnyReleaseData = ReleaseDocument | (PublicReleaseValidation & {
  agreedValue?: number;
  additionalConditions?: string;
});

const formatDate = (date: string) => {
  if (!date) return '';
  const [year, month, day] = date.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
};

/**
 * Gera um documento PDF oficial e elegante para o Termo de Liberação Fonográfica.
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
  doc.roundedRect(margin, cursorY, contentWidth, 16, 2, 2, 'FD');

  doc.setTextColor(22, 101, 52); // emerald-800
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('DOCUMENTO ELETRÔNICO OFICIAL COM AUTENTICIDADE REGISTRADA', margin + 5, cursorY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(21, 128, 61);
  doc.text(`Código de Registro: ${data.documentCode}  |  Validação Pública: ${validationUrl}`, margin + 5, cursorY + 11.5);

  cursorY += 21;

  // 3. Parties Box (Outorgante & Outorgado)
  const composerDoc = 'composerCpf' in data && data.composerCpf 
    ? data.composerCpf 
    : ('composerDocumentLast4' in data && data.composerDocumentLast4 ? `••••${data.composerDocumentLast4}` : '••••');
  
  const buyerDoc = 'buyerDocument' in data && data.buyerDocument 
    ? data.buyerDocument 
    : ('buyerDocumentLast4' in data && data.buyerDocumentLast4 ? `••••${data.buyerDocumentLast4}` : '••••');

  const colWidth = (contentWidth - 6) / 2;

  // Outorgante
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, cursorY, colWidth, 32, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9); // amber-700
  doc.text('OUTORGANTE (COMPOSITOR TITULAR):', margin + 4, cursorY + 6);

  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42); // slate-900
  const composerLines = doc.splitTextToSize(data.composerName, colWidth - 8);
  doc.text(composerLines, margin + 4, cursorY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Documento / CPF: ${composerDoc}`, margin + 4, cursorY + 20);
  doc.text(`Cidade / UF: ${data.composerCityState || 'Não informado'}`, margin + 4, cursorY + 26);

  // Outorgado
  doc.roundedRect(margin + colWidth + 6, cursorY, colWidth, 32, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text('OUTORGADO (INTÉRPRETE / PRODUTOR):', margin + colWidth + 10, cursorY + 6);

  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const buyerLines = doc.splitTextToSize(data.buyerName, colWidth - 8);
  doc.text(buyerLines, margin + colWidth + 10, cursorY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Documento / Identificação: ${buyerDoc}`, margin + colWidth + 10, cursorY + 20);
  doc.text(`Cidade / UF: ${data.buyerCityState || 'Não informado'}`, margin + colWidth + 10, cursorY + 26);

  cursorY += 38;

  // 4. Obra Musical Section
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, cursorY, contentWidth, 34, 2, 2, 'FD');

  // Left Amber indicator bar
  doc.setFillColor(245, 158, 11);
  doc.rect(margin, cursorY, 2.5, 34, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('OBRA MUSICAL OBJETO DA AUTORIZAÇÃO:', margin + 6, cursorY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`"${data.songTitle}"`, margin + 6, cursorY + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Autoria / Compositores: ${data.authors}`, margin + 6, cursorY + 19);

  // Split details row: Modalidade & Valor
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9);
  doc.text(`Modalidade de Licença: ${data.releaseType}`, margin + 6, cursorY + 27);

  const valueText = typeof data.agreedValue === 'number'
    ? `Valor Acordado e Quitado: R$ ${data.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'Valor Acordado e Quitado: Conforme Termo de Negociação';

  doc.setTextColor(22, 101, 52);
  doc.text(valueText, margin + 95, cursorY + 27);

  cursorY += 39;

  // 5. Finalidade e Condições
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('1. FINALIDADE DECLARADA E AUTORIZADA', margin, cursorY);
  cursorY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const purposeLines = doc.splitTextToSize(data.authorizedPurpose || 'Gravação, fixação e distribuição fonográfica comercial e promocional.', contentWidth - 4);
  doc.text(purposeLines, margin, cursorY);
  cursorY += (purposeLines.length * 3.8) + 4;

  if (data.additionalConditions) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text('2. CLÁUSULAS E CONDIÇÕES ESPECIAIS', margin, cursorY);
    cursorY += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const condLines = doc.splitTextToSize(data.additionalConditions, contentWidth - 4);
    doc.text(condLines, margin, cursorY);
    cursorY += (condLines.length * 3.8) + 4;
  }

  // 6. Base Legal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`${data.additionalConditions ? '3' : '2'}. DECLARAÇÃO DE EFICÁCIA E VALIDADE JURÍDICA`, margin, cursorY);
  cursorY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const legalText = 'O presente instrumento é emitido por via eletrônica nos termos da Lei Federal nº 9.610/1998 (Lei de Direitos Autorais) e em conformidade com o art. 10, § 2º da Medida Provisória nº 2.200-2/2001, constituindo título hábil para fins de registro fonográfico, liberação em produtoras, distribuidoras digitais e órgãos arrecadadores de direitos autorais.';
  const legalLines = doc.splitTextToSize(legalText, contentWidth - 4);
  doc.text(legalLines, margin, cursorY);
  cursorY += (legalLines.length * 3.6) + 7;

  // 7. Signature & Electronic Verification Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, cursorY, contentWidth, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Data de Emissão Oficial: ${formatDate(data.issueDate)}`, margin + 6, cursorY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Código de Registro Oficial: ${data.documentCode}`, margin + 6, cursorY + 13);
  doc.text(`Endereço de Consulta: ${validationUrl}`, margin + 6, cursorY + 19);

  // Digital Signature seal box
  const sigBoxWidth = 65;
  const sigBoxX = margin + contentWidth - sigBoxWidth - 4;
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
  const footerY = pageHeight - 12;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 4, margin + contentWidth, footerY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`${APP_CONFIG.name} • Plataforma Oficial de Conexão Fonográfica e Gestão de Direitos Autorais`, margin, footerY);
  doc.text(`Página 1 de 1  •  Emitido em ${new Date().toLocaleDateString('pt-BR')}`, margin + contentWidth - 45, footerY);

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
