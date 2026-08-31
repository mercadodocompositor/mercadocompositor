import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { InterestRequest, ReleaseDocument, RequestStatus } from '../../types';
import { useAdminToast } from '../../components/admin/AdminToast';
import { AdminDrawer } from '../../components/admin/AdminDrawer';
import { AdminPagination } from '../../components/admin/AdminPagination';
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
  ExternalLink, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Copy, 
  Check 
} from 'lucide-react';

type SortField = 'songTitle' | 'buyerName' | 'agreedValue' | 'status' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export const AdminTransactionsTab: React.FC = () => {
  const { requests, releases, updateRequestStatus } = useApp();
  const toast = useAdminToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [selectedRelease, setSelectedRelease] = useState<ReleaseDocument | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<InterestRequest | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Sorting & Pagination
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

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
    } else {
      toast.warning('Documento não localizado', 'Não foi encontrado o registro do termo correspondente.');
    }
  };

  const handleCopyDocumentCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success('Código Copiado!', `Chave de autenticidade ${code} copiada.`);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Filter and Sort logic
  const filteredAndSortedRequests = useMemo(() => {
    const result = requests.filter(req => {
      const matchesSearch = 
        req.songTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.buyerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (req.buyerStageName && req.buyerStageName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || req.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal === undefined) aVal = 0 as any;
      if (bVal === undefined) bVal = 0 as any;

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [requests, searchTerm, statusFilter, sortField, sortOrder]);

  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedRequests.slice(start, start + pageSize);
  }, [filteredAndSortedRequests, currentPage, pageSize]);

  // Export CSV
  const handleExportCsv = () => {
    if (filteredAndSortedRequests.length === 0) {
      toast.warning('Nenhum dado', 'Não há transações para exportar com os filtros atuais.');
      return;
    }

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

    const rows = filteredAndSortedRequests.map(r => [
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
    toast.success('Relatório CSV Gerado', 'O download do histórico de propostas foi iniciado.');
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 inline ml-1 transition" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-amber-400 inline ml-1" />
      : <ArrowDown className="w-3 h-3 text-amber-400 inline ml-1" />;
  };

  const totalVolume = requests.reduce((acc, r) => acc + (r.agreedValue || 0), 0);

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
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-2 transition shadow-sm"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar CSV</span>
          </button>

          <div className="bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl text-xs shadow-sm">
            <span className="text-slate-400">Total Transacionado:</span>
            <span className="font-bold text-emerald-400 ml-2 font-mono">
              R$ {totalVolume.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-lg">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por música, intérprete, produtor ou e-mail..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white border border-slate-700 font-bold'
                : 'text-slate-400 hover:text-white bg-slate-950'
            }`}
          >
            Todas ({requests.length})
          </button>
          <button
            onClick={() => { setStatusFilter('liberacao_enviada'); setCurrentPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'liberacao_enviada'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                : 'text-slate-400 hover:text-emerald-400 bg-slate-950'
            }`}
          >
            Liberadas ({requests.filter(r => r.status === 'liberacao_enviada').length})
          </button>
          <button
            onClick={() => { setStatusFilter('pagamento_confirmado'); setCurrentPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'pagamento_confirmado'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                : 'text-slate-400 hover:text-blue-400 bg-slate-950'
            }`}
          >
            Pagas ({requests.filter(r => r.status === 'pagamento_confirmado').length})
          </button>
          <button
            onClick={() => { setStatusFilter('em_negociacao'); setCurrentPage(1); }}
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

      {/* Requests DataTable */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th 
                  onClick={() => handleSort('songTitle')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Obra / Proposta</span>
                  {renderSortIcon('songTitle')}
                </th>
                <th 
                  onClick={() => handleSort('buyerName')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Intérprete / Produtor</span>
                  {renderSortIcon('buyerName')}
                </th>
                <th className="p-4">Finalidade</th>
                <th 
                  onClick={() => handleSort('agreedValue')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Valor Acordado</span>
                  {renderSortIcon('agreedValue')}
                </th>
                <th 
                  onClick={() => handleSort('status')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Status</span>
                  {renderSortIcon('status')}
                </th>
                <th 
                  onClick={() => handleSort('createdAt')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Data</span>
                  {renderSortIcon('createdAt')}
                </th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {paginatedRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhuma proposta encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedRequests.map(req => (
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
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold hover:bg-emerald-500/30 transition cursor-pointer"
                          title="Ver Termo Oficial Emitido"
                        >
                          Ver Termo
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                        title="Ver detalhes da solicitação (Drawer)"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination */}
        <AdminPagination
          currentPage={currentPage}
          totalItems={filteredAndSortedRequests.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
        />
      </div>

      {/* REQUEST DETAILS SIDE DRAWER */}
      <AdminDrawer
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title="Detalhes da Proposta"
        subtitle={selectedRequest ? `Obra: “${selectedRequest.songTitle}”` : ''}
        icon={<FileCheck2 className="w-5 h-5" />}
        footer={
          selectedRequest && (
            <div className="flex items-center justify-between gap-3">
              {selectedRequest.releaseId && (
                <button
                  onClick={() => {
                    const rId = selectedRequest.releaseId;
                    setSelectedRequest(null);
                    if (rId) handleOpenReleaseModal(rId);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Ver Termo Emitido</span>
                </button>
              )}

              <button
                onClick={() => setSelectedRequest(null)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition ml-auto"
              >
                Fechar
              </button>
            </div>
          )
        }
      >
        {selectedRequest && (
          <div className="space-y-6 text-xs">
            {/* Song & Status Header */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Obra Musical Negociada</span>
              <h4 className="text-base font-bold text-white">“{selectedRequest.songTitle}”</h4>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400">Status Atual:</span>
                {getStatusBadge(selectedRequest.status)}
              </div>
            </div>

            {/* Buyer Contact Data */}
            <div className="space-y-3">
              <h5 className="font-bold text-white uppercase tracking-wider text-slate-400 text-[11px]">
                Dados do Solicitante / Intérprete
              </h5>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Nome:</span>
                  <strong className="text-white">{selectedRequest.buyerName}</strong>
                </div>
                {selectedRequest.buyerStageName && (
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Nome Artístico:</span>
                    <strong className="text-amber-400">{selectedRequest.buyerStageName}</strong>
                  </div>
                )}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">CPF / CNPJ:</span>
                  <span className="text-white font-mono">{selectedRequest.cpfCnpj}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">E-mail:</span>
                  <span className="text-white">{selectedRequest.buyerEmail}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">WhatsApp:</span>
                  <span className="text-white font-mono">{selectedRequest.buyerWhatsapp}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Cidade / Estado:</span>
                  <span className="text-white">{selectedRequest.buyerCityState}</span>
                </div>
              </div>
            </div>

            {/* Terms & Financial Proposal */}
            <div className="space-y-3">
              <h5 className="font-bold text-white uppercase tracking-wider text-slate-400 text-[11px]">
                Finalidade & Valores
              </h5>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Finalidade:</span>
                  <span className="text-amber-300 font-semibold">{selectedRequest.purpose}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Valor Acordado:</span>
                  <strong className="text-emerald-400 font-mono text-sm">
                    {selectedRequest.agreedValue 
                      ? `R$ ${selectedRequest.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                      : 'Sob Negociação'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Message */}
            {selectedRequest.message && (
              <div className="space-y-2">
                <span className="text-slate-400 uppercase font-bold text-[11px]">Mensagem enviada pelo interessado:</span>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-slate-300 leading-relaxed italic">
                  “{selectedRequest.message}”
                </div>
              </div>
            )}
          </div>
        )}
      </AdminDrawer>

      {/* AUDIT RELEASE TERM DRAWER / MODAL */}
      <AdminDrawer
        isOpen={!!selectedRelease}
        onClose={() => setSelectedRelease(null)}
        title="Certificado Oficial de Liberação"
        subtitle={selectedRelease?.documentCode}
        maxWidth="2xl"
        icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
        footer={
          selectedRelease && (
            <div className="flex items-center justify-between gap-3">
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
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
              >
                Fechar Auditoria
              </button>
            </div>
          )
        }
      >
        {selectedRelease && (
          <div className="space-y-6 text-xs">
            {/* Header info */}
            <div className="flex items-center justify-between bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Documento Autenticado & Indexado
                </span>
                <strong className="text-white font-mono text-sm">{selectedRelease.documentCode}</strong>
                <span className="text-slate-400 text-[11px] block mt-0.5">Emitido em {selectedRelease.issueDate}</span>
              </div>

              <button
                onClick={() => handleCopyDocumentCode(selectedRelease.documentCode)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                <span>{copiedCode ? 'Copiado!' : 'Copiar Chave'}</span>
              </button>
            </div>

            {/* Document Paper Design */}
            <div className="bg-white text-slate-900 p-6 md:p-8 rounded-2xl shadow-2xl space-y-6 font-serif border border-slate-200">
              <div className="text-center border-b border-slate-200 pb-4">
                <h3 className="text-base md:text-lg font-bold tracking-tight uppercase">
                  Termo de Autorização e Liberação Fonográfica
                </h3>
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
          </div>
        )}
      </AdminDrawer>

    </div>
  );
};
