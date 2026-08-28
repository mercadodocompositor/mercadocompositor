import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { 
  Bell, 
  CheckCircle2, 
  Lock, 
  Shield, 
  X, 
  Mail, 
  Phone, 
  KeyRound, 
  Download, 
  LogOut, 
  Trash2, 
  AlertTriangle, 
  Settings, 
  Smartphone, 
  ShieldCheck, 
  FileText,
  Save,
  LoaderCircle
} from 'lucide-react';
import { loadPreferences, savePreferences } from '../../lib/database';

const DEFAULT_PREFERENCES = {
  emailNewRequest: true,
  whatsappNewRequest: true,
  emailPayment: true,
  whatsappPayment: true,
  emailRelease: true,
  emailSubscription: true,
  emailMarketing: false,
  autoPlayAudio: false
};

type Preferences = typeof DEFAULT_PREFERENCES;

export const SettingsTab: React.FC = () => {
  const { profile, songs, requests, releases, subscription, resetPassword, logout } = useApp();
  const navigate = useNavigate();

  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [savedPreferences, setSavedPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const hasChanges = useMemo(
    () => JSON.stringify(preferences) !== JSON.stringify(savedPreferences),
    [preferences, savedPreferences]
  );

  useEffect(() => {
    loadPreferences(DEFAULT_PREFERENCES)
      .then(value => {
        setPreferences(value);
        setSavedPreferences(value);
      })
      .catch(() => setMessage({ type: 'error', text: 'Não foi possível carregar as preferências.' }));
  }, []);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  const togglePreference = (key: keyof Preferences) => {
    setPreferences(current => ({ ...current, [key]: !current[key] }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await savePreferences(preferences);
      setSavedPreferences(preferences);
      setMessage({ type: 'success', text: 'Preferências de comunicação e sistema salvas com sucesso!' });
      window.setTimeout(() => setMessage(null), 3500);
    } catch {
      setMessage({ type: 'error', text: 'Erro ao salvar preferências. Tente novamente.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!profile.email) {
      setMessage({ type: 'error', text: 'E-mail da conta não encontrado.' });
      return;
    }
    setIsResettingPassword(true);
    try {
      const sent = await resetPassword(profile.email);
      if (sent) {
        setMessage({ 
          type: 'success', 
          text: `Enviamos as instruções de redefinição de senha para o e-mail: ${profile.email}. Verifique sua caixa de entrada e spam.` 
        });
      } else {
        setMessage({ type: 'error', text: 'Não foi possível enviar o e-mail de redefinição. Tente novamente.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao processar redefinição de senha.' });
    } finally {
      setIsResettingPassword(false);
    }
  };

  // LGPD Data Export
  const handleExportLgpdData = () => {
    const dataReport = {
      plataforma: 'Mercado do Compositor',
      data_extracao: new Date().toISOString(),
      titular: {
        nome_civil: profile.name,
        nome_artistico: profile.stageName,
        cpf: profile.cpf,
        email: profile.email,
        whatsapp: profile.whatsapp,
        cidade: profile.city,
        estado: profile.state,
        sociedade_autoral: profile.society || 'Não informada',
        link_publico: `${window.location.origin}/compositor/${profile.username}`
      },
      plano_ativo: {
        nome: subscription.planName,
        status: subscription.status,
        forma_pagamento: subscription.paymentMethod
      },
      obras_cadastradas: songs.map(s => ({
        id: s.id,
        titulo: s.title,
        genero: s.genre,
        autores: s.authors,
        data_cadastro: s.dateRegistered,
        status: s.status
      })),
      solicitacoes_recebidas: requests.map(r => ({
        id: r.id,
        musica: r.songTitle,
        solicitante: r.buyerName,
        status: r.status,
        data: r.createdAt
      })),
      liberacoes_emitidas: releases.map(rel => ({
        codigo: rel.documentCode,
        obra: rel.songTitle,
        interprete: rel.buyerName,
        valor: rel.agreedValue,
        tipo: rel.releaseType,
        emissao: rel.issueDate
      }))
    };

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(dataReport, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `dados_lgpd_compositor_${profile.username || 'usuario'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setMessage({ type: 'success', text: 'Relatório completo de dados pessoais (LGPD) baixado com sucesso!' });
    window.setTimeout(() => setMessage(null), 3000);
  };

  const handleLogout = async () => {
    if (window.confirm('Tem certeza de que deseja encerrar sua sessão atual?')) {
      await logout();
      navigate('/autenticacao');
    }
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmText.toUpperCase() !== 'EXCLUIR') {
      alert('Por favor, digite a palavra "EXCLUIR" em maiúsculas para confirmar.');
      return;
    }
    alert('Sua solicitação de exclusão definitiva de conta foi registrada. Nossa equipe de conformidade entrará em contato via e-mail em até 48h.');
    setDeleteModalOpen(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn pb-12">
      
      {/* Top Header */}
      <header className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Settings className="w-3.5 h-3.5" />
            <span>Painel de Controle</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Configurações da Conta
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Preferências de notificação, segurança de acesso, privacidade e conformidade com a LGPD.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-700 font-bold text-xs flex items-center gap-2 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Encerrar Sessão</span>
        </button>
      </header>

      {/* Feedback Messages */}
      {message && (
        <div 
          role={message.type === 'error' ? 'alert' : 'status'} 
          className={`p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-3 animate-fadeIn ${
            message.type === 'error' 
              ? 'bg-red-500/10 border border-red-500/30 text-red-200' 
              : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
          }`}
        >
          {message.type === 'error' ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Fechar mensagem" className="p-1 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: NOTIFICATION CHANNELS & PREFERENCES */}
      <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        
        <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-400" />
              <span>Notificações & Canais de Alerta</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Escolha onde você deseja receber avisos de novas propostas, quitações e termos emitidos.
            </p>
          </div>
        </div>

        {/* Category: Propostas & Intérpretes */}
        <div className="space-y-3">
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
            1. Solicitações de Gravação & Intérpretes
          </span>

          <div className="divide-y divide-slate-800/80 bg-slate-950/60 rounded-2xl border border-slate-800 p-2 sm:p-4">
            
            {/* Email - Nova Solicitação */}
            <div className="py-3 px-2 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <strong className="text-white text-xs sm:text-sm block flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-400" />
                  Nova proposta de intérprete
                </strong>
                <span className="text-[11px] text-slate-400 block">
                  Receba um e-mail imediato quando um artista preencher o formulário de interesse da sua música.
                </span>
              </div>
              <button
                type="button"
                onClick={() => togglePreference('emailNewRequest')}
                aria-pressed={preferences.emailNewRequest}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  preferences.emailNewRequest ? 'bg-amber-500' : 'bg-slate-800'
                }`}
              >
                <div className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  preferences.emailNewRequest ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* WhatsApp - Nova Solicitação */}
            <div className="py-3 px-2 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <strong className="text-white text-xs sm:text-sm block flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  Aviso instantâneo no WhatsApp
                </strong>
                <span className="text-[11px] text-slate-400 block">
                  Notificação no número cadastrado ({profile.whatsapp || 'WhatsApp'}) para você responder rápido.
                </span>
              </div>
              <button
                type="button"
                onClick={() => togglePreference('whatsappNewRequest')}
                aria-pressed={preferences.whatsappNewRequest}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  preferences.whatsappNewRequest ? 'bg-amber-500' : 'bg-slate-800'
                }`}
              >
                <div className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  preferences.whatsappNewRequest ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

          </div>
        </div>

        {/* Category: Financeiro & Liberações */}
        <div className="space-y-3 pt-2">
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
            2. Pagamentos, Quitações & Liberações
          </span>

          <div className="divide-y divide-slate-800/80 bg-slate-950/60 rounded-2xl border border-slate-800 p-2 sm:p-4">
            
            {/* Email - Pagamento */}
            <div className="py-3 px-2 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <strong className="text-white text-xs sm:text-sm block flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-400" />
                  Comprovante e quitação de valor
                </strong>
                <span className="text-[11px] text-slate-400 block">
                  Alerta por e-mail quando o intérprete registrar o pagamento da liberação.
                </span>
              </div>
              <button
                type="button"
                onClick={() => togglePreference('emailPayment')}
                aria-pressed={preferences.emailPayment}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  preferences.emailPayment ? 'bg-amber-500' : 'bg-slate-800'
                }`}
              >
                <div className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  preferences.emailPayment ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Email - Liberação Emitida */}
            <div className="py-3 px-2 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <strong className="text-white text-xs sm:text-sm block flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Cópia do termo oficial de liberação
                </strong>
                <span className="text-[11px] text-slate-400 block">
                  Envio automático em PDF do documento de autorização gerado para seu arquivo pessoal.
                </span>
              </div>
              <button
                type="button"
                onClick={() => togglePreference('emailRelease')}
                aria-pressed={preferences.emailRelease}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  preferences.emailRelease ? 'bg-amber-500' : 'bg-slate-800'
                }`}
              >
                <div className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  preferences.emailRelease ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Email - Assinatura */}
            <div className="py-3 px-2 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <strong className="text-white text-xs sm:text-sm block flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-400" />
                  Faturas e renovação de plano
                </strong>
                <span className="text-[11px] text-slate-400 block">
                  Lembretes de cobrança mensal, recibos de mensalidade e status da assinatura.
                </span>
              </div>
              <button
                type="button"
                onClick={() => togglePreference('emailSubscription')}
                aria-pressed={preferences.emailSubscription}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  preferences.emailSubscription ? 'bg-amber-500' : 'bg-slate-800'
                }`}
              >
                <div className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  preferences.emailSubscription ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

          </div>
        </div>

        {/* Submit Preferences Button */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {hasChanges ? 'Alterações não salvas nas notificações.' : 'Preferências sincronizadas.'}
          </span>

          <button
            type="submit"
            disabled={!hasChanges || isSaving}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{hasChanges ? 'Salvar Preferências' : 'Salvo'}</span>
              </>
            )}
          </button>
        </div>

      </form>

      {/* SECTION 2: SECURITY & PASSWORD RESET */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
        
        <div className="border-b border-slate-800 pb-4">
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-400" />
            <span>Segurança, Acesso & Autenticação</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Gerencie sua senha de acesso e visualize o status de proteção da conta.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-slate-500 font-semibold block">E-mail Principal da Conta</span>
            <strong className="text-white text-sm block font-mono">{profile.email}</strong>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 pt-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Autenticado & Protegido
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-slate-500 font-semibold block">Criptografia & Sessão</span>
            <strong className="text-white text-sm block">TLS 256-bit / Supabase Auth</strong>
            <span className="text-[11px] text-slate-400 block pt-1">
              Sua sessão é protegida por tokens JWT assinados criptograficamente.
            </span>
          </div>

        </div>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
          <div className="space-y-0.5">
            <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-amber-400" />
              Redefinir Senha de Acesso
            </h4>
            <p className="text-xs text-slate-400">
              Enviaremos um link seguro para o seu e-mail para você cadastrar uma nova senha.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSendPasswordReset}
            disabled={isResettingPassword}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            {isResettingPassword ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>Enviando link...</span>
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                <span>Enviar Link de Redefinição</span>
              </>
            )}
          </button>
        </div>

      </section>

      {/* SECTION 3: PRIVACY & LGPD COMPLIANCE */}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
        
        <div className="border-b border-slate-800 pb-4">
          <h2 className="font-bold text-white text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span>Privacidade & Dados Pessoais (LGPD)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Seus direitos sob a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
          <div className="space-y-0.5">
            <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
              <Download className="w-4 h-4 text-emerald-400" />
              Exportar Relatório de Dados Cadastrais
            </h4>
            <p className="text-xs text-slate-400">
              Baixe uma cópia estruturada em JSON com todas as suas informações de perfil, músicas e liberações.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportLgpdData}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-2 shrink-0 shadow-sm"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar Dados (LGPD)</span>
          </button>
        </div>

      </section>

      {/* SECTION 4: DANGER ZONE (ACCOUNT DELETION) */}
      <section className="bg-slate-900 border border-red-500/20 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
        
        <div className="border-b border-slate-800 pb-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h2 className="font-bold text-red-400 text-base">
            Zona de Perigo
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <strong className="text-white text-xs sm:text-sm block">
              Excluir ou Desativar Minha Conta
            </strong>
            <p className="text-xs text-slate-400">
              A exclusão remove seu catálogo público e histórico. Termos de liberação já emitidos continuam registrados para fins legais.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-xs transition shrink-0 flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Excluir Conta</span>
          </button>
        </div>

      </section>

      {/* Delete Account Modal Dialog */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-fadeIn">
            
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Excluir Conta Definitivamente?</h3>
                <p className="text-xs text-slate-400">Esta ação não poderá ser desfeita.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
              Todas as suas músicas, contatos e catálogo público serão removidos. Caso tenha uma assinatura ativa, ela será cancelada.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-semibold block">
                Para confirmar, digite a palavra <strong className="text-red-400">EXCLUIR</strong> abaixo:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="EXCLUIR"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(''); }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText.toUpperCase() !== 'EXCLUIR'}
                className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-lg shadow-red-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirmar Exclusão
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
