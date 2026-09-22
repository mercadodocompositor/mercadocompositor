import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { InterestRequest, ReleaseDocument, RequestStatus } from '../../types';
import { AdminDrawer } from '../../components/admin/AdminDrawer';
import { AdminPagination } from '../../components/admin/AdminPagination';
import { AdminDateRangeFilter, DateFilterPreset, filterByDatePreset } from '../../components/admin/AdminDateRangeFilter';
import { AdminMaskedData } from '../../components/admin/AdminMaskedData';
import { AdminSecurityPinDialog } from '../../components/admin/AdminSecurityPinDialog';
import { createAdminReleaseDocumentUrl } from '../../lib/database';
import { useAdminToast } from '../../components/admin/AdminToast';
import { useDebounce } from '../../hooks/useDebounce';
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
  Check, 
  Percent, 
  Wallet, 
  TrendingUp, 
  Receipt,
  Lock,
  LoaderCircle
} from 'lucide-react';

type SortField = 'songTitle' | 'buyerName' | 'agreedValue' | 'status' | 'createdAt';
type SortOrder = 'asc' | 'desc';

export const AdminTransactionsTab: React.FC = () => {
  const toast = useAdminToast();
  const { adminRequests: requests, adminReleases: releases, refreshAdminTransactions, addSystemLog, profile } = useApp();
  const [isInitialLoading, setIsInitialLoading] = useState(() => requests.length === 0 && releases.length === 0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void refreshAdminTransactions().then(success => {
      if (isMounted) setLoadError(!success);
    }).finally(() => {
      if (isMounted) setIsInitialLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [refreshAdminTransactions]);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [selectedRelease, setSelectedRelease] = useState<ReleaseDocument | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<InterestRequest | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [exportRequested, setExportRequested] = useState(false);
  const [openingDocument, setOpeningDocument] = useState(false);

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

  const retryLoad = async () => {
    setIsInitialLoading(true);
    const success = await refreshAdminTransactions();
    setLoadError(!success);
    setIsInitialLoading(false);
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

  const handleCopyDocumentCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      toast.success('Código copiado!', `Chave de autenticidade ${code} copiada.`);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      toast.error('Falha ao copiar', 'O navegador não permitiu copiar a chave de autenticidade.');
    }
  };

  useEffect(() => {
    if (selectedRequest) {
      setSelectedRequest(requests.find(request => request.id === selectedRequest.id) || null);
    }
  }, [requests]);

  useEffect(() => {
    if (selectedRelease) {
      setSelectedRelease(releases.find(release => release.id === selectedRelease.id) || null);
    }
  }, [releases]);

  // Filter and Sort logic
  const filteredAndSortedRequests = useMemo(() => {
    const result = requests.filter(req => {
      const matchesSearch = 
        req.songTitle.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        req.buyerName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        req.buyerEmail.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (req.buyerStageName && req.buyerStageName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
      const financialEventDate = req.paymentReceivedAt || req.createdAt;
      const matchesDate = filterByDatePreset(financialEventDate, datePreset);

      return matchesSearch && matchesStatus && matchesDate;
    });

    result.sort((a, b) => {
      let aVal = sortField === 'createdAt' ? (a.paymentReceivedAt || a.createdAt) : a[sortField];
      let bVal = sortField === 'createdAt' ? (b.paymentReceivedAt || b.createdAt) : b[sortField];

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
  }, [requests, debouncedSearchTerm, statusFilter, datePreset, sortField, sortOrder]);

  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedRequests.slice(start, start + pageSize);
  }, [filteredAndSortedRequests, currentPage, pageSize]);

  // Financial Reconciliation Calculations
  const reconciliation = useMemo(() => {
    const completedRequests = filteredAndSortedRequests.filter(r => Boolean(r.paymentReceivedAt));

    const totalGmv = completedRequests.reduce((acc, r) => acc + (r.agreedValue || 0), 0);
    const snapshotted = completedRequests.filter(r => r.platformFeeAmount !== undefined && r.composerNetAmount !== undefined);
    const platformRevenue = snapshotted.reduce((acc, r) => acc + (r.platformFeeAmount || 0), 0);
    const composerNet = snapshotted.reduce((acc, r) => acc + (r.composerNetAmount || 0), 0);
    const avgTicket = completedRequests.length > 0 ? totalGmv / completedRequests.length : 0;

    return {
      totalGmv,
      platformRevenue,
      composerNet,
      avgTicket,
      completedCount: completedRequests.length,
      snapshottedCount: snapshotted.length
    };
  }, [filteredAndSortedRequests]);

  // Export CSV with Split Details
  const requestExportCsv = () => {
    if (filteredAndSortedRequests.length === 0) {
      toast.warning('Nenhum dado', 'Não há transações para exportar com os filtros atuais.');
      return;
    }

    setExportRequested(true);
  };

  const handleExportCsv = async () => {
    const paidRequests = filteredAndSortedRequests.filter(r => Boolean(r.paymentReceivedAt));
    if (paidRequests.length === 0) {
      setExportRequested(false);
      toast.warning('Nenhum pagamento', 'Não há pagamentos recebidos para exportar com os filtros atuais.');
      return;
    }

    const auditSaved = await addSystemLog({
      category: 'financial', status: 'warning',
      title: 'Exportação de auditoria financeira',
      description: `Exportação CSV de ${paidRequests.length} pagamentos com dados pessoais dos compradores.`,
      user: profile.email || profile.name || 'Operador financeiro autenticado'
    });
    if (!auditSaved) {
      toast.error('Exportação bloqueada', 'Não foi possível registrar a operação na auditoria.');
      setExportRequested(false);
      return;
    }

    const csvCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };

    const headers = [
      'ID',
      'Obra_Musical',
      'Interprete_Comprador',
      'Documento',
      'Email',
      'WhatsApp',
      'Status',
      'Valor_Bruto_BRL',
      'Taxa_Plataforma_BRL',
      'Liquido_Previsto_Compositor_BRL',
      'Finalidade',
      'Data_Pagamento'
    ];

    const rows = paidRequests.map(r => {
      const grossVal = r.agreedValue || 0;
      const feeVal = r.platformFeeAmount;
      const netVal = r.composerNetAmount;

      return [
        csvCell(r.id), csvCell(r.songTitle), csvCell(r.buyerName), csvCell(r.cpfCnpj),
        csvCell(r.buyerEmail), csvCell(r.buyerWhatsapp), csvCell(r.status), csvCell(grossVal.toFixed(2)),
        csvCell(feeVal?.toFixed(2) ?? 'NÃO REGISTRADA'),
        csvCell(netVal?.toFixed(2) ?? 'NÃO REGISTRADO'), csvCell(r.purpose), csvCell(r.paymentReceivedAt || '')
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `conciliacao_financeira_admin_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório Financeiro Gerado', 'O arquivo CSV com split de intermediação foi baixado.');
    setExportRequested(false);
  };

  const handleOpenArchivedDocument = async () => {
    if (!selectedRelease?.documentPath) return;
    setOpeningDocument(true);
    try {
      const auditSaved = await addSystemLog({
        category: 'financial', status: 'info', title: 'Acesso a termo de liberação arquivado',
        description: `Acesso ao PDF ${selectedRelease.documentCode} (${selectedRelease.id}).`,
        user: profile.email || profile.name || 'Operador financeiro autenticado'
      });
      if (!auditSaved) throw new Error('O acesso não pôde ser registrado na auditoria.');
      const url = await createAdminReleaseDocumentUrl(selectedRelease.documentPath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error('Documento indisponível', error instanceof Error ? error.message : 'Não foi possível abrir o PDF arquivado.');
    } finally { setOpeningDocument(false); }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 inline ml-1 transition" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-amber-400 inline ml-1" />
      : <ArrowDown className="w-3 h-3 text-amber-400 inline ml-1" />;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-amber-400" />
            <span>Auditoria Financeira & Termos de Liberação</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Supervisione negociações, conciliação de receitas, take-rate retido e certificados emitidos (Conformidade LGPD).
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <AdminDateRangeFilter
            activePreset={datePreset}
            onPresetChange={preset => { setDatePreset(preset); setCurrentPage(1); }}
          />

          <button
            onClick={requestExportCsv}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-2 transition shadow-sm"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar Conciliação CSV</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-rose-200">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <strong className="block text-sm">Falha ao carregar a auditoria financeira</strong>
              <span className="text-xs text-rose-200/80">Os números exibidos podem corresponder à última atualização concluída.</span>
            </div>
          </div>
          <button type="button" onClick={retryLoad} disabled={isInitialLoading}
            className="px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30 text-xs font-bold text-rose-100 disabled:opacity-50">
            Tentar novamente
          </button>
        </div>
      )}

      {/* FINANCIAL RECONCILIATION CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Volume Bruto Transacionado */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">GMV Concluído</span>
            <Receipt className="w-4 h-4 text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-white font-mono">
            R$ {reconciliation.totalGmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400">
            {reconciliation.completedCount} autorizações quitadas
          </p>
        </div>

        {/* Card 2: Receita da Plataforma (Take Rate) */}
        <div className="bg-slate-900 border border-amber-500/30 p-5 rounded-2xl space-y-2 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <Percent className="w-3.5 h-3.5" /> Receita Registrada
            </span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="text-2xl font-bold text-amber-400 font-mono">
            R$ {reconciliation.platformRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400">
            Soma dos snapshots financeiros disponíveis
          </p>
        </div>

        {/* Card 3: valor líquido contratual; não representa transferência bancária */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Líquido Previsto aos Autores</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <h3 className="text-2xl font-bold text-emerald-400 font-mono">
            R$ {reconciliation.composerNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400">
            {reconciliation.snapshottedCount} de {reconciliation.completedCount} pagamentos com taxa registrada
          </p>
        </div>

        {/* Card 4: Ticket Médio */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Ticket Médio</span>
            <DollarSign className="w-4 h-4 text-purple-400" />
          </div>
          <h3 className="text-2xl font-bold text-white font-mono">
            R$ {reconciliation.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400">
            Valor médio por cessão musical
          </p>
        </div>
      </div>

      {/* Filter and Search Bar with Debounce */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-lg">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por música, intérprete, produtor ou e-mail (busca instantânea)..."
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

      {/* Requests DataTable with Financial Split & LGPD Mask */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="overflow-x-auto touch-scroll">
          <table className="w-full min-w-[800px] text-left text-xs text-slate-300">
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
                  <span>Intérprete (LGPD)</span>
                  {renderSortIcon('buyerName')}
                </th>
                <th className="p-4">Finalidade</th>
                <th 
                  onClick={() => handleSort('agreedValue')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Valor Acordado (GMV)</span>
                  {renderSortIcon('agreedValue')}
                </th>
                <th className="p-4">Taxa / Líquido Previsto</th>
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
              {isInitialLoading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3 animate-pulse">
                      <LoaderCircle className="w-8 h-8 animate-spin text-amber-400" />
                      <span className="text-xs font-semibold text-slate-300">Carregando propostas e liberações financeiras...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-300">Nenhuma proposta encontrada para os filtros selecionados.</p>
                    <p className="text-xs text-slate-500 mt-1">Tente ajustar os termos de pesquisa ou os filtros de data e status.</p>
                  </td>
                </tr>
              ) : (
                paginatedRequests.map(req => {
                  const grossVal = req.agreedValue || 0;
                  const feeVal = req.platformFeeAmount;
                  const netVal = req.composerNetAmount;
                  const appliedFeePercentage = req.platformFeePercentage;

                  return (
                    <tr key={req.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-4">
                        <strong className="text-white text-sm block">“{req.songTitle}”</strong>
                        <span className="text-[11px] text-slate-400">ID: {req.id.slice(0, 8)}...</span>
                        {req.composerName && <span className="text-[11px] text-slate-500 block">Autor: {req.composerName}</span>}
                      </td>

                      <td className="p-4 space-y-1">
                        <strong className="text-slate-200 block">{req.buyerName}</strong>
                        <div className="text-[11px] text-slate-400">
                          <AdminMaskedData
                            value={req.buyerWhatsapp}
                            type="phone"
                            subjectName={req.buyerName}
                          />
                        </div>
                      </td>

                      <td className="p-4 max-w-xs truncate text-slate-300">
                        {req.purpose}
                      </td>

                      <td className="p-4 font-mono font-bold text-white">
                        {grossVal > 0 
                          ? `R$ ${grossVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                          : 'Em aberto'}
                      </td>

                      {/* Split Column */}
                      <td className="p-4 space-y-0.5">
                        {grossVal > 0 && feeVal !== undefined && netVal !== undefined ? (
                          <>
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-amber-400 font-mono font-semibold">Taxa: R$ {feeVal.toFixed(2)}</span>
                              <span className="text-slate-500">({appliedFeePercentage}%)</span>
                            </div>
                            <div className="text-[10px] text-emerald-400 font-mono">
                              Líquido previsto: R$ {netVal.toFixed(2)}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Taxa histórica não registrada</span>
                        )}
                      </td>

                      <td className="p-4">
                        {getStatusBadge(req.status)}
                      </td>

                      <td className="p-4 text-slate-400 font-mono text-[11px]">
                        {(req.paymentReceivedAt || req.createdAt).split('T')[0]}
                        <span className="block text-[9px] text-slate-500">{req.paymentReceivedAt ? 'Pagamento' : 'Proposta'}</span>
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
                  );
                })
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

      {/* REQUEST DETAILS SIDE DRAWER WITH LGPD MASK */}
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
              {selectedRequest.composerName && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-400">Compositor beneficiário:</span>
                  <strong className="text-white">{selectedRequest.composerName}</strong>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400">Última atualização:</span>
                <span className="text-slate-300 font-mono">{selectedRequest.updatedAt || selectedRequest.createdAt}</span>
              </div>
              {selectedRequest.archiveReason && (
                <div className="pt-2 border-t border-slate-800 text-amber-300">
                  Motivo do arquivamento: {selectedRequest.archiveReason}
                </div>
              )}
            </div>

            {/* Buyer Contact Data with LGPD Mask */}
            <div className="space-y-3">
              <h5 className="font-bold text-white uppercase tracking-wider text-slate-400 text-[11px] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Dados do Intérprete / Solicitante (LGPD)</span>
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
                  <AdminMaskedData
                    value={selectedRequest.cpfCnpj}
                    type="cpf"
                    subjectName={selectedRequest.buyerName}
                  />
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">E-mail:</span>
                  <AdminMaskedData
                    value={selectedRequest.buyerEmail}
                    type="email"
                    subjectName={selectedRequest.buyerName}
                  />
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">WhatsApp:</span>
                  <AdminMaskedData
                    value={selectedRequest.buyerWhatsapp}
                    type="phone"
                    subjectName={selectedRequest.buyerName}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Cidade / Estado:</span>
                  <span className="text-white">{selectedRequest.buyerCityState}</span>
                </div>
              </div>
            </div>

            {/* Terms & Financial Proposal with Split Breakdown */}
            <div className="space-y-3">
              <h5 className="font-bold text-white uppercase tracking-wider text-slate-400 text-[11px]">
                Finalidade & Split Financeiro
              </h5>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Finalidade:</span>
                  <span className="text-amber-300 font-semibold">{selectedRequest.purpose}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Valor Bruto Acordado (GMV):</span>
                  <strong className="text-white font-mono text-sm">
                    {selectedRequest.agreedValue 
                      ? `R$ ${selectedRequest.agreedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                      : 'Sob Negociação'}
                  </strong>
                </div>

                {selectedRequest.agreedValue && (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <span className="text-slate-400">Comissão registrada:</span>
                      <strong className="text-amber-400 font-mono">
                        {selectedRequest.platformFeeAmount === undefined
                          ? 'Não registrada'
                          : `R$ ${selectedRequest.platformFeeAmount.toFixed(2)} (${selectedRequest.platformFeePercentage}%)`}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Líquido contratual previsto:</span>
                      <strong className="text-emerald-400 font-mono text-sm">
                        {selectedRequest.composerNetAmount === undefined
                          ? 'Não registrado'
                          : `R$ ${selectedRequest.composerNetAmount.toFixed(2)}`}
                      </strong>
                    </div>
                  </>
                )}
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

      {/* AUDIT RELEASE TERM DRAWER */}
      <AdminDrawer
        isOpen={!!selectedRelease}
        onClose={() => setSelectedRelease(null)}
        title="Auditoria do Termo de Liberação"
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
                  {selectedRelease.documentPath && selectedRelease.documentHash && selectedRelease.documentArchivedAt
                    ? 'PDF Arquivado com Integridade Registrada'
                    : 'Registro Emitido sem PDF Arquivado'}
                </span>
                <strong className="text-white font-mono text-sm">{selectedRelease.documentCode}</strong>
                <span className="text-slate-400 text-[11px] block mt-0.5">Emitido em {selectedRelease.issueDate}</span>
                {selectedRelease.expiresAt && <span className="text-slate-400 text-[11px] block">Vig?ncia at? {selectedRelease.expiresAt}</span>}
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
            <div className="bg-blue-500/10 border border-blue-500/30 text-blue-200 p-3 rounded-xl">
              Esta visualização reconstrói os dados registrados. Use o PDF arquivado abaixo para auditar o documento original emitido.
            </div>
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
                  <p className="text-slate-600">CPF: <AdminMaskedData value={selectedRelease.composerCpf} type="cpf" subjectName={selectedRelease.composerName} /></p>
                  <p className="text-slate-600">{selectedRelease.composerCityState}</p>
                </div>

                <div>
                  <span className="font-bold text-slate-700 block uppercase text-[10px]">Outorgado (Intérprete):</span>
                  <p className="font-bold text-slate-900">{selectedRelease.buyerName}</p>
                  <p className="text-slate-600">Documento: <AdminMaskedData value={selectedRelease.buyerDocument} type="cpf" subjectName={selectedRelease.buyerName} /></p>
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
                <span className={selectedRelease.documentPath && selectedRelease.documentHash && selectedRelease.documentArchivedAt
                  ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                  {selectedRelease.documentPath && selectedRelease.documentHash && selectedRelease.documentArchivedAt
                    ? '✓ PDF arquivado' : '⚠ Arquivamento pendente'}
                </span>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <strong className="text-white block">Documento original</strong>
                  <span className="text-slate-400">
                    {selectedRelease.documentPath
                      ? `Versão ${selectedRelease.templateVersion || 'não informada'} · hash ${selectedRelease.documentHash?.slice(0, 12) || 'ausente'}…`
                      : 'Nenhum PDF imutável foi registrado para este termo.'}
                  </span>
                </div>
                <button type="button" onClick={handleOpenArchivedDocument}
                  disabled={!selectedRelease.documentPath || openingDocument}
                  className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold disabled:opacity-40">
                  {openingDocument ? 'Abrindo…' : 'Abrir PDF arquivado'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminDrawer>

      <AdminSecurityPinDialog
        isOpen={exportRequested}
        title="Exportar auditoria financeira?"
        description="O arquivo contém documentos, e-mails e telefones de compradores. Confirme sua senha; a exportação será registrada na auditoria."
        actionLabel="Autorizar Exportação"
        onSuccess={handleExportCsv}
        onCancel={() => setExportRequested(false)}
      />

    </div>
  );
};
