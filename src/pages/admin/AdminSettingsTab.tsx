import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
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
  Percent
} from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';
import { DEFAULT_PLATFORM_SETTINGS } from '../../data/platformDefaults';

export const AdminSettingsTab: React.FC = () => {
  const { platformSettings, updatePlatformSettings, resetPlatformSettings } = useApp();

  const [formData, setFormData] = useState({
    platformName: platformSettings.platformName,
    tagline: platformSettings.tagline,
    planMonthlyPrice: platformSettings.planMonthlyPrice,
    planMaxSongs: platformSettings.planMaxSongs,
    platformFeePercentage: platformSettings.platformFeePercentage,
    supportWhatsapp: platformSettings.supportWhatsapp,
    supportEmail: platformSettings.supportEmail,
    pixKey: platformSettings.pixKey,
    maintenanceMode: platformSettings.maintenanceMode,
    systemAnnouncement: platformSettings.systemAnnouncement,
    requireApprovalForNewSongs: platformSettings.requireApprovalForNewSongs,
    termsVersion: platformSettings.termsVersion
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updatePlatformSettings({
      ...formData,
      planMonthlyPrice: Number(formData.planMonthlyPrice),
      planMaxSongs: Number(formData.planMaxSongs),
      platformFeePercentage: Number(formData.platformFeePercentage)
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
    }, 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl animate-fadeIn pb-12">
      
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <span>Configurações Globais do SaaS</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Defina canais oficiais de atendimento, chave Pix master, taxa de intermediação e comunicados da plataforma.
          </p>
        </div>

        {savedSuccess && (
          <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4" />
            <span>Configurações Salvas!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        
        {/* SECTION 1: MONETIZATION & PLANS */}
        <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-5 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Estrutura de Planos & Monetização
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {APP_CONFIG.plans.map(plan => (
              <div key={plan.name} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-1">
                <span className="text-white font-bold block text-sm">{plan.name}</span>
                <span className="text-amber-400 text-xl font-black block font-mono">
                  R$ {plan.priceMonthly}<small className="text-[10px] text-slate-400 font-normal">/mês</small>
                </span>
                <span className="text-[11px] text-slate-400 block pt-1">
                  {plan.maxSongs ? `Até ${plan.maxSongs} músicas no acervo` : 'Acervo Ilimitado + Recursos VIP'}
                </span>
              </div>
            ))}
          </div>

          <div className="max-w-xs space-y-1.5 pt-2">
            <label className="text-slate-300 font-semibold block">Taxa sobre Liberações Fonográficas (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                required
                value={formData.platformFeePercentage}
                onChange={e => setFormData({ ...formData, platformFeePercentage: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-bold font-mono focus:outline-none focus:border-amber-500"
              />
              <span className="text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 font-bold">%</span>
            </div>
            <span className="text-[10px] text-slate-400 block">
              {formData.platformFeePercentage === 0 
                ? '0% configurado = 100% do valor da liberação é repassado diretamente ao compositor.' 
                : `${formData.platformFeePercentage}% retido pela plataforma por transação.`}
            </span>
          </div>
        </div>

        {/* SECTION 2: INSTITUTIONAL & CONTACT */}
        <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-5 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Mail className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Dados Institucionais, Contato & Chave Pix Master
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold block">Nome Oficial da Plataforma</label>
              <input
                type="text"
                required
                value={formData.platformName}
                onChange={e => setFormData({ ...formData, platformName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold block">Chave Pix Master (Recebimento de Assinaturas)</label>
              <div className="relative">
                <QrCode className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={formData.pixKey}
                  onChange={e => setFormData({ ...formData, pixKey: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold block">WhatsApp de Suporte / Atendimento aos Compositores</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={formData.supportWhatsapp}
                  onChange={e => setFormData({ ...formData, supportWhatsapp: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold block">E-mail Oficial de Atendimento</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={formData.supportEmail}
                  onChange={e => setFormData({ ...formData, supportEmail: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: SYSTEM ANNOUNCEMENT & SECURITY */}
        <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-5 shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Bell className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              3. Comunicado Geral aos Usuários & Moderação
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
                  checked={formData.requireApprovalForNewSongs}
                  onChange={e => setFormData({ ...formData, requireApprovalForNewSongs: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                <div>
                  <span className="font-bold text-white block">Exigir Moderação Prévia de Obras</span>
                  <span className="text-[11px] text-slate-400">Novas músicas ficam em aprovação pendente antes de irem para o ar.</span>
                </div>
              </label>

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
            onClick={() => {
              if (window.confirm("Deseja restaurar as configurações padrão da plataforma?")) {
                resetPlatformSettings();
                setFormData({ ...DEFAULT_PLATFORM_SETTINGS });
              }
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 font-semibold flex items-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restaurar Padrão</span>
          </button>

          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Alterações Globais</span>
          </button>
        </div>
      </form>
    </div>
  );
};
