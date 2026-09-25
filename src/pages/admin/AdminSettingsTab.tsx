import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAdminToast } from '../../components/admin/AdminToast';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AdminSecurityPinDialog } from '../../components/admin/AdminSecurityPinDialog';
import { 
  Settings, 
  DollarSign, 
  ShieldCheck, 
  Bell, 
  Mail, 
  Phone, 
  QrCode, 
  Save, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Percent,
  KeyRound,
  Lock,
  CreditCard,
  Users,
  UserPlus,
  Trash2,
  Edit2,
  Plus,
  ShieldAlert,
  Check,
  X,
  Clock,
  FileText,
  BadgeAlert,
  LoaderCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { adminRevealPixKey } from '../../lib/database';
import { APP_CONFIG } from '../../config/appConfig';
import { DEFAULT_PLATFORM_SETTINGS } from '../../data/platformDefaults';
import type { SubscriptionPlanItem, AdminRoleType, DeletionRequestStatus, AccountDeletionRequest } from '../../types';

export const AdminSettingsTab: React.FC = () => {
  const { 
    platformSettings, 
    updatePlatformSettings, 
    resetPlatformSettings,
    subscriptionPlans,
    savePlan,
    deletePlan,
    teamMembers,
    assignTeamRole,
    revokeTeamRole,
    deletionRequests,
    deletionRequestsError,
    updateDeletionRequestStatus,
    finalizeAccountDeletion
  } = useApp();
  
  const toast = useAdminToast();

  const [activeSubTab, setActiveSubTab] = useState<'geral' | 'planos' | 'equipe' | 'lgpd'>('geral');

  // FORM 1: PLATFORM SETTINGS
  const [formData, setFormData] = useState({
    platformName: platformSettings.platformName,
    tagline: platformSettings.tagline,
    planMonthlyPrice: platformSettings.planMonthlyPrice,
    planMaxSongs: platformSettings.planMaxSongs,
    platformFeePercentage: platformSettings.platformFeePercentage,
    supportWhatsapp: platformSettings.supportWhatsapp,
    supportEmail: platformSettings.supportEmail,
    // Campo de *substituição*: vazio significa "manter a chave Pix em vigor".
    // A chave atual nunca é pré-carregada no formulário em texto claro.
    pixKey: '',
    maintenanceMode: platformSettings.maintenanceMode,
    systemAnnouncement: platformSettings.systemAnnouncement,
    // Moderação prévia removida: a obra vai ao perfil público ao ser salva.
    requireApprovalForNewSongs: false,
    termsVersion: platformSettings.termsVersion
  });

  const [revealedPixKey, setRevealedPixKey] = useState<string | null>(null);
  const [isRevealingPix, setIsRevealingPix] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [securityAction, setSecurityAction] = useState<'settings' | 'reset' | 'assign-admin' | 'revoke-admin' | 'reveal-pix' | 'finalize-lgpd'>('settings');
  const [pendingAdminEmail, setPendingAdminEmail] = useState('');
  const [isSubmittingSettings, setIsSubmittingSettings] = useState(false);

  // PLAN MANAGEMENT STATE
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanItem | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<{
    id: string;
    name: string;
    monthlyPrice: number;
    maxSongs: number | '';
    isActive: boolean;
    sortOrder: number;
    description: string;
  }>({
    id: '',
    name: '',
    monthlyPrice: 29.9,
    maxSongs: 50,
    isActive: true,
    sortOrder: 1,
    description: ''
  });

  // TEAM MANAGEMENT STATE
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<AdminRoleType>('moderator');
  const [isAssigningRole, setIsAssigningRole] = useState(false);
  const [roleToRevoke, setRoleToRevoke] = useState<{ userId: string; role: AdminRoleType; name: string } | null>(null);

  // LGPD MANAGEMENT STATE
  const [lgpdFilter, setLgpdFilter] = useState<'all' | DeletionRequestStatus>('all');
  const [activeLgpdRequest, setActiveLgpdRequest] = useState<AccountDeletionRequest | null>(null);
  const [lgpdAdminNote, setLgpdAdminNote] = useState('');
  const [targetStatus, setTargetStatus] = useState<DeletionRequestStatus>('concluida');

  useEffect(() => {
    setFormData({
      platformName: platformSettings.platformName,
      tagline: platformSettings.tagline,
      planMonthlyPrice: platformSettings.planMonthlyPrice,
      planMaxSongs: platformSettings.planMaxSongs,
      platformFeePercentage: platformSettings.platformFeePercentage,
      supportWhatsapp: platformSettings.supportWhatsapp,
      supportEmail: platformSettings.supportEmail,
      pixKey: '',
      maintenanceMode: platformSettings.maintenanceMode,
      systemAnnouncement: platformSettings.systemAnnouncement,
      // Moderação prévia removida: a obra vai ao perfil público ao ser salva.
      requireApprovalForNewSongs: false,
      termsVersion: platformSettings.termsVersion
    });
    setRevealedPixKey(null);
    // Depende do objeto inteiro (e não de `updatedAt`): o estado inicial vem de
    // DEFAULT_PLATFORM_SETTINGS, que não tem `updatedAt`, então uma linha sem
    // `updated_at` no banco deixaria o formulário preso nos padrões — e salvar
    // sobrescreveria a configuração real. `setPlatformSettings` só é chamado na
    // carga, no save e no reset, sempre com um objeto novo.
  }, [platformSettings]);

  // SUBMIT GENERAL SETTINGS
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingSettings) return;

    if (!formData.platformName.trim()) {
      toast.error('Campo Obrigatório', 'Informe o nome oficial da plataforma.');
      return;
    }

    const fee = Number(formData.platformFeePercentage);
    if (isNaN(fee) || fee < 0 || fee > 100) {
      toast.error('Taxa Inválida', 'A taxa de corretagem da plataforma deve ser um percentual entre 0% e 100%.');
      return;
    }

    const price = Number(formData.planMonthlyPrice);
    if (isNaN(price) || price < 0) {
      toast.error('Preço Inválido', 'O valor mensal padrão da assinatura não pode ser negativo.');
      return;
    }

    const maxSongs = Number(formData.planMaxSongs);
    if (isNaN(maxSongs) || maxSongs < 1) {
      toast.error('Cota Inválida', 'O limite padrão de músicas por compositor deve ser no mínimo 1.');
      return;
    }

    if (formData.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.supportEmail.trim())) {
      toast.error('E-mail Inválido', 'Informe um endereço de e-mail de suporte válido (ex.: suporte@mercadodocompositor.com.br).');
      return;
    }

    const isCriticalChange =
      formData.pixKey.trim() !== '' ||
      formData.platformFeePercentage !== platformSettings.platformFeePercentage;

    if (isCriticalChange) {
      setSecurityAction('settings');
      setIsPinDialogOpen(true);
    } else {
      applySettings();
    }
  };

  const applySettings = async () => {
    if (isSubmittingSettings) return;
    setIsSubmittingSettings(true);
    try {
      const { pixKey, ...rest } = formData;
      const newPixKey = pixKey.trim();
      const saved = await updatePlatformSettings(
        {
          ...rest,
          platformName: formData.platformName.trim(),
          planMonthlyPrice: Number(formData.planMonthlyPrice),
          planMaxSongs: Number(formData.planMaxSongs),
          platformFeePercentage: Number(formData.platformFeePercentage)
        },
        newPixKey === '' ? undefined : newPixKey
      );

      if (saved.ok) {
        toast.success('Configurações Salvas!', 'As preferências globais do SaaS foram atualizadas com sucesso.');
      } else if (saved.conflict) {
        toast.warning('Configurações desatualizadas', `${saved.error} O formulário foi recarregado com a versão em vigor; revise e salve novamente.`);
      } else {
        toast.error('Falha ao salvar', saved.error || 'As configurações anteriores foram mantidas.');
      }
    } finally {
      setIsSubmittingSettings(false);
      setIsPinDialogOpen(false);
    }
  };

  const performReset = async () => {
    const saved = await resetPlatformSettings();
    if (saved.ok) {
      toast.info('Configurações Restauradas', 'As configurações voltaram aos parâmetros de fábrica. A chave Pix master foi preservada.');
    } else if (saved.conflict) {
      toast.warning('Configurações desatualizadas', `${saved.error} A versão em vigor foi recarregada; tente restaurar novamente.`);
    } else {
      toast.error('Falha ao restaurar', saved.error || 'As configurações atuais foram mantidas.');
    }
  };

  // A chave em texto claro é buscada sob demanda: exige sessão reautenticada
  // nos últimos 5 minutos (garantida pelo diálogo de senha) e gera registro
  // na trilha de auditoria.
  const handleRevealPixKey = () => {
    if (isRevealingPix) return;
    if (revealedPixKey !== null) { setRevealedPixKey(null); return; }
    setSecurityAction('reveal-pix');
    setIsPinDialogOpen(true);
  };

  const performRevealPixKey = async () => {
    setIsRevealingPix(true);
    try {
      const key = await adminRevealPixKey();
      setRevealedPixKey(key);
      toast.warning('Chave Pix exibida', 'A consulta foi registrada na trilha de auditoria da plataforma.');
    } catch (error) {
      toast.error('Não foi possível exibir', error instanceof Error ? error.message : 'Falha ao consultar a chave Pix master.');
    } finally {
      setIsRevealingPix(false);
    }
  };

  const handleConfirmReset = () => {
    setIsConfirmResetOpen(false);
    setSecurityAction('reset');
    setIsPinDialogOpen(true);
  };

  // PLAN ACTIONS
  const handleOpenNewPlan = () => {
    setEditingPlan(null);
    setPlanForm({
      id: 'plano-' + Date.now().toString(36),
      name: '',
      monthlyPrice: 29.9,
      maxSongs: 50,
      isActive: true,
      sortOrder: (subscriptionPlans.length || 0) + 1,
      description: ''
    });
    setIsPlanModalOpen(true);
  };

  const handleOpenEditPlan = (plan: SubscriptionPlanItem) => {
    setEditingPlan(plan);
    setPlanForm({
      id: plan.id,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      maxSongs: plan.maxSongs === null ? '' : plan.maxSongs,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      description: plan.description || ''
    });
    setIsPlanModalOpen(true);
  };

  const handleSavePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPlan) return;

    if (!planForm.name.trim()) {
      toast.error('Erro de Validação', 'Informe o nome do plano.');
      return;
    }

    const price = Number(planForm.monthlyPrice);
    if (isNaN(price) || price < 0) {
      toast.error('Preço Inválido', 'O preço mensal do plano não pode ser negativo.');
      return;
    }

    if (planForm.maxSongs !== '' && (isNaN(Number(planForm.maxSongs)) || Number(planForm.maxSongs) < 1)) {
      toast.error('Limite Inválido', 'A cota máxima de músicas deve ser pelo menos 1 (ou deixe em branco para ilimitado).');
      return;
    }

    setIsSavingPlan(true);
    try {
      const payload: SubscriptionPlanItem = {
        // O nome é a chave real da tabela; o id local apenas o espelha.
        id: editingPlan ? editingPlan.id : planForm.name.trim(),
        name: planForm.name.trim(),
        monthlyPrice: price,
        maxSongs: planForm.maxSongs === '' ? null : Number(planForm.maxSongs),
        isActive: planForm.isActive,
        sortOrder: Number(planForm.sortOrder) || 1,
        description: planForm.description.trim(),
        features: editingPlan?.features || ['Acesso completo', 'Liberação eletrônica de termos']
      };

      const ok = await savePlan(payload, editingPlan?.name);
      if (ok) {
        toast.success('Plano Salvo!', `O plano "${payload.name}" foi salvo com sucesso.`);
        setIsPlanModalOpen(false);
      } else {
        toast.error('Erro ao Salvar', 'Não foi possível persistir o plano.');
      }
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleTogglePlanActive = async (plan: SubscriptionPlanItem) => {
    const updated: SubscriptionPlanItem = { ...plan, isActive: !plan.isActive };
    const ok = await savePlan(updated);
    if (ok) {
      toast.info(updated.isActive ? 'Plano Ativado' : 'Plano Desativado', `O plano "${plan.name}" agora está ${updated.isActive ? 'ativo' : 'inativo'}.`);
    }
  };

  const handleConfirmDeletePlan = async () => {
    if (!planToDelete) return;
    const ok = await deletePlan(planToDelete);
    if (ok) toast.success('Plano Excluído', 'O plano foi removido do catálogo.');
    else toast.error('Erro', 'Não foi possível excluir o plano.');
    setPlanToDelete(null);
  };

  // TEAM ACTIONS
  const performAssignRole = async (email: string) => {
    setIsAssigningRole(true);
    try {
      const res = await assignTeamRole(email, newMemberRole);
      if (res.success) {
        toast.success('Acesso Concedido!', `O usuário ${email} agora é ${newMemberRole}.`);
        setNewMemberEmail('');
        setPendingAdminEmail('');
      } else {
        toast.error('Falha na Atribuição', res.message || 'Verifique se o usuário já está cadastrado.');
      }
    } finally {
      setIsAssigningRole(false);
    }
  };

  const handleAssignRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAssigningRole) return;
    const email = newMemberEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('E-mail Inválido', 'Informe um endereço de e-mail corporativo válido (ex.: colaborador@mercadodocompositor.com.br).');
      return;
    }

    if (newMemberRole === 'admin') {
      setPendingAdminEmail(email);
      setSecurityAction('assign-admin');
      setIsPinDialogOpen(true);
      return;
    }
    await performAssignRole(email);
  };

  const handleConfirmRevokeRole = async () => {
    if (!roleToRevoke) return;
    if (roleToRevoke.role === 'admin') {
      setSecurityAction('revoke-admin');
      setIsPinDialogOpen(true);
      return;
    }
    await performRevokeRole();
  };

  const performRevokeRole = async () => {
    if (!roleToRevoke) return;
    const ok = await revokeTeamRole(roleToRevoke.userId, roleToRevoke.role);
    if (ok) toast.info('Função Revogada', `A função de ${roleToRevoke.name} foi revogada.`);
    else toast.error('Erro', 'Não foi possível revogar o acesso.');
    setRoleToRevoke(null);
  };

  const handleSecuritySuccess = async () => {
    if (securityAction === 'reset') await performReset();
    else if (securityAction === 'assign-admin') await performAssignRole(pendingAdminEmail);
    else if (securityAction === 'revoke-admin') await performRevokeRole();
    else if (securityAction === 'reveal-pix') await performRevealPixKey();
    else if (securityAction === 'finalize-lgpd') await performFinalizeLgpd();
    else await applySettings();
    setIsPinDialogOpen(false);
  };

  // LGPD ACTIONS
  const handleOpenLgpdModal = (req: AccountDeletionRequest, status: DeletionRequestStatus) => {
    setActiveLgpdRequest(req);
    setTargetStatus(status);
    setLgpdAdminNote(req.adminNotes || '');
  };

  const handleConfirmLgpdStatus = async () => {
    if (!activeLgpdRequest) return;
    // Concluir elimina dados de verdade e é irreversível: passa pelo diálogo de
    // senha, que também renova o JWT exigido pela rotina no banco.
    if (targetStatus === 'concluida') {
      setSecurityAction('finalize-lgpd');
      setIsPinDialogOpen(true);
      return;
    }
    const ok = await updateDeletionRequestStatus(activeLgpdRequest.id, targetStatus, lgpdAdminNote);
    if (ok) {
      toast.success('Solicitação Atualizada', `Status alterado para "${targetStatus}".`);
      setActiveLgpdRequest(null);
    } else {
      toast.error('Erro', 'Não foi possível atualizar a solicitação.');
    }
  };

  const performFinalizeLgpd = async () => {
    if (!activeLgpdRequest) return;
    const ok = await finalizeAccountDeletion(activeLgpdRequest.id, lgpdAdminNote);
    if (ok) {
      toast.success(
        'Exclusão Concluída',
        'Dados pessoais eliminados, perfil pseudonimizado, obras despublicadas e credenciais invalidadas.'
      );
      setActiveLgpdRequest(null);
    } else {
      toast.error('Erro', 'Não foi possível concluir a exclusão. Nenhum dado foi alterado.');
    }
  };

  const pendingLgpdCount = deletionRequests.filter(r => r.status === 'pendente').length;

  return (
    <div className="space-y-6 max-w-5xl animate-fadeIn pb-16">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-amber-400" />
            <span>Configurações & Governança da Plataforma</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Gestão operacional dos parâmetros SaaS, catálogo dinâmico de planos, equipe com níveis de acesso e conformidade LGPD.
          </p>
        </div>
      </div>

      {/* SUB-TABS NAVIGATION */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveSubTab('geral')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'geral'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Geral & Pagamentos</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('planos')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'planos'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Planos de Assinatura</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/40 font-mono">
            {subscriptionPlans.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('equipe')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'equipe'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Equipe & Permissões</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/40 font-mono">
            {teamMembers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('lgpd')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'lgpd'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Privacidade & LGPD</span>
          {pendingLgpdCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-bold animate-pulse">
              {pendingLgpdCount}
            </span>
          )}
        </button>
      </div>

      {/* ======================================================== */}
      {/* SUB-TAB 1: GERAL & PAGAMENTOS */}
      {/* ======================================================== */}
      {activeSubTab === 'geral' && (
        <form onSubmit={handleSubmit} className="space-y-6 text-xs animate-fadeIn">
          
          {/* SECTION 1: PLATFORM IDENTITY */}
          <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-5 shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                1. Identidade & Contatos Oficiais
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Nome da Plataforma</label>
                <input
                  type="text"
                  value={formData.platformName}
                  onChange={e => setFormData({ ...formData, platformName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Slogan / Tagline</label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={e => setFormData({ ...formData, tagline: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>WhatsApp de Suporte Oficial</span>
                </label>
                <input
                  type="text"
                  value={formData.supportWhatsapp}
                  onChange={e => setFormData({ ...formData, supportWhatsapp: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-400" />
                  <span>E-mail de Suporte</span>
                </label>
                <input
                  type="email"
                  value={formData.supportEmail}
                  onChange={e => setFormData({ ...formData, supportEmail: e.target.value })}
                  placeholder="suporte@mercadodocompositor.com.br"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: FINANCIAL & MONETIZATION */}
          <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-5 shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                2. Parâmetros Financeiros & Pix Master
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-amber-400" />
                  <span>Chave Pix Master (Recebimento de Taxas)</span>
                </label>

                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <span className="flex-1 text-white font-mono text-sm truncate">
                    {revealedPixKey !== null
                      ? (revealedPixKey || 'Nenhuma chave cadastrada')
                      : (platformSettings.pixKeyConfigured ? platformSettings.pixKeyMasked : 'Nenhuma chave cadastrada')}
                  </span>
                  {platformSettings.pixKeyConfigured && (
                    <button
                      type="button"
                      onClick={handleRevealPixKey}
                      disabled={isRevealingPix}
                      className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-50"
                      title={revealedPixKey !== null ? 'Ocultar chave' : 'Exibir chave completa (ação auditada)'}
                    >
                      {isRevealingPix
                        ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                        : revealedPixKey !== null ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{revealedPixKey !== null ? 'Ocultar' : 'Exibir'}</span>
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  value={formData.pixKey}
                  onChange={e => setFormData({ ...formData, pixKey: e.target.value })}
                  placeholder="Digite aqui para substituir a chave"
                  autoComplete="off"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-500">Deixe em branco para manter a chave atual. Substituir ou exibir a chave exige confirmação com a senha do administrador e fica registrado na auditoria.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-purple-400" />
                  <span>Taxa de Intermediação (%)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={formData.platformFeePercentage}
                  onChange={e => setFormData({ ...formData, platformFeePercentage: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: SYSTEM ANNOUNCEMENT & SECURITY */}
          <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-5 shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Bell className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                4. Comunicado Geral aos Usuários & Moderação
              </h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Aviso em Destaque (Banner Geral no Painel)</label>
                <textarea
                  rows={2}
                  value={formData.systemAnnouncement}
                  onChange={e => setFormData({ ...formData, systemAnnouncement: e.target.value })}
                  placeholder="Insira um comunicado que será exibido no topo do dashboard dos compositores..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white focus:outline-none focus:border-amber-500 resize-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={formData.maintenanceMode}
                    onChange={e => setFormData({ ...formData, maintenanceMode: e.target.checked })}
                    className="rounded text-rose-500 focus:ring-rose-500 w-4 h-4"
                  />
                  <div>
                    <span className="font-bold text-rose-400 block">Modo Manutenção Geral</span>
                    <span className="text-[11px] text-slate-400">Pausa novos cadastros para manutenção preventiva.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Action Save Bar */}
          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={() => setIsConfirmResetOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 font-semibold flex items-center gap-2 transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restaurar Padrão</span>
            </button>

            <button
              type="submit"
              disabled={isSubmittingSettings}
              className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
            >
              {isSubmittingSettings ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  <span>Salvando Alterações...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações Globais</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 2: DYNAMIC SUBSCRIPTION PLANS (CRUD) */}
      {/* ======================================================== */}
      {activeSubTab === 'planos' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-6 rounded-3xl">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <span>Catálogo de Planos de Assinatura</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure os planos comerciais disponíveis para os compositores, limites de obras e valores mensais.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenNewPlan}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Plano</span>
            </button>
          </div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subscriptionPlans.map(plan => (
              <div 
                key={plan.id}
                className={`p-6 rounded-3xl border transition flex flex-col justify-between ${
                  plan.isActive 
                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700' 
                    : 'bg-slate-950/60 border-slate-800/60 opacity-75'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      plan.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {plan.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">Ordem: #{plan.sortOrder}</span>
                  </div>

                  <div>
                    <h4 className="text-lg font-bold text-white">{plan.name}</h4>
                    {plan.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{plan.description}</p>
                    )}
                  </div>

                  <div className="py-2 border-y border-slate-800/80">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-slate-400">R$</span>
                      <span className="text-2xl font-extrabold text-white">{plan.monthlyPrice.toFixed(2)}</span>
                      <span className="text-xs text-slate-400">/mês</span>
                    </div>
                    <span className="text-[11px] text-amber-400 font-medium block mt-1">
                      {plan.maxSongs === null ? 'Obras Ilimitadas' : `Até ${plan.maxSongs} músicas no catálogo`}
                    </span>
                  </div>

                  {plan.features && plan.features.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {plan.features.slice(0, 3).map((feat, idx) => (
                        <li key={idx} className="text-[11px] text-slate-300 flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="line-clamp-1">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-center justify-between pt-5 border-t border-slate-800/80 mt-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTogglePlanActive(plan)}
                    className="text-[11px] font-semibold text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition"
                  >
                    {plan.isActive ? 'Desativar' : 'Ativar'}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditPlan(plan)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                      title="Editar Plano"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanToDelete(plan.id)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                      title="Excluir Plano"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* PLAN CREATE / EDIT MODAL */}
          {isPlanModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl animate-scaleUp max-h-[calc(100dvh-2rem)] overflow-y-auto touch-scroll">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-white">
                    {editingPlan ? 'Editar Plano' : 'Criar Novo Plano de Assinatura'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsPlanModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSavePlanSubmit} className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold block">Nome do Plano</label>
                    <input
                      type="text"
                      required
                      value={planForm.name}
                      onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
                      placeholder="Ex: Plano Master"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-300 font-semibold block">Preço Mensal (R$)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        required
                        value={planForm.monthlyPrice}
                        onChange={e => setPlanForm({ ...planForm, monthlyPrice: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-300 font-semibold block">Limite de Músicas</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Vazio = Ilimitado"
                        value={planForm.maxSongs}
                        onChange={e => setPlanForm({ ...planForm, maxSongs: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold block">Descrição Curta</label>
                    <input
                      type="text"
                      value={planForm.description}
                      onChange={e => setPlanForm({ ...planForm, description: e.target.value })}
                      placeholder="Resumo dos benefícios..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planForm.isActive}
                        onChange={e => setPlanForm({ ...planForm, isActive: e.target.checked })}
                        className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4"
                      />
                      <span className="text-white font-semibold">Plano Ativo</span>
                    </label>

                    <div className="space-y-1">
                      <label className="text-slate-300 font-semibold block">Ordem de Exibição</label>
                      <input
                        type="number"
                        min="1"
                        value={planForm.sortOrder}
                        onChange={e => setPlanForm({ ...planForm, sortOrder: Number(e.target.value) })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsPlanModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingPlan}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
                    >
                      {isSavingPlan ? (
                        <>
                          <LoaderCircle className="w-4 h-4 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <span>Salvar Plano</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* CONFIRM DELETE PLAN DIALOG */}
          <AdminConfirmDialog
            isOpen={Boolean(planToDelete)}
            title="Excluir este plano de assinatura?"
            description="Compositores já assinantes permanecerão com seus benefícios, mas novos usuários não poderão contratá-lo."
            confirmLabel="Sim, Excluir"
            cancelLabel="Cancelar"
            variant="danger"
            onConfirm={handleConfirmDeletePlan}
            onCancel={() => setPlanToDelete(null)}
          />
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 3: TEAM & ROLES (CRUD) */}
      {/* ======================================================== */}
      {activeSubTab === 'equipe' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Add Team Member Card */}
          <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <UserPlus className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Adicionar Membro à Equipe Administrativa
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Conceda acessos segmentados a moderadores ou analistas financeiros. O usuário deve possuir cadastro prévio na plataforma.
            </p>

            <form onSubmit={handleAssignRoleSubmit} className="flex flex-col sm:flex-row gap-3 pt-2 text-xs">
              <input
                type="email"
                required
                value={newMemberEmail}
                onChange={e => setNewMemberEmail(e.target.value)}
                placeholder="E-mail cadastrado do colaborador..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500"
              />

              <select
                value={newMemberRole}
                onChange={e => setNewMemberRole(e.target.value as AdminRoleType)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 font-semibold"
              >
                <option value="moderator">Moderador de Obras</option>
                <option value="financial">Analista Financeiro</option>
                <option value="admin">Administrador Geral</option>
              </select>

              <button
                type="submit"
                disabled={isAssigningRole}
                className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isAssigningRole ? 'Atribuindo...' : 'Conceder Acesso'}</span>
              </button>
            </form>
          </div>

          {/* Current Team Members List */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Membros Ativos ({teamMembers.length})</span>
              </h4>
            </div>

            <div className="divide-y divide-slate-800/80">
              {teamMembers.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Nenhum colaborador adicional cadastrado.
                </div>
              ) : (
                teamMembers.map(member => (
                  <div key={member.id} className="p-4 sm:p-5 flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-white text-xs sm:text-sm">{member.name || 'Membro da Equipe'}</strong>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          member.role === 'admin' 
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : member.role === 'financial'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {member.role === 'admin' ? 'Administrador Master' : member.role === 'financial' ? 'Financeiro' : 'Moderador'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono block">{member.email}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setRoleToRevoke({ userId: member.userId, role: member.role, name: member.name || member.email })}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revogar</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CONFIRM REVOKE DIALOG */}
          <AdminConfirmDialog
            isOpen={Boolean(roleToRevoke) && !(isPinDialogOpen && securityAction === 'revoke-admin')}
            title="Revogar Permissão Administrativa?"
            description={`Tem certeza que deseja retirar os privilégios de ${roleToRevoke?.role} do usuário ${roleToRevoke?.name}?`}
            confirmLabel="Sim, Revogar Acesso"
            cancelLabel="Cancelar"
            variant="danger"
            onConfirm={handleConfirmRevokeRole}
            onCancel={() => setRoleToRevoke(null)}
          />
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 4: PRIVACIDADE & LGPD DELETION (CRUD) */}
      {/* ======================================================== */}
      {activeSubTab === 'lgpd' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>Solicitações de Exclusão Definitiva de Conta (LGPD)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Conformidade com o Artigo 18 da LGPD (eliminação de dados pessoais consentidos).
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setLgpdFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  lgpdFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Todas ({deletionRequests.length})
              </button>
              <button
                type="button"
                onClick={() => setLgpdFilter('pendente')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  lgpdFilter === 'pendente' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pendentes ({pendingLgpdCount})
              </button>
              <button
                type="button"
                onClick={() => setLgpdFilter('concluida')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  lgpdFilter === 'concluida' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                Concluídas
              </button>
            </div>
          </div>

          {/* Requests List */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="divide-y divide-slate-800/80">
              {deletionRequests
                .filter(r => lgpdFilter === 'all' || r.status === lgpdFilter)
                .length === 0 ? (
                deletionRequestsError ? (
                  <div className="p-12 text-center text-xs space-y-2">
                    <AlertTriangle className="w-8 h-8 text-rose-400/60 mx-auto" />
                    <p className="text-rose-300 font-semibold">Não foi possível carregar a fila de solicitações.</p>
                    <p className="text-slate-500">
                      Pode haver solicitações pendentes não exibidas. Recarregue a página. ({deletionRequestsError})
                    </p>
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-500 text-xs space-y-2">
                    <ShieldCheck className="w-8 h-8 text-emerald-500/40 mx-auto" />
                    <p>Nenhuma solicitação de exclusão encontrada para este filtro.</p>
                  </div>
                )
              ) : (
                deletionRequests
                  .filter(r => lgpdFilter === 'all' || r.status === lgpdFilter)
                  .map(req => (
                    <div key={req.id} className="p-5 sm:p-6 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <strong className="text-white text-sm">{req.userName}</strong>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              req.status === 'pendente'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : req.status === 'em_analise'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : req.status === 'concluida'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}>
                              {req.status === 'pendente' ? 'Pendente' : req.status === 'em_analise' ? 'Em Análise' : req.status === 'concluida' ? 'Concluída' : 'Rejeitada'}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-mono">{req.userEmail}</span>
                        </div>

                        <div className="text-left sm:text-right text-[11px] text-slate-500">
                          <span>Solicitado em: {new Date(req.createdAt).toLocaleDateString('pt-BR')}</span>
                          {req.resolvedAt && (
                            <span className="block text-emerald-400/80">Resolvido em: {new Date(req.resolvedAt).toLocaleDateString('pt-BR')}</span>
                          )}
                        </div>
                      </div>

                      {req.reason && (
                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs text-slate-300">
                          <span className="text-slate-500 font-semibold block text-[10px] uppercase mb-1">Motivo Informado:</span>
                          {req.reason}
                        </div>
                      )}

                      {req.adminNotes && (
                        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/50 text-xs text-slate-400">
                          <span className="text-amber-400 font-semibold block text-[10px] uppercase mb-1">Parecer da Administração:</span>
                          {req.adminNotes}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2">
                        {req.status !== 'em_analise' && req.status !== 'concluida' && (
                          <button
                            type="button"
                            onClick={() => handleOpenLgpdModal(req, 'em_analise')}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                          >
                            Em Análise
                          </button>
                        )}
                        {req.status !== 'rejeitada' && req.status !== 'concluida' && (
                          <button
                            type="button"
                            onClick={() => handleOpenLgpdModal(req, 'rejeitada')}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
                          >
                            Rejeitar
                          </button>
                        )}
                        {req.status !== 'concluida' && req.status !== 'rejeitada' && (
                          <button
                            type="button"
                            onClick={() => handleOpenLgpdModal(req, 'concluida')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition"
                          >
                            Concluir Exclusão
                          </button>
                        )}
                      </div>
                      {req.status !== 'concluida' && (
                        <p className="text-[11px] text-slate-500 text-right">
                          Concluir elimina os dados pessoais, pseudonimiza o perfil, despublica as obras e invalida as credenciais. Termos de liberação já assinados e o histórico financeiro são retidos por obrigação legal.
                        </p>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* LGPD ACTION MODAL */}
          {activeLgpdRequest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-4 shadow-2xl animate-scaleUp">
                <h3 className="text-base font-bold text-white">
                  Confirmar alteração de status para "{targetStatus}"
                </h3>
                <p className="text-xs text-slate-400">
                  Usuário: <strong className="text-white">{activeLgpdRequest.userName}</strong> ({activeLgpdRequest.userEmail})
                </p>

                {targetStatus === 'concluida' && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1.5">
                    <p className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Ação irreversível
                    </p>
                    <ul className="text-[11px] text-rose-200/80 list-disc list-inside space-y-0.5">
                      <li>E-mail, WhatsApp, CPF e chave Pix serão eliminados.</li>
                      <li>O perfil público será pseudonimizado e as obras sairão do ar.</li>
                      <li>As credenciais de acesso serão invalidadas.</li>
                      <li>Termos de liberação assinados e o histórico financeiro são <strong>retidos</strong> por obrigação legal.</li>
                    </ul>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold text-xs block">
                    Parecer da Moderação / Justificativa (Audit Trail):
                  </label>
                  <textarea
                    rows={3}
                    value={lgpdAdminNote}
                    onChange={e => setLgpdAdminNote(e.target.value)}
                    placeholder="Descreva as providências adotadas para fins de conformidade legal..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveLgpdRequest(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmLgpdStatus}
                    className={`px-5 py-2.5 rounded-xl font-bold shadow-lg transition ${
                      targetStatus === 'concluida'
                        ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                    }`}
                  >
                    {targetStatus === 'concluida' ? 'Eliminar Dados Definitivamente' : 'Confirmar Mudança'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONFIRM RESET DIALOG */}
      <AdminConfirmDialog
        isOpen={isConfirmResetOpen}
        title="Restaurar configurações de fábrica?"
        description="Esta ação redefinirá os preços de planos, contatos oficiais e taxas para os valores padrão."
        confirmLabel="Sim, Restaurar"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={handleConfirmReset}
        onCancel={() => setIsConfirmResetOpen(false)}
      />

      {/* SECURITY PIN DIALOG FOR FINANCIAL CHANGES */}
      <AdminSecurityPinDialog
        isOpen={isPinDialogOpen}
        title={securityAction === 'reset' ? 'Restaurar configurações?' : securityAction === 'assign-admin' ? 'Conceder acesso administrativo?' : securityAction === 'revoke-admin' ? 'Revogar acesso administrativo?' : securityAction === 'reveal-pix' ? 'Exibir a Chave Pix Master?' : securityAction === 'finalize-lgpd' ? 'Concluir exclusão de conta?' : 'Alterar Chave Pix / Taxa Master?'}
        description={securityAction === 'finalize-lgpd'
          ? 'Os dados pessoais serão eliminados e o perfil pseudonimizado. A ação é irreversível. Digite a senha da sua conta para confirmar.'
          : 'Esta ação afeta parâmetros críticos ou privilégios administrativos. Digite a senha da sua conta para confirmar.'}
        actionLabel="Autorizar ação"
        onSuccess={handleSecuritySuccess}
        onCancel={() => { setIsPinDialogOpen(false); if (securityAction === 'revoke-admin') setRoleToRevoke(null); }}
      />
    </div>
  );
};
