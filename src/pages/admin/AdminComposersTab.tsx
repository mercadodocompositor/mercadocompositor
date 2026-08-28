import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AdminComposer, SubscriptionStatus } from '../../types';
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
  Link as LinkIcon
} from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';

export const AdminComposersTab: React.FC = () => {
  const { 
    adminComposers, 
    updateAdminComposerStatus, 
    toggleComposerVerified, 
    deleteAdminComposer,
    addAdminComposer
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [selectedComposer, setSelectedComposer] = useState<AdminComposer | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<'invite' | 'manual'>('invite');
  const [invitePlan, setInvitePlan] = useState('Plano Ouro (Ilimitado)');
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);

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

  // Filter logic
  const filteredComposers = adminComposers.filter(composer => {
    const matchesSearch = 
      composer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      composer.stageName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      composer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      composer.cityState.toLowerCase().includes(searchTerm.toLowerCase()) ||
      composer.cpf.includes(searchTerm);

    const matchesStatus = statusFilter === 'all' || composer.subscriptionStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleCopyInviteLink = () => {
    const planSlug = encodeURIComponent(invitePlan);
    const inviteUrl = `${window.location.origin}/autenticacao?modo=cadastro&plano=${planSlug}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInviteLink(true);
    setTimeout(() => setCopiedInviteLink(false), 2500);
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name || !newForm.email || !newForm.stageName) {
      alert('Preencha os campos obrigatórios: Nome civil, Nome artístico e E-mail.');
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

    alert('Compositor adicionado com sucesso à base de dados administrativa!');
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

  const handleExportCsv = () => {
    if (filteredComposers.length === 0) return;

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

    const rows = filteredComposers.map(c => [
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
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 flex items-center gap-2 transition"
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
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, nome artístico, e-mail, cidade ou CPF..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white border border-slate-700 font-bold'
                : 'text-slate-400 hover:text-white bg-slate-950'
            }`}
          >
            Todos ({adminComposers.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'active'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                : 'text-slate-400 hover:text-emerald-400 bg-slate-950'
            }`}
          >
            Ativos ({adminComposers.filter(c => c.subscriptionStatus === 'active').length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-slate-400 hover:text-amber-400 bg-slate-950'
            }`}
          >
            Pendentes ({adminComposers.filter(c => c.subscriptionStatus === 'pending').length})
          </button>
          <button
            onClick={() => setStatusFilter('suspended')}
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

      {/* Composers Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-4">Compositor / Perfil</th>
                <th className="p-4">Contato / Localização</th>
                <th className="p-4">Plano / Valor</th>
                <th className="p-4">Status da Assinatura</th>
                <th className="p-4">Catálogo / Audições</th>
                <th className="p-4">Receita Gerada</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredComposers.map(composer => (
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
                      onChange={e => updateAdminComposerStatus(composer.id, e.target.value as SubscriptionStatus)}
                      aria-label="Status da assinatura"
                      className={`text-[11px] font-bold uppercase rounded-lg px-2.5 py-1 border transition focus:outline-none ${
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
                  <td className="p-4 text-right space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => toggleComposerVerified(composer.id)}
                      className={`p-2 rounded-lg border transition ${
                        composer.isVerified 
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                      title={composer.isVerified ? 'Remover selo de verificado' : 'Conceder selo de verificado'}
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setSelectedComposer(composer)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
                      title="Ver detalhes do compositor"
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

      {/* COMPOSER DETAILS MODAL */}
      {selectedComposer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-5 animate-fadeIn">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src={selectedComposer.photo} 
                  alt={selectedComposer.name} 
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-400"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-lg">{selectedComposer.stageName}</h3>
                    {selectedComposer.isVerified && (
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{selectedComposer.name} • {selectedComposer.cityState}</p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedComposer(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 block">E-mail</span>
                <span className="text-white font-medium">{selectedComposer.email}</span>
              </div>
              <div>
                <span className="text-slate-500 block">WhatsApp</span>
                <span className="text-white font-mono">{selectedComposer.whatsapp}</span>
              </div>
              <div>
                <span className="text-slate-500 block">CPF</span>
                <span className="text-white font-mono">{selectedComposer.cpf}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Plano Atual</span>
                <span className="text-amber-400 font-bold">{selectedComposer.planName}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
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
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / INVITE COMPOSER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Adicionar / Convidar Compositor</h3>
                <p className="text-xs text-slate-400">Envie um convite direto ou cadastre manualmente.</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAddMode('invite')}
                className={`flex-1 py-2 rounded-xl font-semibold transition ${
                  addMode === 'invite' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Link de Convite VIP
              </button>
              <button
                type="button"
                onClick={() => setAddMode('manual')}
                className={`flex-1 py-2 rounded-xl font-semibold transition ${
                  addMode === 'manual' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Cadastro Direto no Painel
              </button>
            </div>

            {addMode === 'invite' ? (
              <div className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-semibold block">Plano do Convite:</label>
                  <select
                    value={invitePlan}
                    onChange={e => setInvitePlan(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white"
                  >
                    {APP_CONFIG.plans.map(p => (
                      <option key={p.name} value={p.name}>{p.name} — R$ {p.priceMonthly}/mês</option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-slate-400 block text-[11px]">Link oficial para enviar ao compositor:</span>
                  <code className="block text-amber-300 font-mono text-[11px] break-all">
                    {window.location.origin}/autenticacao?modo=cadastro&plano={encodeURIComponent(invitePlan)}
                  </code>
                </div>

                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition"
                >
                  {copiedInviteLink ? <Check className="w-4 h-4 text-slate-950" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedInviteLink ? 'Link de Convite Copiado!' : 'Copiar Link de Convite'}</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleManualAddSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Nome Civil Completo *</label>
                  <input
                    required
                    type="text"
                    value={newForm.name}
                    onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="Ex: Carlos Eduardo Lima"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Nome Artístico *</label>
                    <input
                      required
                      type="text"
                      value={newForm.stageName}
                      onChange={e => setNewForm({ ...newForm, stageName: e.target.value })}
                      placeholder="Ex: Cadu Lima"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">E-mail *</label>
                    <input
                      required
                      type="email"
                      value={newForm.email}
                      onChange={e => setNewForm({ ...newForm, email: e.target.value })}
                      placeholder="cadu@exemplo.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">WhatsApp</label>
                    <input
                      type="tel"
                      value={newForm.whatsapp}
                      onChange={e => setNewForm({ ...newForm, whatsapp: e.target.value })}
                      placeholder="(62) 99999-0000"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Cidade / UF</label>
                    <input
                      type="text"
                      value={newForm.cityState}
                      onChange={e => setNewForm({ ...newForm, cityState: e.target.value })}
                      placeholder="Goiânia - GO"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold shadow-md"
                  >
                    Salvar Compositor
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
