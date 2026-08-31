import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { AdminComposer, SubscriptionStatus } from '../../types';
import { useAdminToast } from '../../components/admin/AdminToast';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AdminDrawer } from '../../components/admin/AdminDrawer';
import { AdminPagination } from '../../components/admin/AdminPagination';
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
  Link as LinkIcon 
} from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';

type SortField = 'stageName' | 'planName' | 'monthlyValue' | 'songCount' | 'totalPlays' | 'revenueGenerated' | 'subscriptionStatus';
type SortOrder = 'asc' | 'desc';

export const AdminComposersTab: React.FC = () => {
  const { 
    adminComposers, 
    updateAdminComposerStatus, 
    toggleComposerVerified, 
    deleteAdminComposer,
    addAdminComposer
  } = useApp();

  const toast = useAdminToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [selectedComposer, setSelectedComposer] = useState<AdminComposer | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<'invite' | 'manual'>('invite');
  const [invitePlan, setInvitePlan] = useState('Plano Ouro (Ilimitado)');
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);

  // Sorting & Pagination state
  const [sortField, setSortField] = useState<SortField>('revenueGenerated');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Confirmation dialog state
  const [composerToDelete, setComposerToDelete] = useState<AdminComposer | null>(null);

  // New Composer Form state for manual add
  const [newForm, setNewForm] = useState({
    name: '',
    stageName: '',
    email: '',
    whatsapp: '',
    cpf: '',
    cityState: '',
    username: '',
    planName: 'Plano Ouro',
    monthlyValue: 54.90,
    subscriptionStatus: 'active' as SubscriptionStatus,
    photo: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    isVerified: true
  });

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
        composer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        composer.stageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        composer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        composer.cityState.toLowerCase().includes(searchTerm.toLowerCase()) ||
        composer.cpf.includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || composer.subscriptionStatus === statusFilter;

      return matchesSearch && matchesStatus;
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
  }, [adminComposers, searchTerm, statusFilter, sortField, sortOrder]);

  // Paginated list
  const paginatedComposers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedComposers.slice(start, start + pageSize);
  }, [filteredAndSortedComposers, currentPage, pageSize]);

  const handleCopyInviteLink = () => {
    const planSlug = encodeURIComponent(invitePlan);
    const inviteUrl = `${window.location.origin}/autenticacao?modo=cadastro&plano=${planSlug}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInviteLink(true);
    toast.success('Link de convite copiado!', 'Envie o link para o compositor concluir o cadastro.');
    setTimeout(() => setCopiedInviteLink(false), 2500);
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name || !newForm.email || !newForm.stageName) {
      toast.warning('Campos obrigatórios', 'Preencha o Nome civil, Nome artístico e E-mail.');
      return;
    }

    addAdminComposer({
      name: newForm.name,
      stageName: newForm.stageName,
      email: newForm.email,
      whatsapp: newForm.whatsapp,
      cpf: newForm.cpf,
      cityState: newForm.cityState || 'Brasil',
      username: newForm.username || newForm.stageName.toLowerCase().replace(/\s+/g, '-'),
      planName: newForm.planName,
      monthlyValue: newForm.monthlyValue,
      subscriptionStatus: newForm.subscriptionStatus,
      photo: newForm.photo,
      isVerified: newForm.isVerified
    });

    toast.success('Compositor adicionado com sucesso!', `${newForm.stageName} foi incluído no painel.`);
    setIsAddModalOpen(false);
    setNewForm({
      name: '',
      stageName: '',
      email: '',
      whatsapp: '',
      cpf: '',
      cityState: '',
      username: '',
      planName: 'Plano Ouro',
      monthlyValue: 54.90,
      subscriptionStatus: 'active',
      photo: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      isVerified: true
    });
  };

  const handleConfirmDelete = () => {
    if (!composerToDelete) return;
    deleteAdminComposer(composerToDelete.id);
    toast.error('Compositor removido', `${composerToDelete.stageName} foi excluído da base.`);
    if (selectedComposer?.id === composerToDelete.id) {
      setSelectedComposer(null);
    }
    setComposerToDelete(null);
  };

  const handleStatusChange = (composer: AdminComposer, newStatus: SubscriptionStatus) => {
    updateAdminComposerStatus(composer.id, newStatus);
    toast.info('Status atualizado', `Assinatura de ${composer.stageName} alterada para "${newStatus.toUpperCase()}".`);
  };

  const handleToggleVerified = (composer: AdminComposer) => {
    toggleComposerVerified(composer.id);
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

  const handleExportCsv = () => {
    if (filteredAndSortedComposers.length === 0) {
      toast.warning('Nenhum dado', 'Não há registros para exportar com os filtros atuais.');
      return;
    }

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

    const rows = filteredAndSortedComposers.map(c => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.stageName.replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.whatsapp}"`,
      `"${c.cpf}"`,
      `"${c.cityState.replace(/"/g, '""')}"`,
      `"${c.planName}"`,
      c.monthlyValue.toFixed(2),
      c.subscriptionStatus,
      c.songCount,
      c.totalPlays,
      c.revenueGenerated.toFixed(2),
      c.isVerified ? 'Sim' : 'Nao'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_compositores_admin_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório CSV Gerado', 'O download do arquivo foi iniciado.');
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
            Controle total sobre o status de pagamento, catálogo cadastrado e verificação de perfil de cada autor.
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

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Adicionar / Convidar</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
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
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
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

      {/* Composers DataTable */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th 
                  onClick={() => handleSort('stageName')}
                  className="p-4 cursor-pointer hover:text-white transition group select-none"
                >
                  <span>Compositor / Perfil</span>
                  {renderSortIcon('stageName')}
                </th>
                <th className="p-4">Contato / Localização</th>
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
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhum compositor encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                paginatedComposers.map(composer => (
                  <tr key={composer.id} className="hover:bg-slate-800/40 transition">
                    {/* Photo & Stage Name */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={composer.photo} 
                          alt={composer.name} 
                          className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <strong className="text-white text-sm">{composer.stageName}</strong>
                            {composer.isVerified && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" title="Verificado" />
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block">{composer.name}</span>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="p-4 space-y-0.5">
                      <span className="text-slate-200 block truncate max-w-xs">{composer.email}</span>
                      <span className="text-[11px] text-slate-400 block">{composer.whatsapp} • {composer.cityState}</span>
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
                        onClick={() => setComposerToDelete(composer)}
                        className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 transition"
                        title="Excluir compositor"
                      >
                        <Trash2 className="w-4 h-4" />
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
          totalItems={filteredAndSortedComposers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
        />
      </div>

      {/* COMPOSER DETAILS SIDE DRAWER */}
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
              <img 
                src={selectedComposer.photo} 
                alt={selectedComposer.name} 
                className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400"
              />
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

            {/* Contact & Registration Data */}
            <div className="space-y-3">
              <h5 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                Dados Cadastrais & Contato
              </h5>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">E-mail:</span>
                  <span className="text-white font-medium">{selectedComposer.email}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">WhatsApp:</span>
                  <span className="text-white font-mono">{selectedComposer.whatsapp}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">CPF:</span>
                  <span className="text-white font-mono">{selectedComposer.cpf}</span>
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
                onClick={() => setComposerToDelete(selectedComposer)}
                className="py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-rose-500/20 text-rose-400 border border-slate-800 hover:border-rose-500/30 text-xs font-semibold flex items-center gap-2 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir</span>
              </button>
            </div>
          </div>
        )}
      </AdminDrawer>

      {/* CONFIRM DELETE DIALOG */}
      <AdminConfirmDialog
        isOpen={!!composerToDelete}
        title={`Excluir ${composerToDelete?.stageName}?`}
        description="Esta ação removerá permanentemente o perfil administrativo deste compositor. Esta ação não pode ser desfeita."
        confirmLabel="Sim, Excluir Compositor"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setComposerToDelete(null)}
      />

      {/* ADD / INVITE COMPOSER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Adicionar / Convidar Compositor</h3>
                <p className="text-slate-400 text-xs mt-0.5">Envie um link pré-pago ou faça o cadastro manual.</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setAddMode('invite')}
                className={`flex-1 py-2 rounded-lg font-bold transition flex items-center justify-center gap-2 ${
                  addMode === 'invite' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Gerar Link de Convite</span>
              </button>
              <button
                onClick={() => setAddMode('manual')}
                className={`flex-1 py-2 rounded-lg font-bold transition flex items-center justify-center gap-2 ${
                  addMode === 'manual' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Cadastro Manual</span>
              </button>
            </div>

            {addMode === 'invite' ? (
              <div className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold">Selecione o Plano do Convite</label>
                  <select
                    value={invitePlan}
                    onChange={e => setInvitePlan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2.5"
                  >
                    <option value="Plano Ouro (Ilimitado)">Plano Ouro (Ilimitado) — R$ 54,90/mês</option>
                    <option value="Plano Prata (200 Músicas)">Plano Prata (200 Músicas) — R$ 34,90/mês</option>
                    <option value="Plano Bronze (100 Músicas)">Plano Bronze (100 Músicas) — R$ 19,90/mês</option>
                  </select>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <span className="text-slate-400 block text-[11px]">Link direto para envio via WhatsApp ou E-mail:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/autenticacao?modo=cadastro&plano=${encodeURIComponent(invitePlan)}`}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-amber-400 font-mono flex-1 focus:outline-none"
                    />
                    <button
                      onClick={handleCopyInviteLink}
                      className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold flex items-center gap-1.5 shrink-0 transition"
                    >
                      {copiedInviteLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedInviteLink ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleManualAddSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Nome Artístico *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João Viola"
                      value={newForm.stageName}
                      onChange={e => setNewForm({ ...newForm, stageName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Nome Civil Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João Carlos da Silva"
                      value={newForm.name}
                      onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">E-mail *</label>
                    <input
                      type="email"
                      required
                      placeholder="compositor@email.com"
                      value={newForm.email}
                      onChange={e => setNewForm({ ...newForm, email: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">WhatsApp</label>
                    <input
                      type="text"
                      placeholder="(62) 99999-9999"
                      value={newForm.whatsapp}
                      onChange={e => setNewForm({ ...newForm, whatsapp: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">CPF</label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={newForm.cpf}
                      onChange={e => setNewForm({ ...newForm, cpf: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Cidade/UF</label>
                    <input
                      type="text"
                      placeholder="Goiânia - GO"
                      value={newForm.cityState}
                      onChange={e => setNewForm({ ...newForm, cityState: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Plano Inicial</label>
                    <select
                      value={newForm.planName}
                      onChange={e => {
                        const val = e.target.value;
                        const price = val.includes('Ouro') ? 54.90 : val.includes('Prata') ? 34.90 : 19.90;
                        setNewForm({ ...newForm, planName: val, monthlyValue: price });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-2 py-2"
                    >
                      <option value="Plano Ouro">Ouro (R$ 54,90)</option>
                      <option value="Plano Prata">Prata (R$ 34,90)</option>
                      <option value="Plano Bronze">Bronze (R$ 19,90)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-lg transition"
                  >
                    Cadastrar Compositor
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
