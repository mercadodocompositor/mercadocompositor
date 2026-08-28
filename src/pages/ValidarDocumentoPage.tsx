import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { useApp } from '../context/AppContext';
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
  Lock
} from 'lucide-react';
import { APP_CONFIG } from '../config/appConfig';

export const ValidarDocumentoPage: React.FC = () => {
  const { code } = useParams<{ code?: string }>();
  const [searchParams] = useSearchParams();
  const { releases } = useApp();

  const queryCode = searchParams.get('codigo') || code || '';
  const [inputCode, setInputCode] = useState(queryCode);
  const [searchedCode, setSearchedCode] = useState(queryCode.trim().toUpperCase());

  useEffect(() => {
    if (queryCode) {
      setInputCode(queryCode);
      setSearchedCode(queryCode.trim().toUpperCase());
    }
  }, [queryCode]);

  const matchedDocument = searchedCode
    ? releases.find(
        doc => doc.documentCode.toUpperCase() === searchedCode ||
               doc.id.toUpperCase() === searchedCode ||
               doc.requestId.toUpperCase() === searchedCode
      )
    : null;

  const hasSearched = Boolean(searchedCode);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchedCode(inputCode.trim().toUpperCase());
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
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-slate-500 absolute left-4 top-3.5" />
                <input
                  type="text"
                  value={inputCode}
                  onChange={e => setInputCode(e.target.value)}
                  placeholder="Ex: LIB-2026-12345"
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white font-mono uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:border-amber-500 transition"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>Verificar Código</span>
              </button>
            </form>
          </div>

          {/* Search Results */}
          {hasSearched && (
            <div className="max-w-2xl mx-auto animate-fadeIn">
              {matchedDocument ? (
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
                      </div>
                    </div>

                    {/* Parties */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-800/80 pb-3">
                      <div className="space-y-1">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Compositor (Outorgante)</span>
                        <p className="text-white font-bold">{matchedDocument.composerName}</p>
                        <p className="text-slate-400">CPF: {maskDocument(matchedDocument.composerCpf)}</p>
                        <p className="text-slate-400">{matchedDocument.composerCityState}</p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Intérprete (Outorgado)</span>
                        <p className="text-white font-bold">{matchedDocument.buyerName}</p>
                        <p className="text-slate-400">Doc: {maskDocument(matchedDocument.buyerDocument)}</p>
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
