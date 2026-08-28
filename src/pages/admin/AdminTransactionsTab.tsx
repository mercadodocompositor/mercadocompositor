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
  AlertCircle,
  ExternalLink
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
        return <span className="bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Aguardando Pagamento</span>;
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

  // Export CSV
  const handleExportCsv = () => {
    if (filteredRequests.length === 0) return;

    const headers = [
      'ID',
      'Obra_Musical',
      'Interprete_Comprador',
      'Documento',
      'Email',
      'WhatsApp',
      'Status',
      'Valor_Acordado_BRL',
      'Finalidade',
      'Data_Proposta'
    ];

    const rows = filteredRequests.map(r => [
      `"${r.id}"`,
      `"${r.songTitle.replace(/"/g, '""')}"`,
      `"${r.buyerName.replace(/"/g, '""')}"`,
      `"${r.cpfCnpj}"`,
      `"${r.buyerEmail}"`,
      `"${r.buyerWhatsapp}"`,
      r.status,
      r.agreedValue ? r.agreedValue.toFixed(2) : '0.00',
      `"${r.purpose.replace(/"/g, '""')}"`,
      r.createdAt
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_transacoes_admin_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-amber-400" />
            <span>Auditoria de Propostas & Termos de Liberação</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Supervisione negociações entre intérpretes e compositores, quitações de valores e certificados digitais emitidos.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar CSV</span>
          </button>

          <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs">
            <span className="text-slate-400">Total Transacionado:</span>
            <span className="font-bold text-emerald-400 ml-2 font-mono">
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

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white border border-slate-700 font-bold'
                : 'text-slate-400 hover:text-white bg-slate-950'
            }`}
          >
            Todas ({requests.length})
          </button>
          <button
            onClick={() => setStatusFilter('liberacao_enviada')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'liberacao_enviada'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                : 'text-slate-400 hover:text-emerald-400 bg-slate-950'
            }`}
          >
            Liberadas ({requests.filter(r => r.status === 'liberacao_enviada').length})
          </button>
          <button
            onClick={() => setStatusFilter('pagamento_confirmado')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'pagamento_confirmado'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                : 'text-slate-400 hover:text-blue-400 bg-slate-950'
            }`}
          >
            Pagas ({requests.filter(r => r.status === 'pagamento_confirmado').length})
          </button>
          <button
            onClick={() => setStatusFilter('em_negociacao')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'em_negociacao'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-slate-400 hover:text-amber-400 bg-slate-950'
            }`}
          >
            Negociação ({requests.filter(r => r.status === 'em_negociacao').length})
          </button>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-4">Obra / Proposta</th>
                <th className="p-4">Intérprete / Produtor</th>
                <th className="p-4">Finalidade</th>
                <th className="p-4">Valor Acordado</th>
                <th className="p-4">Status</th>
                <th className="p-4">Data</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredRequests.map(req => (
                <tr key={req.id} className="hover:bg-slate-800/40 transition">
                  <td className="p-4">
                    <strong className="text-white text-sm block">“{req.songTitle}”</strong>
                    <span className="text-[11px] text-slate-400">ID: {req.id.slice(0, 8)}...</span>
                  </td>

                  <td className="p-4 space-y-0.5">
                    <strong className="text-slate-200 block">{req.buyerName}</strong>
                    <span className="text-[11px] text-slate-400 block">{req.buyerWhatsapp}</span>
                  </td>

                  <td className="p-4 max-w-xs truncate text-slate-300">
                    {req.purpose}
                  </td>

                  <td className="p-4 font-mono font-bold text-emerald-400">
                    {req.agreedValue 
                      ? `R$ ${req.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                      : 'Em aberto'}
                  </td>

                  <td className="p-4">
                    {getStatusBadge(req.status)}
                  </td>

                  <td className="p-4 text-slate-400 font-mono text-[11px]">
                    {req.createdAt.split('T')[0] || req.createdAt}
                  </td>

                  <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                    {req.releaseId && (
                      <button
                        onClick={() => handleOpenReleaseModal(req.releaseId!)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold hover:bg-emerald-500/30 transition"
                        title="Ver Termo Oficial Emitido"
                      >
                        Ver Termo
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedRequest(req)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition"
                      title="Ver detalhes da solicitação"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* REQUEST DETAILS MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-5 animate-fadeIn">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-white text-lg">Proposta de Gravação</h3>
                <p className="text-xs text-slate-400">Obra: “{selectedRequest.songTitle}”</p>
              </div>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs space-y-2 text-slate-300">
              <p>Intérprete: <strong className="text-white">{selectedRequest.buyerName}</strong></p>
              <p>Documento: <span className="font-mono text-white">{selectedRequest.cpfCnpj}</span></p>
              <p>E-mail: <span className="text-white">{selectedRequest.buyerEmail}</span></p>
              <p>WhatsApp: <span className="text-white">{selectedRequest.buyerWhatsapp}</span></p>
              <p>Cidade / UF: <span className="text-white">{selectedRequest.buyerCityState}</span></p>
              <p>Finalidade: <span className="text-amber-300">{selectedRequest.purpose}</span></p>
              {selectedRequest.message && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-500 block mb-1">Mensagem enviada:</span>
                  <p className="italic bg-slate-900 p-2.5 rounded-xl border border-slate-800">{selectedRequest.message}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto animate-fadeIn">
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

              <div className="grid grid-cols-2 gap-4 text-xs font-sans bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="font-bold text-slate-700 block uppercase text-[10px]">Outorgante (Compositor):</span>
                  <p className="font-bold text-slate-900">{selectedRelease.composerName}</p>
                  <p className="text-slate-600">CPF: {selectedRelease.composerCpf}</p>
                  <p className="text-slate-600">{selectedRelease.composerCityState}</p>
                </div>

                <div>
                  <span className="font-bold text-slate-700 block uppercase text-[10px]">Outorgado (Intérprete):</span>
                  <p className="font-bold text-slate-900">{selectedRelease.buyerName}</p>
                  <p className="text-slate-600">Documento: {selectedRelease.buyerDocument}</p>
                  <p className="text-slate-600">{selectedRelease.buyerCityState}</p>
                </div>
              </div>

              <div className="space-y-3 text-xs leading-relaxed font-sans">
                <p>
                  <strong>Obra Musical:</strong> “{selectedRelease.songTitle}” (Autores: {selectedRelease.authors})
                </p>
                <p>
                  <strong>Tipo de Autorização:</strong> {selectedRelease.releaseType}
                </p>
                <p>
                  <strong>Valor Total Acordado e Quitado:</strong> R$ {selectedRelease.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p>
                  <strong>Finalidade Autorizada:</strong> {selectedRelease.authorizedPurpose}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs font-sans text-slate-600">
                <span>Assinatura Digital Registrada: {selectedRelease.digitalSignature}</span>
                <span className="text-emerald-700 font-bold">✓ Válido & Indexado</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href={`/validar-documento?codigo=${selectedRelease.documentCode}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5"
              >
                <span>Validar na Página Pública</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                onClick={() => setSelectedRelease(null)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
              >
                Fechar Auditoria
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
