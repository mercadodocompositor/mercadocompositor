import React, { useEffect, useState } from 'react';
import { ReleaseDocument } from '../../types';
import { X, FileCheck, Copy, CheckCircle, ShieldCheck, Printer } from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';

interface LiberacaoDocumentModalProps {
  document: ReleaseDocument;
  onClose: () => void;
  onCompleteNegotiation?: () => void;
}

export const LiberacaoDocumentModal: React.FC<LiberacaoDocumentModalProps> = ({
  document,
  onClose,
  onCompleteNegotiation
}) => {
  const [summaryCopied, setSummaryCopied] = useState(false);

  const handleCopySummary = async () => {
    const summary = [
      `${APP_CONFIG.name} — Documento eletrônico`,
      `Código: ${document.documentCode}`,
      `Obra: ${document.songTitle}`,
      `Compositor: ${document.composerName}`,
      `Intérprete: ${document.buyerName}`,
      `Valor: R$ ${document.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `Tipo: ${document.releaseType}`,
      `Emissão: ${formatDate(document.issueDate)}`,
      `Validação de Autenticidade: ${window.location.origin}/validar-documento?codigo=${document.documentCode}`,
      'Documento emitido eletronicamente pela plataforma.'
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 3000);
    } catch {
      setSummaryCopied(false);
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

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="release-print-root fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto print:p-0 print:static print:bg-white">
      <div role="dialog" aria-modal="true" aria-labelledby="release-document-title" className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative my-8 text-slate-100 print:border-none print:shadow-none print:bg-white print:text-slate-900 print:my-0 print:max-w-none">
        
        {/* Header Actions (Hidden when printing) */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="release-document-title" className="font-bold text-lg text-white">Documento de Liberação</h3>
              <p className="text-xs text-slate-400">Código do documento: {document.documentCode}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar documento"
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Demonstrative Banner Notice required by Section 12 */}
        <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300 print:bg-amber-50 print:border-amber-400 print:text-amber-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold uppercase tracking-wider">
              Documento emitido eletronicamente
            </span>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Apenas para fins de prototipagem e simulação
          </span>
        </div>

        {/* Printable Document Box */}
        <div className="bg-slate-950 border border-slate-800 p-8 rounded-2xl shadow-inner space-y-6 text-slate-200 print:bg-white print:text-slate-900 print:border-none print:p-0">
          
          {/* Header Document */}
          <div className="text-center border-b border-slate-800 print:border-slate-300 pb-6 space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-amber-400 font-bold print:text-amber-600">
              {APP_CONFIG.name} — DOCUMENTO DEMONSTRATIVO
            </p>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white print:text-black tracking-tight uppercase">
              Termo de Liberação e Autorização de Gravação
            </h2>
            <p className="text-xs text-slate-400 print:text-slate-600">
              Documento de Autorização Prévia para Fixação e Exploração Fonográfica
            </p>
          </div>

          {/* Parties Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-900/60 print:bg-slate-100 p-4 rounded-xl border border-slate-800/80 print:border-slate-300 text-xs">
            <div className="space-y-1">
              <span className="font-bold uppercase text-amber-400 print:text-amber-700 block text-[10px]">
                OUTORGANTE (COMPOSITOR):
              </span>
              <p className="font-semibold text-white print:text-slate-900">{document.composerName}</p>
              <p className="text-slate-400 print:text-slate-600">
                CPF: <span className="print:hidden">{maskDocument(document.composerCpf)}</span><span className="hidden print:inline">{document.composerCpf}</span>
              </p>
              <p className="text-slate-400 print:text-slate-600">Cidade: {document.composerCityState}</p>
            </div>

            <div className="space-y-1">
              <span className="font-bold uppercase text-amber-400 print:text-amber-700 block text-[10px]">
                OUTORGADO (COMPRADOR / INTÉRPRETE):
              </span>
              <p className="font-semibold text-white print:text-slate-900">{document.buyerName}</p>
              <p className="text-slate-400 print:text-slate-600">
                Documento: <span className="print:hidden">{maskDocument(document.buyerDocument)}</span><span className="hidden print:inline">{document.buyerDocument}</span>
              </p>
              <p className="text-slate-400 print:text-slate-600">Cidade: {document.buyerCityState}</p>
            </div>
          </div>

          {/* Song Info */}
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="border-l-2 border-amber-500 pl-3 py-1 space-y-1">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">OBRA MUSICAL LIBERADA:</span>
              <p className="text-base font-bold text-white print:text-slate-900">“{document.songTitle}”</p>
              <p className="text-slate-300 print:text-slate-700">Autoria: {document.authors}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <span className="font-semibold text-slate-300 print:text-slate-800 block">Tipo de Liberação:</span>
                <p className="text-slate-400 print:text-slate-600">{document.releaseType}</p>
              </div>

              <div>
                <span className="font-semibold text-slate-300 print:text-slate-800 block">Valor Acordado:</span>
                <p className="text-amber-400 print:text-amber-700 font-bold">
                  R$ {document.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div>
              <span className="font-semibold text-slate-300 print:text-slate-800 block mb-1">Finalidade Autorizada:</span>
              <p className="text-slate-400 print:text-slate-600 bg-slate-900 print:bg-slate-50 p-3 rounded-lg border border-slate-800 print:border-slate-200">
                {document.authorizedPurpose}
              </p>
            </div>

            {document.additionalConditions && (
              <div>
                <span className="font-semibold text-slate-300 print:text-slate-800 block mb-1">Condições Adicionais:</span>
                <p className="text-slate-400 print:text-slate-600 bg-slate-900 print:bg-slate-50 p-3 rounded-lg border border-slate-800 print:border-slate-200">
                  {document.additionalConditions}
                </p>
              </div>
            )}
          </div>

          {/* Signature Box */}
          <div className="pt-6 border-t border-slate-800 print:border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="space-y-1 text-center sm:text-left">
              <p className="text-slate-400">Data da Emissão: <strong className="text-white print:text-slate-900">{formatDate(document.issueDate)}</strong></p>
              <p className="text-slate-500 font-mono text-[10px]">Código: <strong>{document.documentCode}</strong></p>
              <p className="text-[10px] text-amber-400/90 print:text-slate-600">
                Validar em: <a href={`/validar-documento?codigo=${document.documentCode}`} target="_blank" rel="noreferrer" className="underline hover:text-amber-300">mercadodocompositor.com.br/validar-documento</a>
              </p>
            </div>

            <div className="text-center space-y-1 bg-slate-900 print:bg-slate-100 p-3 rounded-xl border border-slate-800 print:border-slate-300 max-w-xs">
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
            <span>Resumo do documento copiado.</span>
          </div>
        )}

        {/* Action Buttons required by Section 12 */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Imprimir ou salvar como PDF</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs flex items-center gap-1.5 transition"
            >
              <Copy className="w-4 h-4 text-amber-400" />
              <span>{summaryCopied ? 'Resumo copiado' : 'Copiar resumo'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onCompleteNegotiation) onCompleteNegotiation();
              onClose();
            }}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{onCompleteNegotiation ? 'Concluir Negociação' : 'Fechar Documento'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
