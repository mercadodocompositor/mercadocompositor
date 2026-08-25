import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AdminComposer, SubscriptionStatus } from '../../types';
import { 
  Users, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  PlusCircle, 
  ExternalLink, 
  Edit, 
  Trash2, 
  Phone, 
  Mail, 
  MapPin, 
  Music, 
  Eye, 
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_CONFIG } from '../../config/appConfig';

export const AdminComposersTab: React.FC = () => {
  const navigate = useNavigate();
  const { 
    adminComposers, 
    updateAdminComposerStatus, 
    toggleComposerVerified, 
    addAdminComposer,
    profile
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [selectedComposer, setSelectedComposer] = useState<AdminComposer | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Composer Form state
  const [newForm, setNewForm] = useState({
    name: '',
    stageName: '',
    email: '',
    whatsapp: '',
    cpf: '',
    cityState: '',
    username: '',
    planName: 'Plano Bronze',
    monthlyValue: 24.90,
    subscriptionStatus: 'active' as SubscriptionStatus,
    photo: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    isVerified: false,
    notes: ''
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

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.name || !newForm.email || !newForm.whatsapp || !newForm.cpf || !newForm.cityState) return;
    const username = (newForm.username || newForm.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (adminComposers.some(composer => composer.email.toLowerCase() === newForm.email.toLowerCase() || composer.username === username)) return;

    addAdminComposer({
      name: newForm.name,
      stageName: newForm.stageName || newForm.name,
      username,
      email: newForm.email,
      whatsapp: newForm.whatsapp,
      cpf: newForm.cpf,
      cityState: newForm.cityState,
      planName: newForm.planName,
      monthlyValue: Number(newForm.monthlyValue),
      subscriptionStatus: newForm.subscriptionStatus,
      photo: newForm.photo,
      isVerified: newForm.isVerified,
      notes: newForm.notes
    });

    setIsAddModalOpen(false);
    setNewForm({
      name: '',
      stageName: '',
      email: '',
      whatsapp: '',
      cpf: '',
      cityState: '',
      username: '',
      planName: 'Plano Bronze',
      monthlyValue: 24.90,
      subscriptionStatus: 'active',
      photo: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      isVerified: false,
      notes: ''
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            <span>Gestão de Compositores & Assinaturas</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Controle total sobre o status de pagamento, catálogo cadastrado e verificação de perfil de cada autor.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Cadastrar Compositor</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
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
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-white bg-slate-950'
            }`}
          >
            Todos ({adminComposers.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'active'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-400 bg-slate-950'
            }`}
          >
            Ativos ({adminComposers.filter(c => c.subscriptionStatus === 'active').length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-amber-400 bg-slate-950'
            }`}
          >
            Pendentes ({adminComposers.filter(c => c.subscriptionStatus === 'pending').length})
          </button>
          <button
            onClick={() => setStatusFilter('suspended')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              statusFilter === 'suspended'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-4 px-6">Compositor</th>
                <th className="py-4 px-6">Contato & Local</th>
                <th className="py-4 px-6">Assinatura & Plano</th>
                <th className="py-4 px-6">Desempenho</th>
                <th className="py-4 px-6 text-center">Status / Ação Rápida</th>
                <th className="py-4 px-6 text-right">Gerenciar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs">
              {filteredComposers.map(composer => (
                <tr key={composer.id} className="hover:bg-slate-800/40 transition">
                  {/* Avatar + Name */}
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <img 
                          src={composer.photo} 
                          alt={composer.name} 
                          className="w-11 h-11 rounded-xl object-cover border border-slate-700"
                        />
                        {composer.isVerified && (
                          <div className="absolute -bottom-1 -right-1 bg-amber-500 rounded-full p-0.5 text-slate-950 shadow" title="Perfil Verificado">
                            <CheckCircle2 className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm truncate">{composer.stageName}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">{composer.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">CPF: {composer.cpf}</p>
                      </div>
                    </div>
                  </td>

                  {/* Contact & Location */}
                  <td className="py-4 px-6">
                    <div className="space-y-1 text-slate-300">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">{composer.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{composer.whatsapp}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{composer.cityState}</span>
                      </div>
                    </div>
                  </td>

                  {/* Subscription & Plan */}
                  <td className="py-4 px-6">
                    <div>
                      <span className="text-white font-semibold block">{composer.planName}</span>
                      <span className="text-amber-400 font-bold text-xs block">
                        R$ {composer.monthlyValue.toFixed(2)} / mês
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Desde {composer.registeredAt}
                      </span>
                    </div>
                  </td>

                  {/* Performance */}
                  <td className="py-4 px-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Music className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-white font-bold">{composer.songCount}</span>
                        <span className="text-slate-400 text-[11px]">músicas</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {composer.totalPlays.toLocaleString('pt-BR')} audições
                      </div>
                      <div className="text-[11px] font-semibold text-emerald-400">
                        R$ {composer.revenueGenerated.toLocaleString('pt-BR')} gerados
                      </div>
                    </div>
                  </td>

                  {/* Quick Status Toggle */}
                  <td className="py-4 px-6 text-center">
                    <select
                      value={composer.subscriptionStatus}
                      onChange={e => updateAdminComposerStatus(composer.id, e.target.value as SubscriptionStatus)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border appearance-none cursor-pointer focus:outline-none transition ${
                        composer.subscriptionStatus === 'active'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : composer.subscriptionStatus === 'pending'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      <option value="active" className="bg-slate-900 text-white">Ativo</option>
                      <option value="pending" className="bg-slate-900 text-white">Pendente</option>
                      <option value="suspended" className="bg-slate-900 text-white">Suspenso</option>
                      <option value="cancelled" className="bg-slate-900 text-white">Cancelado</option>
                    </select>
                  </td>

                  {/* Action Buttons */}
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedComposer(composer)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                        title="Ver detalhes completos"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => composer.username === profile.username && navigate(`/compositor/${composer.username}`)}
                        disabled={composer.username !== profile.username}
                        className="p-2 rounded-lg bg-slate-800 enabled:hover:bg-amber-500 enabled:hover:text-slate-950 text-slate-200 border border-slate-700 transition disabled:opacity-35 disabled:cursor-not-allowed"
                        title={composer.username === profile.username ? 'Abrir perfil público' : 'Perfil público completo indisponível no protótipo local'}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => toggleComposerVerified(composer.id)}
                        className={`p-2 rounded-lg border transition ${
                          composer.isVerified 
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                        title="Alternar Selo de Verificado"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          if (window.confirm(`Deseja cancelar o acesso de ${composer.name}? O histórico será preservado.`)) {
                            updateAdminComposerStatus(composer.id, 'cancelled');
                          }
                        }}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 transition"
                        title="Cancelar acesso e preservar histórico"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <img 
                  src={selectedComposer.photo} 
                  alt={selectedComposer.name} 
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-500/40"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-white">{selectedComposer.stageName}</h3>
                    {selectedComposer.isVerified && (
                      <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/30">
                        Verificado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{selectedComposer.name} • CPF: {selectedComposer.cpf}</p>
                  <p className="text-xs text-slate-400">{selectedComposer.cityState}</p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedComposer(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Total de Obras</span>
                <p className="text-base font-bold text-white">{selectedComposer.songCount} faixas</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Audições Registradas</span>
                <p className="text-base font-bold text-purple-400">{selectedComposer.totalPlays.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Faturamento em Liberações</span>
                <p className="text-base font-bold text-emerald-400">R$ {selectedComposer.revenueGenerated.toLocaleString('pt-BR')}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <h4 className="font-bold text-white text-sm">Informações Comerciais & Contato</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">E-mail de Cadastro</span>
                  <span className="font-semibold text-white">{selectedComposer.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">WhatsApp</span>
                  <span className="font-semibold text-white">{selectedComposer.whatsapp}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Plano Contratado</span>
                  <span className="font-semibold text-amber-400">{selectedComposer.planName} (R$ {selectedComposer.monthlyValue.toFixed(2)}/mês)</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Membro desde</span>
                  <span className="font-semibold text-white">{selectedComposer.registeredAt}</span>
                </div>
              </div>
            </div>

            {selectedComposer.notes && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 block font-bold mb-1">Notas Internas do Administrador:</span>
                <p className="text-slate-300 leading-relaxed">{selectedComposer.notes}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  if (selectedComposer.username === profile.username) {
                    setSelectedComposer(null);
                    navigate(`/compositor/${selectedComposer.username}`);
                  }
                }}
                disabled={selectedComposer.username !== profile.username}
                title={selectedComposer.username === profile.username ? 'Abrir perfil público' : 'Perfil público completo indisponível no protótipo local'}
                className="px-4 py-2.5 rounded-xl bg-amber-500 enabled:hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Visualizar Perfil Público</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD COMPOSER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 md:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Cadastrar Novo Compositor</h3>
                <p className="text-xs text-slate-400">Adicione uma conta manualmente pelo painel master.</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Nome Completo *</label>
                  <input 
                    type="text" 
                    required
                    value={newForm.name}
                    onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="Ex: João da Silva Santos"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Nome Artístico</label>
                  <input 
                    type="text" 
                    required
                    value={newForm.stageName}
                    onChange={e => setNewForm({ ...newForm, stageName: e.target.value })}
                    placeholder="Ex: João Silva"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">E-mail *</label>
                  <input 
                    type="email" 
                    required
                    value={newForm.email}
                    onChange={e => setNewForm({ ...newForm, email: e.target.value })}
                    placeholder="joao@musica.com.br"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">WhatsApp *</label>
                  <input 
                    type="text" 
                    required
                    value={newForm.whatsapp}
                    onChange={e => setNewForm({ ...newForm, whatsapp: e.target.value })}
                    placeholder="(62) 99876-5432"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Plano</label>
                  <select
                    value={newForm.planName}
                    onChange={event => {
                      const plan = APP_CONFIG.plans.find(item => item.name === event.target.value) || APP_CONFIG.plans[0];
                      setNewForm({ ...newForm, planName: plan.name, monthlyValue: plan.priceValue });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {APP_CONFIG.plans.map(plan => <option key={plan.name} value={plan.name}>{plan.name} — R$ {plan.priceMonthly}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Status inicial</label>
                  <select value={newForm.subscriptionStatus} onChange={event => setNewForm({ ...newForm, subscriptionStatus: event.target.value as SubscriptionStatus })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
                    <option value="active">Ativo</option><option value="pending">Pendente</option><option value="suspended">Suspenso</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">CPF *</label>
                  <input 
                    type="text" 
                    required
                    value={newForm.cpf}
                    onChange={e => setNewForm({ ...newForm, cpf: e.target.value })}
                    placeholder="123.456.789-00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Cidade / Estado *</label>
                  <input 
                    type="text" 
                    required
                    value={newForm.cityState}
                    onChange={e => setNewForm({ ...newForm, cityState: e.target.value })}
                    placeholder="Goiânia - GO"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Observações Internas</label>
                <textarea 
                  rows={2}
                  value={newForm.notes}
                  onChange={e => setNewForm({ ...newForm, notes: e.target.value })}
                  placeholder="Informações adicionais sobre o contrato do compositor..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
                >
                  Salvar Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
