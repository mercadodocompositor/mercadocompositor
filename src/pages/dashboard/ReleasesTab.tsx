import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ReleaseDocument } from '../../types';
import { LiberacaoDocumentModal } from '../../components/common/LiberacaoDocumentModal';
import { 
  FileCheck, 
  Search, 
  Eye, 
  ShieldCheck, 
  FileText
} from 'lucide-react';

export const ReleasesTab: React.FC = () => {
  const { releases } = useApp();
  const navigate = useNavigate();
  const [selectedDoc, setSelectedDoc] = useState<ReleaseDocument | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'value' | 'title'>('recent');

  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const query = normalize(searchTerm);
  const filteredReleases = releases.filter(rel => [
    rel.songTitle,
    rel.buyerName,
    rel.documentCode,
    rel.authors,
    rel.authorizedPurpose,
    rel.buyerCityState,
    rel.releaseType
  ].some(value => normalize(value).includes(query))).sort((a, b) => {
    if (sortBy === 'oldest') return a.issueDate.localeCompare(b.issueDate);
    if (sortBy === 'value') return b.agreedValue - a.agreedValue;
    if (sortBy === 'title') return a.songTitle.localeCompare(b.songTitle, 'pt-BR');
    return b.issueDate.localeCompare(a.issueDate);
  });

  const totalValue = releases.reduce((total, release) => total + release.agreedValue, 0);
  const uniqueBuyers = new Set(releases.map(release => release.buyerDocument)).size;

  const formatDate = (date: string) => {
    const [year, month, day] = date.slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Liberações Emitidas
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Histórico de autorizações de gravação e exploração fonográfica
          </p>
        </div>

        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-3.5 py-1.5 rounded-full font-bold">
          {releases.length} Documentos Emitidos
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Documentos</p>
          <p className="text-2xl font-bold text-white mt-1">{releases.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Valor total registrado</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Compradores únicos</p>
          <p className="text-2xl font-bold text-white mt-1">{uniqueBuyers}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            aria-label="Buscar liberações"
            placeholder="Buscar por música, comprador, autor, finalidade ou código..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={sortBy}
          onChange={event => setSortBy(event.target.value as typeof sortBy)}
          aria-label="Ordenar liberações"
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
        >
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigas</option>
          <option value="value">Maior valor</option>
          <option value="title">Música A–Z</option>
        </select>
      </div>

      {/* Releases Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredReleases.length === 0 ? (
          <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 space-y-2">
            <FileCheck className="w-12 h-12 mx-auto stroke-1" />
            <p className="text-sm">{releases.length === 0 ? 'Nenhuma liberação foi emitida.' : 'Nenhum documento corresponde à busca.'}</p>
            <button
              type="button"
              onClick={() => releases.length === 0 ? navigate('/dashboard/solicitacoes') : setSearchTerm('')}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold"
            >
              {releases.length === 0 ? 'Ver solicitações' : 'Limpar busca'}
            </button>
          </div>
        ) : (
          filteredReleases.map(doc => (
            <div 
              key={doc.id}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      {doc.documentCode}
                    </span>
                    <h3 className="font-bold text-white text-base">“{doc.songTitle}”</h3>
                  </div>
                </div>

                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full">
                  Demonstrativo
                </span>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs space-y-1.5 text-slate-300">
                <p>Comprador / Intérprete: <strong className="text-white">{doc.buyerName}</strong></p>
                <p>Valor da Liberação: <strong className="text-amber-400">R$ {doc.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
                <p>Data de Emissão: <strong className="text-slate-200">{formatDate(doc.issueDate)}</strong></p>
                <p>Tipo: <strong className="text-slate-200">{doc.releaseType}</strong></p>
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Sem validade jurídica
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedDoc(doc)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-1.5"
                >
                  <Eye className="w-4 h-4" />
                  <span>Visualizar Documento</span>
                </button>
              </div>

            </div>
          ))
        )}
      </div>

      {/* Document Viewer Modal */}
      {selectedDoc && (
        <LiberacaoDocumentModal 
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      )}

    </div>
  );
};
