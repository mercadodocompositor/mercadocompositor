import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { validateReleaseDocument, type PublicReleaseValidation } from '../lib/database';
import { downloadReleasePdf } from '../lib/pdfGenerator';
import { captureException } from '../lib/monitoring';
import { 
  ShieldCheck, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  User, 
  Music, 
  Calendar, 
  DollarSign, 
  ArrowLeft,
  Lock,
  Download,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { APP_CONFIG } from '../config/appConfig';

export const ValidarDocumentoPage: React.FC = () => {
  const { code } = useParams<{ code?: string }>();
  const [searchParams] = useSearchParams();
  const queryCode = searchParams.get('codigo') || code || '';
  const [inputCode, setInputCode] = useState(queryCode);
  const [searchedCode, setSearchedCode] = useState(queryCode.trim().toUpperCase());
  const [matchedDocument, setMatchedDocument] = useState<PublicReleaseValidation | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!matchedDocument) return;
    try {
      setIsDownloadingPdf(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      downloadReleasePdf(matchedDocument);
    } catch (err) {
      captureException(err, { operation: 'downloadReleasePdf' });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  useEffect(() => {
    if (queryCode) {
      setInputCode(queryCode);
      const normalized = queryCode.trim().toUpperCase();
      setSearchedCode(normalized);
      setIsSearching(true);
      setSearchError(null);
      validateReleaseDocument(normalized)
        .then(setMatchedDocument)
        .catch(() => { setMatchedDocument(null); setSearchError('Não foi possível consultar o documento. Tente novamente.'); })
        .finally(() => setIsSearching(false));
    }
  }, [queryCode]);

  const hasSearched = Boolean(searchedCode);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSearching) return;
    const normalized = inputCode.trim().toUpperCase();
    setSearchedCode(normalized);
    setMatchedDocument(null);
    setSearchError(null);
    if (!normalized) {
      setSearchError('Por favor, informe o código verificador do documento (ex.: LIB-2026-12345).');
      return;
    }
    if (normalized.length > 50 || !/^[A-Z0-9_-]+$/.test(normalized)) {
      setSearchError('Código em formato inválido. Códigos de liberação contêm apenas letras, números e hífens.');
      return;
    }
    setIsSearching(true);
    try {
      setMatchedDocument(await validateReleaseDocument(normalized));
    } catch {
      setSearchError('Não foi possível consultar o documento. Tente novamente.');
    } finally {
      setIsSearching(false);
    }
  };

  const formatDate = (date: string) => {
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

  const maskDocument = (last4: string) => `••••${last4.replace(/\D/g, '').slice(-4)}`;

  return (
    <div className="min-h-screen bg-[#060B18] text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <Navbar />

      <main className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Validador Oficial de Autenticidade</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Verificação de Liberação Fonográfica
            </h1>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Consulte a autenticidade e validade jurídica de termos de autorização e liberação de gravação emitidos através do {APP_CONFIG.name}.
            </p>
          </div>

          {/* Search Box */}
          <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-2xl backdrop-blur-sm max-w-2xl mx-auto">
            <form onSubmit={handleSearch}>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 text-slate-500 absolute left-4 top-3.5" />
                  <input
                    type="text"
                    value={inputCode}
                    onChange={e => {
                      setInputCode(e.target.value);
                      if (searchError) setSearchError(null);
                    }}
                    placeholder="Ex: LIB-2026-12345"
                    aria-label="Código do documento para verificação"
                    aria-invalid={Boolean(searchError && (!searchedCode || !inputCode.trim()))}
                    aria-describedby={searchError && (!searchedCode || !inputCode.trim()) ? "validation-input-error" : undefined}
                    className={`w-full bg-slate-950 border rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white font-mono uppercase placeholder:normal-case placeholder:font-sans focus:outline-none transition ${
                      searchError && (!searchedCode || !inputCode.trim())
                        ? 'border-red-500/80 focus:border-red-500 ring-1 ring-red-500/30'
                        : 'border-slate-700 focus:border-amber-500'
                    }`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition shrink-0"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>{isSearching ? 'Verificando...' : 'Verificar Código'}</span>
                </button>
              </div>
              {searchError && (!searchedCode || !inputCode.trim()) && (
                <div id="validation-input-error" role="alert" className="mt-3 flex items-center gap-2 text-xs font-medium text-red-400 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{searchError}</span>
                </div>
              )}
            </form>
          </div>

          {/* Search Results */}
          {hasSearched && (
            <div className="max-w-2xl mx-auto animate-fadeIn">
              {isSearching ? (
                <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-8 text-center shadow-2xl"><p className="text-sm text-amber-300">Consultando documento...</p></div>
              ) : searchError ? (
                <div role="alert" className="bg-slate-900 border border-red-500/30 rounded-3xl p-8 text-center shadow-2xl">
                  <AlertCircle className="w-8 h-8 mx-auto text-red-400" />
                  <p className="mt-3 text-sm text-red-200">{searchError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (searchedCode) {
                        setIsSearching(true);
                        setSearchError(null);
                        validateReleaseDocument(searchedCode)
                          .then(setMatchedDocument)
                          .catch(() => { setMatchedDocument(null); setSearchError('Não foi possível consultar o documento. Tente novamente.'); })
                          .finally(() => setIsSearching(false));
                      }
                    }}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-white border border-slate-700 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Tentar Novamente
                  </button>
                </div>
              ) : matchedDocument ? (
                <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                  
                  {/* Verified Badge */}
                  <div className="flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-emerald-400 tracking-wider block">
                        Documento Oficial Válido & Autêntico
                      </span>
                      <h3 className="text-lg font-bold text-white leading-tight">
                        Código: {matchedDocument.documentCode}
                      </h3>
                    </div>
                  </div>

                  {/* Details Card */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
                    
                    {/* Song */}
                    <div className="flex items-start gap-3 border-b border-slate-800/80 pb-3">
                      <Music className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Obra Musical</span>
                        <strong className="text-base text-white">“{matchedDocument.songTitle}”</strong>
                        <p className="text-slate-400 mt-0.5">Autoria: {matchedDocument.authors}</p>
                        {matchedDocument.iswc && <p className="text-slate-400">ISWC: {matchedDocument.iswc}</p>}
                      </div>
                    </div>

                    {/* Parties */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-800/80 pb-3">
                      <div className="space-y-1">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Compositor (Outorgante)</span>
                        <p className="text-white font-bold">{matchedDocument.composerName}</p>
                         <p className="text-slate-400">CPF: {maskDocument(matchedDocument.composerDocumentLast4)}</p>
                        <p className="text-slate-400">{matchedDocument.composerCityState}</p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Outorgado (Intérprete / Produtor)</span>
                        <p className="text-white font-bold">{matchedDocument.buyerName}</p>
                        {matchedDocument.interpreterName && matchedDocument.interpreterName !== matchedDocument.buyerName && (
                          <p className="text-slate-300">Intérprete: {matchedDocument.interpreterName}</p>
                        )}
                         <p className="text-slate-400">Doc: {maskDocument(matchedDocument.buyerDocumentLast4)}</p>
                        <p className="text-slate-400">{matchedDocument.buyerCityState}</p>
                      </div>
                    </div>

                    {/* Terms */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Tipo de Autorização</span>
                        <p className="text-amber-400 font-semibold">{matchedDocument.releaseType}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Data de Emissão</span>
                        <p className="text-white font-medium">{formatDate(matchedDocument.issueDate)}</p>
                      </div>
                    </div>

                    {/* Purpose */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold mb-1">Finalidade Declarada</span>
                      <p className="text-slate-300 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        {matchedDocument.authorizedPurpose}
                      </p>
                    </div>

                    {/* Signature notice */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-slate-400 text-[11px]">
                      <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{matchedDocument.digitalSignature}</span>
                    </div>

                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800/80">
                    <p className="text-[11px] text-slate-400 text-center sm:text-left">
                      Baixe o termo original registrado em formato PDF com certificado de autenticidade.
                    </p>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={isDownloadingPdf}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition shrink-0 disabled:opacity-50"
                    >
                      {isDownloadingPdf ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Gerando PDF Oficial...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Baixar Termo Oficial em PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              ) : (
                <div className="bg-slate-900 border border-red-500/30 rounded-3xl p-8 text-center shadow-2xl space-y-3">
                  <div className="w-14 h-14 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Documento Não Localizado</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Não encontramos nenhuma autorização registrada com o código <strong className="text-amber-400 font-mono">“{searchedCode}”</strong>. Verifique se o código foi digitado corretamente.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Institutional Information */}
          <div className="max-w-2xl mx-auto bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-3 text-xs text-slate-400">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Sobre a Validação Eletrônica</span>
            </h4>
            <p className="leading-relaxed">
              Todos os termos de liberação e autorização fonográfica gerados pelo {APP_CONFIG.name} possuem assinatura digital eletrônica e código único indexado. A autenticidade deste documento comprova a anuência direta do compositor cadastrado para a fixação e registro fonográfico da obra.
            </p>
          </div>

          <div className="text-center pt-2">
            <Link to="/" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-amber-400 transition font-medium">
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para a página inicial</span>
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
};
