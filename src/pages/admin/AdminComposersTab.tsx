import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AdminComposer, SubscriptionStatus } from '../../types';
import { useAdminToast } from '../../components/admin/AdminToast';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AdminSecurityPinDialog } from '../../components/admin/AdminSecurityPinDialog';
import { AdminMaskedData } from '../../components/admin/AdminMaskedData';
import { AdminDrawer } from '../../components/admin/AdminDrawer';
import { AdminPagination } from '../../components/admin/AdminPagination';
import { AdminBulkBar } from '../../components/admin/AdminBulkBar';
import { AdminDateRangeFilter, DateFilterPreset, filterByDatePreset } from '../../components/admin/AdminDateRangeFilter';
import { useDebounce } from '../../hooks/useDebounce';
import { 
  Users, 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  PlusCircle, 
  ExternalLink, 
  Trash2, 
  Phone, 
  Mail, 
  Music, 
  Eye, 
  DollarSign,
  ShieldCheck, 
  X, 
  Download, 
  Copy, 
  Check, 
  Sparkles, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Link as LinkIcon, 
  CheckSquare, 
  Square,
  Lock,
} from 'lucide-react';

type SortField = 'stageName' | 'planName' | 'monthlyValue' | 'songCount' | 'totalPlays' | 'revenueGenerated' | 'subscriptionStatus';
type SortOrder = 'asc' | 'desc';

export const AdminComposersTab: React.FC = () => {
  const { 
    adminComposers, 
    updateAdminComposerStatus, 
    toggleComposerVerified, 
    suspendAdminComposer,
    subscriptionPlans,
    addSystemLog,
    profile
  } = useApp();

  const toast = useAdminToast();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [selectedComposer, setSelectedComposer] = useState<AdminComposer | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [invitePlan, setInvitePlan] = useState('');
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);

  // Bulk Selection State
  const [selectedComposerIds, setSelectedComposerIds] = useState<string[]>([]);
  const [bulkActionType, setBulkActionType] = useState<'activate' | 'suspend' | 'verify' | null>(null);

  // Sorting & Pagination state
  const [sortField, setSortField] = useState<SortField>('revenueGenerated');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Password confirmation state for account suspension
  const [composerToSuspend, setComposerToSuspend] = useState<AdminComposer | null>(null);
  const [exportRequest, setExportRequest] = useState<boolean | null>(null);


  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Filter and Sort logic
  const filteredAndSortedComposers = useMemo(() => {
    const result = adminComposers.filter(composer => {
      const matchesSearch = 
        composer.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        composer.stageName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        composer.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        composer.cityState.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        composer.cpf.includes(debouncedSearchTerm);

      const matchesStatus = statusFilter === 'all' || composer.subscriptionStatus === statusFilter;
      const matchesDate = filterByDatePreset(composer.registeredAt, datePreset);

      return matchesSearch && matchesStatus && matchesDate;
    });

    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [adminComposers, debouncedSearchTerm, statusFilter, datePreset, sortField, sortOrder]);

  // Paginated list
  const paginatedComposers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedComposers.slice(start, start + pageSize);
  }, [filteredAndSortedComposers, currentPage, pageSize]);

  // Bulk Selection Handlers
  const isAllSelected = paginatedComposers.length > 0 && paginatedComposers.every(c => selectedComposerIds.includes(c.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const paginatedIds = paginatedComposers.map(c => c.id);
      setSelectedComposerIds(prev => prev.filter(id => !paginatedIds.includes(id)));
    } else {
      const paginatedIds = paginatedComposers.map(c => c.id);
      setSelectedComposerIds(prev => Array.from(new Set([...prev, ...paginatedIds])));
    }
  };

  const handleToggleSelectComposer = (id: string) => {
    setSelectedComposerIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Bulk Execution
  const handleBulkActivate = async () => {
    const ids = [...selectedComposerIds];
    const results=await Promise.all(ids.map(id=>updateAdminComposerStatus(id,'active')));
    const saved=results.filter(Boolean).length;
    if(saved)toast.success('Assinaturas Ativadas!', `${saved} compositores agora estão com status ativo.`);
    if(saved<results.length)toast.error('Falha parcial', `${results.length-saved} assinaturas mantiveram o status anterior.`);
    setSelectedComposerIds(ids.filter((_, index) => !results[index]));
    setBulkActionType(null);
  };

  const handleBulkSuspend = async () => {
    const ids = [...selectedComposerIds];
    const results=await Promise.all(ids.map(id=>updateAdminComposerStatus(id,'suspended')));
    const saved=results.filter(Boolean).length;
    if(saved)toast.warning('Assinaturas Suspensas', `${saved} compositores foram suspensos.`);
    if(saved<results.length)toast.error('Falha parcial', `${results.length-saved} assinaturas mantiveram o status anterior.`);
    setSelectedComposerIds(ids.filter((_, index) => !results[index]));
    setBulkActionType(null);
  };

  const handleBulkVerify = async () => {
    const targets=selectedComposerIds.filter(id => {
      const comp = adminComposers.find(c => c.id === id);
      return comp && !comp.isVerified;
    });
    const results=await Promise.all(targets.map(id=>toggleComposerVerified(id)));
    const saved=results.filter(Boolean).length;
    if(saved)toast.success('Selo Verificado em Lote!', `${saved} perfis foram verificados.`);
    if(saved<results.length)toast.error('Falha parcial', `${results.length-saved} perfis mantiveram o estado anterior.`);
    setSelectedComposerIds(targets.filter((_, index) => !results[index]));
    setBulkActionType(null);
  };

  const activeInvitePlans = useMemo(
    () => subscriptionPlans.filter(plan => plan.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [subscriptionPlans]
  );

  useEffect(() => {
    if (!activeInvitePlans.length) {
      setInvitePlan('');
      return;
    }
    if (!activeInvitePlans.some(plan => plan.name === invitePlan)) {
      setInvitePlan(activeInvitePlans[0].name);
    }
  }, [activeInvitePlans, invitePlan]);

  useEffect(() => {
    if (!selectedComposer) return;
    const current = adminComposers.find(composer => composer.id === selectedComposer.id);
    if (!current) setSelectedComposer(null);
    else if (current !== selectedComposer) setSelectedComposer(current);
  }, [adminComposers, selectedComposer?.id]);

  const handleCopyInviteLink = async () => {
    if (!invitePlan) {
      toast.warning('Plano indisponível', 'Cadastre ou ative um plano antes de gerar o convite.');
      return;
    }
    const planSlug = encodeURIComponent(invitePlan);
    const inviteUrl = `${window.location.origin}/autenticacao?modo=cadastro&plano=${planSlug}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInviteLink(true);
      toast.success('Link de convite copiado!', 'Envie o link para o compositor concluir o cadastro.');
      setTimeout(() => setCopiedInviteLink(false), 2500);
    } catch {
      toast.error('Falha ao copiar', 'Não foi possível acessar a área de transferência. Copie o link manualmente.');
    }
  };

  const handleConfirmSuspend = async () => {
    if (!composerToSuspend) return;
    const composer = composerToSuspend;
    const success = await suspendAdminComposer(composer.id);
    if (success) {
      toast.warning('Conta suspensa', `A assinatura de ${composer.stageName} foi suspensa.`);
      if (selectedComposer?.id === composer.id) setSelectedComposer(null);
      setComposerToSuspend(null);
    } else {
      toast.error('Falha ao suspender', 'A conta permaneceu com o status anterior.');
    }
  };

  const handleStatusChange = async (composer: AdminComposer, newStatus: SubscriptionStatus) => {
    const saved=await updateAdminComposerStatus(composer.id, newStatus);
    if(saved)toast.info('Status atualizado', `Assinatura de ${composer.stageName} alterada para "${newStatus.toUpperCase()}".`);
    else toast.error('Falha ao atualizar', 'O status anterior foi mantido.');
  };

  const handleToggleVerified = async (composer: AdminComposer) => {
    const saved=await toggleComposerVerified(composer.id);
    if(!saved){toast.error('Falha ao atualizar', 'O selo anterior foi mantido.');return;}
    const willBeVerified = !composer.isVerified;
    if (willBeVerified) {
      toast.success('Selo Concedido!', `${composer.stageName} agora possui selo de verificado.`);
    } else {
      toast.info('Selo Removido', `O selo de verificado de ${composer.stageName} foi desativado.`);
    }
    if (selectedComposer?.id === composer.id) {
      setSelectedComposer(prev => prev ? { ...prev, isVerified: willBeVerified } : null);
    }
  };

  const getExportList = (onlySelected: boolean) => onlySelected
    ? adminComposers.filter(c => selectedComposerIds.includes(c.id))
    : filteredAndSortedComposers;

  const requestCsvExport = (onlySelected: boolean) => {
    if (getExportList(onlySelected).length === 0) {
      toast.warning('Nenhum dado', 'Não há registros para exportar com os filtros atuais.');
      return;
    }
    setExportRequest(onlySelected);
  };

  const handleExportCsv = async () => {
    if (exportRequest === null) return;
    const onlySelected = exportRequest;
    const listToExport = onlySelected
      ? adminComposers.filter(c => selectedComposerIds.includes(c.id))
      : filteredAndSortedComposers;

    if (listToExport.length === 0) {
      toast.warning('Nenhum dado', 'Não há registros para exportar com os filtros atuais.');
      setExportRequest(null);
      return;
    }

    const auditSaved = await addSystemLog({
      category: 'auth',
      status: 'warning',
      title: 'Exportação de Dados Pessoais (LGPD)',
      description: `Exportação CSV com dados cadastrais de ${listToExport.length} compositores (${onlySelected ? 'seleção manual' : 'filtros atuais'}).`,
      user: profile.email || profile.name || 'Administrador autenticado'
    });
    if (!auditSaved) {
      toast.error('Exportação bloqueada', 'Não foi possível registrar a operação na trilha de auditoria.');
      setExportRequest(null);
      return;
    }

    const csvCell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };

    const headers = [
      'Nome_Civil',
      'Nome_Artistico',
      'Email',
      'WhatsApp',
      'CPF',
      'Cidade_Estado',
      'Plano',
      'Valor_Mensal_BRL',
      'Status_Assinatura',
      'Qtd_Musicas',
      'Audicoes_Totais',
      'Receita_Liberacoes_BRL',
      'Verificado'
    ];

    const rows = listToExport.map(c => [
      csvCell(c.name),
      csvCell(c.stageName),
      csvCell(c.email),
      csvCell(c.whatsapp),
      csvCell(c.cpf),
      csvCell(c.cityState),
      csvCell(c.planName),
      csvCell(c.monthlyValue.toFixed(2)),
      csvCell(c.subscriptionStatus),
      csvCell(c.songCount),
      csvCell(c.totalPlays),
      csvCell(c.revenueGenerated.toFixed(2)),
      csvCell(c.isVerified ? 'Sim' : 'Nao')
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_compositores_admin_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório CSV Gerado', `${listToExport.length} compositores exportados.`);
    setExportRequest(null);
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
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            <span>Gestão de Compositores & Assinaturas</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Controle de assinaturas com proteção de dados LGPD e autorização segura para exclusões.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <AdminDateRangeFilter
            activePreset={datePreset}
            onPresetChange={preset => { setDatePreset(preset); setCurrentPage(1); }}
          />

          <button
            onClick={() => requestCsvExport(false)}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-2 transition shadow-sm"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Convidar</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar with Debounce */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-lg">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, nome artístico, e-mail, cidade ou CPF..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2 overflow-x-auto touch-scroll pb-1 md:pb-0">
          <button
            onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white border border-slate-700 font-bold'
                : 'text-slate-400 hover:text-white bg-slate-950'
            }`}
          >
            Todos ({adminComposers.length})
          </button>
          <button
            onClick={() => { setStatusFilter('active'); setCurrentPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'active'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                : 'text-slate-400 hover:text-emerald-400 bg-slate-950'
            }`}
          >
            Ativos ({adminComposers.filter(c => c.subscriptionStatus === 'active').length})
          </button>
          <button
            onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-slate-400 hover:text-amber-400 bg-slate-950'
            }`}
          >
            Pendentes ({adminComposers.filter(c => c.subscriptionStatus === 'pending').length})
          </button>
          <button
            onClick={() => { setStatusFilter('suspended'); setCurrentPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'suspended'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                : 'text-slate-400 hover:text-rose-400 bg-slate-950'
            }`}
          >
            Suspensos ({adminComposers.filter(c => c.subscriptionStatus === 'suspended').length})
          </button>
        </div>
      </div>

      {/* Composers DataTable with LGPD Masked Data */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="overflow-x-auto touch-scroll">
          <table className="w-full min-w-[760px] text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="text-slate-400 hover:text-white transition"
                    title={isAllSelected ? "Desmarcar todos" : "Selecionar todos da página"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                </th>
                <th 
                  onClick={() => handleSort('stageName')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Compositor / Perfil</span>
                  {renderSortIcon('stageName')}
                </th>
                <th className="p-4">Contato / Localização (LGPD)</th>
                <th 
                  onClick={() => handleSort('monthlyValue')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Plano / Valor</span>
                  {renderSortIcon('monthlyValue')}
                </th>
                <th 
                  onClick={() => handleSort('subscriptionStatus')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Status Assinatura</span>
                  {renderSortIcon('subscriptionStatus')}
                </th>
                <th 
                  onClick={() => handleSort('songCount')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Catálogo / Plays</span>
                  {renderSortIcon('songCount')}
                </th>
                <th 
                  onClick={() => handleSort('revenueGenerated')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Receita Gerada</span>
                  {renderSortIcon('revenueGenerated')}
                </th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {paginatedComposers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-300">Nenhum compositor encontrado para os filtros selecionados.</p>
                    <p className="text-xs text-slate-500 mt-1">Tente alterar os termos de busca ou selecionar outro status de assinatura.</p>
                  </td>
                </tr>
              ) : (
                paginatedComposers.map(composer => {
                  const isSelected = selectedComposerIds.includes(composer.id);

                  return (
                    <tr 
                      key={composer.id} 
                      className={`transition ${isSelected ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-slate-800/40'}`}
                    >
                      {/* Checkbox */}
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectComposer(composer.id)}
                          className="text-slate-400 hover:text-white transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* Photo & Stage Name */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {composer.photo ? (
                            <img 
                              src={composer.photo} 
                              alt={composer.name} 
                              className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                              {composer.stageName?.slice(0, 2).toUpperCase() || 'MC'}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <strong className="text-white text-sm">{composer.stageName}</strong>
                              {composer.isVerified && (
                                <span title="Verificado" className="inline-flex"><CheckCircle2 aria-label="Verificado" className="w-3.5 h-3.5 text-amber-400" /></span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 block">{composer.name}</span>
                          </div>
                        </div>
                      </td>

                      {/* Contact with LGPD Mask */}
                      <td className="p-4 space-y-1">
                        <div className="text-slate-200 block truncate max-w-xs">
                          <AdminMaskedData 
                            value={composer.email} 
                            type="email" 
                            subjectName={composer.stageName} 
                          />
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <AdminMaskedData 
                            value={composer.whatsapp} 
                            type="phone" 
                            subjectName={composer.stageName} 
                          />
                          <span>• {composer.cityState}</span>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="p-4">
                        <strong className="text-white block">{composer.planName}</strong>
                        <span className="text-amber-400 font-mono font-bold text-[11px]">
                          R$ {composer.monthlyValue.toFixed(2)}/mês
                        </span>
                      </td>

                      {/* Status Dropdown */}
                      <td className="p-4">
                        <select
                          value={composer.subscriptionStatus}
                          onChange={e => handleStatusChange(composer, e.target.value as SubscriptionStatus)}
                          aria-label="Status da assinatura"
                          className={`text-[11px] font-bold uppercase rounded-lg px-2.5 py-1 border transition focus:outline-none cursor-pointer ${
                            composer.subscriptionStatus === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : composer.subscriptionStatus === 'pending'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          <option value="active">Ativo</option>
                          <option value="pending">Pendente</option>
                          <option value="suspended">Suspenso</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      </td>

                      {/* Songs & Plays */}
                      <td className="p-4">
                        <span className="text-white font-bold block">{composer.songCount} músicas</span>
                        <span className="text-[11px] text-slate-400 block">{composer.totalPlays} audições</span>
                      </td>

                      {/* Revenue */}
                      <td className="p-4 font-mono font-bold text-emerald-400">
                        R$ {composer.revenueGenerated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleVerified(composer)}
                          className={`p-2 rounded-xl border transition ${
                            composer.isVerified 
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30' 
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700'
                          }`}
                          title={composer.isVerified ? 'Remover selo de verificado' : 'Conceder selo de verificado'}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setSelectedComposer(composer)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                          title="Ver ficha completa (Drawer)"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setComposerToSuspend(composer)}
                          className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 transition"
                          title="Suspender conta (Requer senha)"
                        >
                          <Trash2 className="w-4 h-4" />
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
          totalItems={filteredAndSortedComposers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
        />
      </div>

      {/* FLOATING BULK ACTIONS BAR */}
      <AdminBulkBar
        selectedCount={selectedComposerIds.length}
        onClearSelection={() => setSelectedComposerIds([])}
        itemLabel="compositores"
        actions={[
          {
            id: 'activate',
            label: 'Ativar Assinaturas',
            icon: <CheckCircle2 className="w-4 h-4" />,
            variant: 'success',
            onClick: () => setBulkActionType('activate')
          },
          {
            id: 'verify',
            label: 'Verificar Perfis',
            icon: <ShieldCheck className="w-4 h-4" />,
            variant: 'primary',
            onClick: () => setBulkActionType('verify')
          },
          {
            id: 'suspend',
            label: 'Suspender',
            icon: <XCircle className="w-4 h-4" />,
            variant: 'danger',
            onClick: () => setBulkActionType('suspend')
          },
          {
            id: 'export',
            label: 'Exportar CSV',
            icon: <Download className="w-4 h-4" />,
            variant: 'secondary',
            onClick: () => requestCsvExport(true)
          }
        ]}
      />

      {/* COMPOSER DETAILS SIDE DRAWER WITH LGPD MASKED DATA */}
      <AdminDrawer
        isOpen={!!selectedComposer}
        onClose={() => setSelectedComposer(null)}
        title={selectedComposer?.stageName || 'Detalhes do Compositor'}
        subtitle={selectedComposer?.name}
        icon={<Users className="w-5 h-5" />}
        footer={
          selectedComposer && (
            <div className="flex items-center justify-between gap-3">
              <a
                href={`/compositor/${selectedComposer.username}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5"
              >
                <span>Abrir Vitrine Pública</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                onClick={() => setSelectedComposer(null)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
              >
                Fechar Painel
              </button>
            </div>
          )
        }
      >
        {selectedComposer && (
          <div className="space-y-6 text-xs">
            {/* Profile Overview Card */}
            <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
              {selectedComposer.photo ? (
                <img 
                  src={selectedComposer.photo} 
                  alt={selectedComposer.name} 
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 shrink-0"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border-2 border-amber-400 flex items-center justify-center text-amber-400 font-bold text-lg shrink-0">
                  {selectedComposer.stageName?.slice(0, 2).toUpperCase() || 'MC'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-white text-base truncate">{selectedComposer.stageName}</h4>
                  {selectedComposer.isVerified && (
                    <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verificado
                    </span>
                  )}
                </div>
                <p className="text-slate-400 mt-0.5">{selectedComposer.name}</p>
                <p className="text-slate-500 text-[11px]">{selectedComposer.cityState}</p>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 text-[11px] block">Obras</span>
                <strong className="text-white text-base font-bold">{selectedComposer.songCount}</strong>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 text-[11px] block">Audições</span>
                <strong className="text-purple-400 text-base font-bold">{selectedComposer.totalPlays}</strong>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 text-[11px] block">Liberações</span>
                <strong className="text-blue-400 text-base font-bold">{selectedComposer.totalReleases}</strong>
              </div>
            </div>

            {/* Contact & Registration Data with LGPD Mask */}
            <div className="space-y-3">
              <h5 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Dados Cadastrais & Contato (LGPD)</span>
              </h5>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">E-mail:</span>
                  <AdminMaskedData 
                    value={selectedComposer.email} 
                    type="email" 
                    subjectName={selectedComposer.stageName} 
                  />
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">WhatsApp:</span>
                  <AdminMaskedData 
                    value={selectedComposer.whatsapp} 
                    type="phone" 
                    subjectName={selectedComposer.stageName} 
                  />
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">CPF:</span>
                  <AdminMaskedData 
                    value={selectedComposer.cpf} 
                    type="cpf" 
                    subjectName={selectedComposer.stageName} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Vitrine Username:</span>
                  <span className="text-amber-400 font-mono">@{selectedComposer.username}</span>
                </div>
              </div>
            </div>

            {/* Subscription & Finance */}
            <div className="space-y-3">
              <h5 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                Assinatura & Monetização
              </h5>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Plano Ativo:</span>
                  <strong className="text-amber-400">{selectedComposer.planName}</strong>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Mensalidade:</span>
                  <strong className="text-white font-mono">R$ {selectedComposer.monthlyValue.toFixed(2)} / mês</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Receita Total Transacionada:</span>
                  <strong className="text-emerald-400 font-mono text-sm">
                    R$ {selectedComposer.revenueGenerated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            </div>

            {/* Quick Actions inside Drawer */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleToggleVerified(selectedComposer)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                  selectedComposer.isVerified
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{selectedComposer.isVerified ? 'Remover Selo' : 'Verificar Perfil'}</span>
              </button>

              <button
                onClick={() => setComposerToSuspend(selectedComposer)}
                className="py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-rose-500/20 text-rose-400 border border-slate-800 hover:border-rose-500/30 text-xs font-semibold flex items-center gap-2 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Suspender conta</span>
              </button>
            </div>
          </div>
        )}
      </AdminDrawer>

      {/* PASSWORD CONFIRMATION DIALOG FOR ACCOUNT SUSPENSION */}
      <AdminSecurityPinDialog
        isOpen={!!composerToSuspend}
        title={`Suspender ${composerToSuspend?.stageName}?`}
        description="A assinatura será suspensa e o compositor perderá o acesso aos recursos ativos. Digite a senha da sua conta de administrador para confirmar."
        actionLabel="Confirmar Suspensão"
        onSuccess={handleConfirmSuspend}
        onCancel={() => setComposerToSuspend(null)}
      />

      <AdminSecurityPinDialog
        isOpen={exportRequest !== null}
        title="Exportar dados pessoais?"
        description="O relatório contém e-mail, telefone e CPF. Confirme sua senha de administrador; a finalidade, o responsável e a quantidade exportada serão registrados na auditoria."
        actionLabel="Autorizar Exportação"
        onSuccess={handleExportCsv}
        onCancel={() => setExportRequest(null)}
      />

      {/* CONFIRM BULK ACTION DIALOG */}
      <AdminConfirmDialog
        isOpen={!!bulkActionType}
        title={
          bulkActionType === 'activate'
            ? `Ativar ${selectedComposerIds.length} assinaturas?`
            : bulkActionType === 'suspend'
            ? `Suspender ${selectedComposerIds.length} assinaturas?`
            : `Conceder selo de verificação a ${selectedComposerIds.length} compositores?`
        }
        description={`Esta alteração em lote será aplicada a todos os ${selectedComposerIds.length} compositores selecionados imediatamente.`}
        confirmLabel="Confirmar Ação em Lote"
        cancelLabel="Cancelar"
        variant={bulkActionType === 'suspend' ? 'warning' : 'info'}
        onConfirm={() => {
          if (bulkActionType === 'activate') handleBulkActivate();
          else if (bulkActionType === 'suspend') handleBulkSuspend();
          else if (bulkActionType === 'verify') handleBulkVerify();
        }}
        onCancel={() => setBulkActionType(null)}
      />

      {/* ADD / INVITE COMPOSER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 animate-fadeIn max-h-[calc(100dvh-2rem)] overflow-y-auto touch-scroll">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Convidar Compositor</h3>
                <p className="text-slate-400 text-xs mt-0.5">Envie um link para o compositor concluir o cadastro com segurança.</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">Selecione o Plano do Convite</label>
                <select
                  value={invitePlan}
                  onChange={e => setInvitePlan(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2.5"
                >
                  {activeInvitePlans.map(plan => (
                    <option key={plan.id} value={plan.name}>
                      {plan.name} — R$ {plan.monthlyPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                      {plan.maxSongs == null ? ' — ilimitado' : ` — até ${plan.maxSongs} músicas`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <span className="text-slate-400 block text-[11px]">Link direto para o compositor concluir o próprio cadastro:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={invitePlan ? `${window.location.origin}/autenticacao?modo=cadastro&plano=${encodeURIComponent(invitePlan)}` : ''}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-amber-400 font-mono flex-1 focus:outline-none"
                  />
                  <button
                    onClick={handleCopyInviteLink}
                    disabled={!invitePlan}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold flex items-center gap-1.5 shrink-0 transition"
                  >
                    {copiedInviteLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedInviteLink ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
