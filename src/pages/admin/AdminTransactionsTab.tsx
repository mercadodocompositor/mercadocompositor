import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { InterestRequest, ReleaseDocument, RequestStatus } from '../../types';
import { 
  FileCheck2, 
  Search, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  FileText, 
  Eye, 
  ShieldCheck, 
  Printer, 
  Download, 
  X,
  Building2,
  Calendar,
  AlertCircle
} from 'lucide-react';

export const AdminTransactionsTab: React.FC = () => {
  const { requests, releases, updateRequestStatus } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [selectedRelease, setSelectedRelease] = useState<ReleaseDocument | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<InterestRequest | null>(null);

  const filteredRequests = requests.filter(req => {
    const matchesSearch = 
      req.songTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.buyerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.buyerStageName && req.buyerStageName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: RequestStatus) => {
    switch (status) {
      case 'liberacao_enviada':
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Liberação Emitida</span>;
      case 'pagamento_confirmado':
        return <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Pago / Pronto</span>;
      case 'em_negociacao':
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Em Negociação</span>;
      case 'pagamento_pendente':
        return <span className="bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Aguardando Pix</span>;
      case 'nova':
        return <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Nova Proposta</span>;
      default:
        return <span className="bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase">Arquivada</span>;
    }
  };

  const handleOpenReleaseModal = (releaseId: string) => {
    const rel = releases.find(r => r.id === releaseId);
    if (rel) {
      setSelectedRelease(rel);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-amber-400" />
            <span>Auditoria de Propostas & Termos de Liberação</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Supervisione negociações entre intérpretes e compositores, recibos de pagamento e certificados digitais emitidos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs">
            <span className="text-slate-400">Total Transacionado:</span>
            <span className="font-bold text-emerald-400 ml-2">
              R$ {requests.reduce((acc, r) => acc + (r.agreedValue || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por música, intérprete, produtor ou e-mail..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-500"
        >
          <option value="all">Todos os Status</option>
          <option value="nova">Novas Propostas</option>
          <option value="em_negociacao">Em Negociação</option>
          <option value="pagamento_confirmado">Pagamento Confirmado</option>
          <option value="liberacao_enviada">Liberação Emitida</option>
        </select>
      </div>

      {/* Requests Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-4 px-6">Música & Intérprete</th>
                <th className="py-4 px-6">Finalidade / Mensagem</th>
                <th className="py-4 px-6">Valor Acordado</th>
                <th className="py-4 px-6">Data & Status</th>
                <th className="py-4 px-6 text-right">Ações & Termos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs">
              {filteredRequests.map(req => (
                <tr key={req.id} className="hover:bg-slate-800/40 transition">
                  {/* Song & Buyer */}
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      {req.songCover && (
                        <img 
                          src={req.songCover} 
                          alt={req.songTitle} 
                          className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <span className="font-bold text-white text-sm block truncate">{req.songTitle}</span>
                        <span className="text-amber-400 font-semibold text-xs block truncate">{req.buyerStageName || req.buyerName}</span>
                        <span className="text-[10px] text-slate-400">{req.buyerCityState} • Doc: {req.cpfCnpj}</span>
                      </div>
                    </div>
                  </td>

                  {/* Purpose & Message */}
                  <td className="py-4 px-6">
                    <div className="max-w-xs space-y-1">
                      <p className="text-slate-300 font-medium truncate">{req.purpose}</p>
                      <p className="text-[11px] text-slate-400 truncate">{req.message}</p>
                    </div>
                  </td>

                  {/* Value */}
                  <td className="py-4 px-6">
                    <div>
                      {req.agreedValue ? (
                        <span className="text-emerald-400 font-bold text-sm block">
                          R$ {req.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">A combinar</span>
                      )}
                      {req.paymentReceivedAt && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Pix Liquidado
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Date & Status */}
                  <td className="py-4 px-6">
                    <div className="space-y-1.5">
                      {getStatusBadge(req.status)}
                      <p className="text-[10px] text-slate-400">{req.createdAt}</p>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                        title="Ver Proposta Completa"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {req.releaseId && (
                        <button
                          onClick={() => handleOpenReleaseModal(req.releaseId!)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition"
                          title="Auditar Termo de Liberação Oficial"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Ver Termo</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* REQUEST DETAIL MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Proposta Comercial</span>
                <h3 className="text-xl font-bold text-white">{selectedRequest.songTitle}</h3>
                <p className="text-xs text-slate-400">Solicitado por {selectedRequest.buyerName} em {selectedRequest.createdAt}</p>
              </div>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-slate-400 font-bold block">Mensagem do Solicitante:</span>
                <p className="text-slate-200 leading-relaxed italic">"{selectedRequest.message}"</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">Intérprete / Artista</span>
                  <span className="text-white font-semibold">{selectedRequest.buyerStageName || selectedRequest.buyerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Documento (CPF/CNPJ)</span>
                  <span className="text-white font-mono">{selectedRequest.cpfCnpj}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">E-mail</span>
                  <span className="text-white">{selectedRequest.buyerEmail}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">WhatsApp</span>
                  <span className="text-white">{selectedRequest.buyerWhatsapp}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT RELEASE TERM MODAL */}
      {selectedRelease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Documento Oficial Auditado</span>
                  <h3 className="text-lg font-bold text-white">{selectedRelease.documentCode}</h3>
                  <p className="text-xs text-slate-400">Emitido em {selectedRelease.issueDate}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRelease(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Paper Preview */}
            <div className="bg-white text-slate-900 p-6 md:p-8 rounded-2xl shadow-2xl space-y-6 font-serif border border-slate-200">
              <div className="text-center border-b border-slate-200 pb-4">
                <h2 className="text-base md:text-lg font-bold tracking-tight uppercase">
                  Termo de Autorização e Liberação Fonográfica
                </h2>
                <p className="text-xs text-slate-500 font-sans mt-1">
                  Código de Autenticidade Digital: <span className="font-mono font-bold text-slate-800">{selectedRelease.documentCode}</span>
                </p>
              </div>

              <div className="text-xs leading-relaxed space-y-3 font-sans">
                <p>
                  Pelo presente instrumento particular, o(a) <strong>CEDENTE / AUTOR(A)</strong>,{' '}
                  <strong>{selectedRelease.composerName}</strong>, portador(a) do CPF nº {selectedRelease.composerCpf}, residente em {selectedRelease.composerCityState}, autoriza o(a) <strong>CESSIONÁRIO(A) / INTÉRPRETE</strong>,{' '}
                  <strong>{selectedRelease.buyerName}</strong>, inscrito(a) no documento {selectedRelease.buyerDocument}, a gravar e explorar comercialmente a obra musical intitulada:
                </p>

                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-center space-y-1">
                  <span className="text-xs font-bold text-amber-900 uppercase">Obra Musical</span>
                  <h4 className="text-base font-bold text-slate-900">"{selectedRelease.songTitle}"</h4>
                  <p className="text-xs text-slate-600">Autoria Registrada: {selectedRelease.authors}</p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <p><strong>Condições Acordadas:</strong> {selectedRelease.releaseType}</p>
                  <p><strong>Finalidade Autorizada:</strong> {selectedRelease.authorizedPurpose}</p>
                  <p><strong>Valor Negociado:</strong> R$ {selectedRelease.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p><strong>Cláusula de Créditos:</strong> {selectedRelease.additionalConditions}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-sans text-slate-500">
                <div>
                  <span className="font-bold text-slate-700 block">Assinatura Digital Verificada</span>
                  <span className="font-mono text-[10px]">{selectedRelease.digitalSignature}</span>
                </div>
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase">
                  Hash Integridade Válido
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir / Salvar PDF</span>
              </button>
              <button
                onClick={() => setSelectedRelease(null)}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
              >
                Concluir Auditoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
