import React, { useState } from 'react';
import { ReleaseDocument } from '../../types';
import { X, FileCheck, Copy, CheckCircle, ShieldCheck, Printer, Phone, Download, Loader2, ExternalLink } from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';
import { downloadReleaseDocument } from '../../lib/releaseArchive';
import { normalizeBrazilianWhatsapp } from '../../lib/contact';
import { useModalFocus } from '../../hooks/useModalFocus';

interface LiberacaoDocumentModalProps {
  document: ReleaseDocument;
  buyerPhone?: string;
  onClose: () => void;
  onCompleteNegotiation?: () => void;
  archiveError?: string;
  archiving?: boolean;
  onRetryArchive?: () => void;
}

export const LiberacaoDocumentModal: React.FC<LiberacaoDocumentModalProps> = ({
  document,
  buyerPhone,
  onClose,
  onCompleteNegotiation,
  archiveError,
  archiving,
  onRetryArchive
}) => {
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const validationUrl = `${window.location.origin}/validar-documento?codigo=${document.documentCode}`;
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose);

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      setDownloadError(null);
      setDownloadNotice(null);
      // Allow slight tick for UI update
      await new Promise(resolve => setTimeout(resolve, 50));
      const archived = await downloadReleaseDocument(document);
      setDownloadNotice(archived ? 'PDF arquivado baixado.' : 'PDF gerado e baixado. O documento ainda não foi arquivado.');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      setDownloadError('Não foi possível baixar o PDF. Tente novamente.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleCopySummary = async () => {
    const summary = [
      `🎵 ${APP_CONFIG.name} — Termo de Liberação Fonográfica`,
      `Código de Autenticidade: ${document.documentCode}`,
      `Obra Musical: "${document.songTitle}"`,
      `Compositor (Outorgante): ${document.composerName}`,
      `Intérprete (Outorgado): ${document.buyerName}`,
      `Tipo de Autorização: ${document.releaseType}`,
      `Valor Acordado: R$ ${document.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `Data de Emissão: ${formatDate(document.issueDate)}`,
      `Consulta Pública de Autenticidade: ${validationUrl}`,
      'Registro eletrônico emitido pela plataforma Mercado do Compositor.'
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 3000);
    } catch {
      setSummaryCopied(false);
    }
  };

  const handleSendWhatsApp = () => {
    const normalizedPhone = buyerPhone ? normalizeBrazilianWhatsapp(buyerPhone) : null;
    const message = encodeURIComponent(
      `Olá, ${document.buyerName}! Segue o Termo de Liberação da música "${document.songTitle}" emitido por ${document.composerName}.\n\nCódigo do Documento: ${document.documentCode}\nTipo: ${document.releaseType}\n\nVocê pode consultar a autenticidade do registro no link:\n${validationUrl}`
    );

    if (normalizedPhone) {
      window.open(`https://wa.me/${normalizedPhone}?text=${message}`, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (date: string) => {
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

  const maskDocument = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 4) return '••••';
    return `${'•'.repeat(Math.max(3, digits.length - 4))}${digits.slice(-4)}`;
  };

  return (
    <div className="release-print-root fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:p-0 print:static print:bg-white">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="release-document-title" className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-4 sm:p-8 shadow-2xl relative my-6 text-slate-100 print:border-none print:shadow-none print:bg-white print:text-slate-900 print:my-0 print:max-w-none max-h-[calc(100dvh-2rem)] overflow-y-auto touch-scroll">
        
        {/* Header Actions (Hidden when printing) */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="release-document-title" className="font-bold text-base sm:text-lg text-white">Termo de Liberação Fonográfica</h3>
              <p className="text-xs text-slate-400">Código do registro: {document.documentCode}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              data-autofocus
              type="button"
              onClick={onClose}
              aria-label="Fechar documento"
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!document.documentPath && onRetryArchive && (
          <div role={archiveError ? 'alert' : 'status'} className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 print:hidden">
            <p>Termo emitido. {archiving ? 'Arquivando PDF...' : archiveError ? `Falha ao arquivar o PDF: ${archiveError}` : 'O PDF ainda precisa ser arquivado.'}</p>
            {!archiving && <button type="button" onClick={onRetryArchive} className="mt-2 rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950">Arquivar PDF</button>}
          </div>
        )}

        {document.documentPath && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 print:hidden">
            PDF arquivado. O download utiliza a versão armazenada.
          </div>
        )}

        {/* Authenticity Banner */}
        <div className="mb-6 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-300 print:bg-emerald-50 print:border-emerald-400 print:text-emerald-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold uppercase tracking-wider text-[10px] sm:text-xs">
              Registro eletrônico com autenticidade verificável
            </span>
          </div>
          <a
            href={validationUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline flex items-center gap-1"
          >
            <span>Verificar autenticidade pública</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Printable Official Document Box */}
        <div className="bg-slate-950 border border-slate-800 p-5 sm:p-8 rounded-2xl shadow-inner space-y-6 text-slate-200 print:bg-white print:text-slate-900 print:border-none print:p-0">
          
          {/* Header Document */}
          <div className="text-center border-b border-slate-800 print:border-slate-300 pb-6 space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-amber-400 font-bold print:text-amber-700">
              {APP_CONFIG.name} — AUTORIZAÇÃO E CESSÃO FONOGRÁFICA
            </p>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white print:text-black tracking-tight uppercase">
              Termo de Liberação e Autorização de Gravação
            </h2>
            <p className="text-xs text-slate-400 print:text-slate-600">
              Autorização Expressa de Direitos Patrimoniais de Autor para Fixação e Exploração Fonográfica
            </p>
          </div>

          {/* Parties Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-900/60 print:bg-slate-100 p-4 rounded-xl border border-slate-800/80 print:border-slate-300 text-xs">
            <div className="space-y-1">
              <span className="font-bold uppercase text-amber-400 print:text-amber-700 block text-[10px]">
                OUTORGANTE (COMPOSITOR TITULAR):
              </span>
              <p className="font-semibold text-white print:text-slate-900">{document.composerName}</p>
              <p className="text-slate-400 print:text-slate-600">
                CPF: <span className="print:hidden">{maskDocument(document.composerCpf)}</span><span className="hidden print:inline">{document.composerCpf}</span>
              </p>
              <p className="text-slate-400 print:text-slate-600">Cidade/UF: {document.composerCityState}</p>
            </div>

            <div className="space-y-1">
              <span className="font-bold uppercase text-amber-400 print:text-amber-700 block text-[10px]">
                OUTORGADO (INTÉRPRETE / PRODUTOR):
              </span>
              <p className="font-semibold text-white print:text-slate-900">{document.buyerName}</p>
              <p className="text-slate-400 print:text-slate-600">
                Documento: <span className="print:hidden">{maskDocument(document.buyerDocument)}</span><span className="hidden print:inline">{document.buyerDocument}</span>
              </p>
              <p className="text-slate-400 print:text-slate-600">Cidade/UF: {document.buyerCityState}</p>
            </div>
          </div>

          {/* Song Info */}
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="border-l-2 border-amber-500 pl-3 py-1 space-y-1">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">OBRA MUSICAL OBJETO DA AUTORIZAÇÃO:</span>
              <p className="text-base font-bold text-white print:text-slate-900">“{document.songTitle}”</p>
              <p className="text-slate-300 print:text-slate-700">Autoria / Compositores: {document.authors}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <span className="font-semibold text-slate-300 print:text-slate-800 block">Modalidade de Licença:</span>
                <p className="text-amber-400 print:text-amber-700 font-semibold">{document.releaseType}</p>
              </div>

              <div>
                <span className="font-semibold text-slate-300 print:text-slate-800 block">Valor Acordado:</span>
                <p className="text-white print:text-slate-900 font-bold font-mono">
                  R$ {document.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div>
              <span className="font-semibold text-slate-300 print:text-slate-800 block mb-1">Finalidade Declarada e Autorizada:</span>
              <p className="text-slate-300 print:text-slate-700 bg-slate-900 print:bg-slate-50 p-3 rounded-lg border border-slate-800 print:border-slate-200">
                {document.authorizedPurpose}
              </p>
            </div>

            {document.additionalConditions && (
              <div>
                <span className="font-semibold text-slate-300 print:text-slate-800 block mb-1">Cláusulas e Condições Especiais:</span>
                <p className="text-slate-300 print:text-slate-700 bg-slate-900 print:bg-slate-50 p-3 rounded-lg border border-slate-800 print:border-slate-200">
                  {document.additionalConditions}
                </p>
              </div>
            )}
          </div>

          {/* Signature and Digital Validation Box */}
          <div className="pt-6 border-t border-slate-800 print:border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-slate-400">Data de Emissão: <strong className="text-white print:text-slate-900">{formatDate(document.issueDate)}</strong></p>
              <p className="text-slate-500 font-mono text-[11px]">Código de Autenticidade: <strong className="text-amber-400">{document.documentCode}</strong></p>
              <p className="text-[10px] text-slate-400 print:text-slate-600">
                Consulta pública: <span className="text-amber-400 underline font-mono">{validationUrl}</span>
              </p>
            </div>

            <div className="text-center space-y-1 bg-slate-900 print:bg-slate-100 p-3.5 rounded-2xl border border-slate-800 print:border-slate-300 max-w-xs">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto" />
              <p className="font-serif italic text-amber-300 print:text-slate-900 font-semibold text-sm">
                {document.composerName}
              </p>
              <p className="text-[10px] text-slate-400 print:text-slate-600">
                {document.digitalSignature}
              </p>
            </div>
          </div>

        </div>

        {summaryCopied && (
          <div role="status" className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl flex items-center gap-2 animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Resumo com link de autenticidade copiado para a área de transferência!</span>
          </div>
        )}
        {downloadError && <div role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{downloadError}</div>}
        {downloadNotice && <div role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{downloadNotice}</div>}

        {/* Action Buttons */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition disabled:opacity-50"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Preparando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
            >
              <Phone className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 transition"
            >
              <Copy className="w-4 h-4 text-amber-400" />
              <span>{summaryCopied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onCompleteNegotiation) onCompleteNegotiation();
              onClose();
            }}
            className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{onCompleteNegotiation ? 'Concluir Negociação' : 'Fechar'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
