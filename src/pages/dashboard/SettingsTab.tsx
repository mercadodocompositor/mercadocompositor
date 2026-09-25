import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { 
  Bell, 
  CheckCircle2, 
  Lock, 
  Shield, 
  X, 
  Mail, 
  KeyRound, 
  Download, 
  Trash2, 
  AlertTriangle, 
  Settings, 
  ShieldCheck, 
  FileText,
  Save,
  LoaderCircle,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Laptop
} from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';
import { beginMfaEnrollment, deleteMyAccount, exportPersonalData, listMfaFactors, loadPreferences, loadSettingsSecurityMetadata, revokeOtherSessions, savePreferences, verifyMfaEnrollment } from '../../lib/database';
import { useTheme } from '../../context/ThemeContext';
import { useModalFocus } from '../../hooks/useModalFocus';
import { maskEmail } from './settingsUtils';

const DEFAULT_PREFERENCES = {
  emailNewRequest: true,
  emailPayment: true,
  emailRelease: true,
  emailSubscription: true
};

type Preferences = typeof DEFAULT_PREFERENCES;
const withRequiredCommunications = (value: Preferences): Preferences => ({
  emailNewRequest: value.emailNewRequest !== false,
  emailPayment: true,
  emailRelease: true,
  emailSubscription: true,
});

export const SettingsTab: React.FC = () => {
  const { profile, resetPassword, updatePassword, logout } = useApp();
  const navigate = useNavigate();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [savedPreferences, setSavedPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [preferencesMessage, setPreferencesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [themeMessage, setThemeMessage] = useState('Salvo automaticamente neste dispositivo.');
  const [preferencesUpdatedAt, setPreferencesUpdatedAt] = useState<string | null>(null);
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(null);
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaEnrollment, setMfaEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isConfiguringMfa, setIsConfiguringMfa] = useState(false);
  const closeDeleteModal = () => {
    if (isDeletingAccount || accountDeleted) return;
    setDeleteModalOpen(false);
    setDeleteConfirmText('');
    setDeleteError('');
  };
  const deleteModalRef = useModalFocus<HTMLDivElement>(deleteModalOpen, closeDeleteModal);

  const hasChanges = useMemo(
    () => JSON.stringify(preferences) !== JSON.stringify(savedPreferences),
    [preferences, savedPreferences]
  );

  useEffect(() => {
    loadPreferences(DEFAULT_PREFERENCES)
      .then(value => {
        const normalized = withRequiredCommunications(value);
        setPreferences(normalized);
        setSavedPreferences(normalized);
      })
      .catch(() => setPreferencesMessage({ type: 'error', text: 'Não foi possível carregar as preferências. Tente recarregar a página.' }))
      .finally(() => setIsLoadingPreferences(false));
  }, []);

  useEffect(() => {
    Promise.all([loadSettingsSecurityMetadata(), listMfaFactors()])
      .then(([metadata, factors]) => {
        setPreferencesUpdatedAt(metadata.preferencesUpdatedAt);
        setPasswordChangedAt(metadata.passwordChangedAt);
        setMfaEnabled(factors.some(factor => factor.status === 'verified'));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  useEffect(() => {
    if (!hasChanges) return;
    const protectInternalNavigation = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.href === window.location.href || anchor.hash.startsWith('#')) return;
      if (!window.confirm('Você tem alterações de notificação não salvas. Deseja sair sem salvar?')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('click', protectInternalNavigation, true);
    return () => document.removeEventListener('click', protectInternalNavigation, true);
  }, [hasChanges]);

  const togglePreference = (key: keyof Preferences) => {
    setPreferences(current => ({ ...current, [key]: !current[key] }));
  };

  const changeTheme = (nextTheme: 'light' | 'dark' | 'system') => {
    setTheme(nextTheme);
    setThemeMessage('Tema salvo automaticamente neste dispositivo.');
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setPreferencesMessage(null);
    try {
      const normalized = withRequiredCommunications(preferences);
      await savePreferences(normalized);
      setPreferences(normalized);
      setSavedPreferences(normalized);
      setPreferencesUpdatedAt(new Date().toISOString());
      setPreferencesMessage({ type: 'success', text: 'Preferências de notificação salvas.' });
    } catch {
      setPreferencesMessage({ type: 'error', text: 'Erro ao salvar preferências. Tente novamente.' });
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

  const handleDirectPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'A nova senha deve ter no mínimo 8 caracteres.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas digitadas não coincidem.' });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const ok = await updatePassword(newPassword, currentPassword);
      if (ok) {
        setMessage({ type: 'success', text: 'Sua senha foi alterada com sucesso!' });
        setNewPassword('');
        setConfirmPassword('');
        setCurrentPassword('');
        setShowPasswordForm(false);
        setPasswordChangedAt(new Date().toISOString());
      } else {
        setMessage({ type: 'error', text: 'Não foi possível alterar a senha. Tente novamente.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro ao alterar a senha.' });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setIsRevokingSessions(true);
    try {
      await revokeOtherSessions();
      setMessage({ type: 'success', text: 'As outras sessões da sua conta foram encerradas.' });
    } catch {
      setMessage({ type: 'error', text: 'Não foi possível encerrar as outras sessões.' });
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const handleStartMfa = async () => {
    setIsConfiguringMfa(true);
    try {
      setMfaEnrollment(await beginMfaEnrollment());
    } catch {
      setMessage({ type: 'error', text: 'Não foi possível iniciar a autenticação em duas etapas.' });
    } finally {
      setIsConfiguringMfa(false);
    }
  };

  const handleVerifyMfa = async () => {
    if (!mfaEnrollment || !/^\d{6}$/.test(mfaCode)) return;
    setIsConfiguringMfa(true);
    try {
      await verifyMfaEnrollment(mfaEnrollment.factorId, mfaCode);
      setMfaEnabled(true);
      setMfaEnrollment(null);
      setMfaCode('');
      setMessage({ type: 'success', text: 'Autenticação em duas etapas ativada com sucesso.' });
    } catch {
      setMessage({ type: 'error', text: 'Código inválido ou expirado. Gere um novo código e tente novamente.' });
    } finally {
      setIsConfiguringMfa(false);
    }
  };

  const formatUpdatedAt = (value: string | null) => value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Ainda não registrado';

  // LGPD Data Export
  const handleExportLgpdData = async () => {
    setIsExportingData(true);
    try {
      const dataReport = await exportPersonalData();
      const blob = new Blob([JSON.stringify(dataReport, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = `dados_lgpd_compositor_${profile.username || 'usuario'}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Relatório completo de dados pessoais baixado com sucesso.' });
    } catch {
      setMessage({ type: 'error', text: 'Não foi possível gerar seu relatório. Tente novamente.' });
    } finally {
      setIsExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    if (deleteConfirmText.trim().toUpperCase() !== 'EXCLUIR') return;
    setIsDeletingAccount(true);
    setDeleteError('');
    try {
      await deleteMyAccount();
      setAccountDeleted(true);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir sua conta. Tente novamente.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const leaveDeletedAccount = async () => {
    await logout().catch(() => undefined);
    navigate('/', { replace: true });
  };

  return (
    <div className="settings-page max-w-4xl mx-auto space-y-6 animate-fadeIn pb-12">
      
      {/* Top Header */}
      <header className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-amber-400" />
            Configurações da Conta
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Preferências de notificação, segurança de acesso, privacidade e conformidade com a LGPD.
          </p>
        </div>

      </header>

      <nav aria-label="Seções das configurações" className="sticky top-20 z-20 flex gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/95 p-2 shadow-lg backdrop-blur-md">
        {[
          ['aparencia', 'Aparência'], ['notificacoes', 'Notificações'], ['seguranca', 'Segurança'],
          ['privacidade', 'Privacidade'], ['conta', 'Conta']
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="min-h-11 shrink-0 rounded-xl px-4 py-3 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
            {label}
          </a>
        ))}
      </nav>

      {/* Feedback Messages */}
      {message && (
        <div 
          role={message.type === 'error' ? 'alert' : 'status'} 
          className={`p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-3 shadow-xs animate-fadeIn ${
            message.type === 'error' 
              ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-200' 
              : 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          {message.type === 'error' ? <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400" /> : <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
          <span className="flex-1">{message.text}</span>
          <button 
            type="button" 
            onClick={() => setMessage(null)} 
            aria-label="Fechar mensagem" 
            className={`p-1 rounded-lg transition ${
              message.type === 'error' ? 'text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40' : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION: THEME AND APPEARANCE */}
      <section id="aparencia" className="scroll-mt-40 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-bold text-white text-base flex items-center gap-2">
              <Sun className="w-5 h-5 text-amber-400" />
              <span>Aparência & Tema do Aplicativo</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Escolha entre o modo claro, modo escuro ou sincronização automática com o seu dispositivo.
            </p>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20">
              Tema Atual: {theme === 'system' ? `Automático (${resolvedTheme === 'dark' ? 'Escuro' : 'Claro'})` : theme === 'dark' ? 'Escuro' : 'Claro'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card Claro */}
          <button
            type="button"
            onClick={() => changeTheme('light')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-full ${
              theme === 'light'
                ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
            }`}
          >
            <div className="space-y-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                theme === 'light' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'bg-slate-800/80 text-amber-400 border border-slate-700'
              }`}>
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <strong className="text-white text-sm block font-semibold">Modo Claro</strong>
                <span className="text-[11px] text-slate-400 block mt-1 leading-relaxed">
                  Fundo claro e alto contraste, ideal para ambientes bem iluminados.
                </span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">Tema diurno</span>
              {theme === 'light' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                </span>
              )}
            </div>
          </button>

          {/* Card Escuro */}
          <button
            type="button"
            onClick={() => changeTheme('dark')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-full ${
              theme === 'dark'
                ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
            }`}
          >
            <div className="space-y-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                theme === 'dark' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'bg-slate-800/80 text-amber-400 border border-slate-700'
              }`}>
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <strong className="text-white text-sm block font-semibold">Modo Escuro</strong>
                <span className="text-[11px] text-slate-400 block mt-1 leading-relaxed">
                  Tons escuros e sofisticados, excelente para compor à noite e descansar a visão.
                </span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">Tema noturno</span>
              {theme === 'dark' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                </span>
              )}
            </div>
          </button>

          {/* Card Automático */}
          <button
            type="button"
            onClick={() => changeTheme('system')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-full ${
              theme === 'system'
                ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
            }`}
          >
            <div className="space-y-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                theme === 'system' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'bg-slate-800/80 text-amber-400 border border-slate-700'
              }`}>
                <Laptop className="w-5 h-5" />
              </div>
              <div>
                <strong className="text-white text-sm block font-semibold">Automático (Sistema)</strong>
                <span className="text-[11px] text-slate-400 block mt-1 leading-relaxed">
                  Acompanha as configurações de tema do seu navegador ou sistema operacional.
                </span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-400">Preferência do sistema</span>
              {theme === 'system' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                </span>
              )}
            </div>
          </button>
        </div>
        <p role="status" className="text-right text-[11px] font-medium text-emerald-400">{themeMessage}</p>
      </section>

      {/* SECTION 1: NOTIFICATION CHANNELS & PREFERENCES */}
      <form id="notificacoes" onSubmit={handleSave} className="scroll-mt-40 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        
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

        {isLoadingPreferences && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
            <LoaderCircle className="h-4 w-4 animate-spin text-amber-400" /> Carregando suas preferências…
          </div>
        )}

        {/* Category: Propostas & Intérpretes */}
        <div className="space-y-3">
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
            Comunicações opcionais — novas propostas
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
                  Receba no endereço {maskEmail(profile.email)} quando um artista demonstrar interesse.
                </span>
              </div>
              <button
                type="button"
                onClick={() => togglePreference('emailNewRequest')}
                role="switch"
                aria-checked={preferences.emailNewRequest}
                aria-label="Receber novas propostas por e-mail"
                disabled={isLoadingPreferences}
                className={`w-11 h-11 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  preferences.emailNewRequest ? 'bg-amber-500' : 'bg-slate-800'
                }`}
              >
                <div className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  preferences.emailNewRequest ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

          </div>
        </div>

        {/* Category: Financeiro & Liberações */}
        <div className="space-y-3 pt-2">
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
            Comunicações essenciais — pagamentos e documentos
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
                  Enviado por e-mail quando você confirma o recebimento de uma negociação, com valor, intérprete e data.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked="true"
                aria-label="Avisos de pagamento obrigatórios"
                disabled
                className="w-11 h-11 flex items-center rounded-full bg-amber-500 p-1 opacity-70 shrink-0 cursor-not-allowed"
              >
                <div className="bg-slate-950 w-4 h-4 rounded-full shadow-md translate-x-5" />
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
                  Enviado a cada termo emitido, com link para baixar a cópia oficial em PDF e validar a autenticidade.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked="true"
                aria-label="Cópias dos termos de liberação obrigatórias"
                disabled
                className="w-11 h-11 flex items-center rounded-full bg-amber-500 p-1 opacity-70 shrink-0 cursor-not-allowed"
              >
                <div className="bg-slate-950 w-4 h-4 rounded-full shadow-md translate-x-5" />
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
                  Avisos essenciais sobre cobrança, recibos e alterações no status da assinatura.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked="true"
                aria-label="Faturas e avisos de assinatura obrigatórios"
                disabled
                className="w-11 h-11 flex items-center rounded-full bg-amber-500 p-1 opacity-70 shrink-0 cursor-not-allowed"
              >
                <div className="bg-slate-950 w-4 h-4 rounded-full shadow-md translate-x-5" />
              </button>
            </div>

          </div>
        </div>

        {/* Submit Preferences Button */}
        {preferencesMessage && (
          <div role={preferencesMessage.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs font-semibold ${preferencesMessage.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'}`}>
            {preferencesMessage.text}
          </div>
        )}

        <div className="pt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-400" aria-live="polite">
            {isLoadingPreferences ? 'Sincronizando preferências…' : hasChanges ? 'Alterações não salvas.' : 'Preferências sincronizadas.'}
            {!isLoadingPreferences && <span className="block text-[10px] mt-1">Última alteração: {formatUpdatedAt(preferencesUpdatedAt)}</span>}
          </span>

          <div className="flex items-center justify-end gap-2">
            {hasChanges && (
              <button type="button" onClick={() => { setPreferences(savedPreferences); setPreferencesMessage(null); }} disabled={isSaving} className="min-h-11 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-700 disabled:opacity-40">
                Descartar alterações
              </button>
            )}
            <button
              type="submit"
              disabled={isLoadingPreferences || !hasChanges || isSaving}
              className="min-h-11 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
        </div>

      </form>

      {/* SECTION 2: SECURITY & PASSWORD RESET */}
      <section id="seguranca" className="scroll-mt-40 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
        
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
            <strong className="text-white text-sm block font-mono">{maskEmail(profile.email)}</strong>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 pt-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Autenticado & Protegido
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-1">
            <span className="text-slate-500 font-semibold block">Criptografia & Sessão</span>
            <strong className="text-white text-sm block">Conexão segura e sessão autenticada</strong>
            <span className="text-[11px] text-slate-400 block pt-1">
              A conexão usa HTTPS e o acesso é protegido por tokens de sessão.
            </span>
          </div>

        </div>

        <div className="pt-2 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
            <div className="space-y-0.5">
              <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-400" />
                Segurança da Senha
              </h4>
              <p className="text-xs text-slate-400">
                Altere sua senha diretamente ou solicite um link seguro de redefinição por e-mail.
              </p>
              <p className="text-[10px] text-slate-500">Última alteração registrada: {formatUpdatedAt(passwordChangedAt)}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setShowPasswordForm(v => !v)}
                className="px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-xs border border-amber-500/30 transition flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{showPasswordForm ? 'Fechar Formulário' : 'Alterar Senha Agora'}</span>
              </button>

              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={isResettingPassword}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs border border-slate-700 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResettingPassword ? (
                  <>
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando link...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
                    <span>Enviar Link por E-mail</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showPasswordForm && (
            <form onSubmit={handleDirectPasswordChange} className="bg-slate-950/90 p-5 rounded-2xl border border-amber-500/30 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="border-b border-slate-800 pb-2">
                <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Cadastrar Nova Senha</span>
                </h5>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mínimo de 8 caracteres. Sua nova senha passará a valer imediatamente.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="current-password" className="block text-xs font-semibold text-slate-300 mb-1.5">Senha Atual</label>
                  <input
                    id="current-password"
                    type={showPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label htmlFor="new-password" className="block text-xs font-semibold text-slate-300 mb-1.5">Nova Senha</label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      aria-label={showPass ? 'Ocultar senhas' : 'Mostrar senhas'}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-300 mb-1.5">Confirmar Nova Senha</label>
                  <input
                    id="confirm-password"
                    type={showPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isUpdatingPassword ? (
                    <>
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Salvar Nova Senha</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="grid gap-4 pt-2 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white">Sessões e dispositivos</h3>
              <p className="mt-1 text-xs text-slate-400">Este navegador permanece conectado. Você pode encerrar remotamente todas as outras sessões.</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <span className="text-xs font-semibold text-emerald-400">Sessão atual protegida</span>
              <span className="text-[10px] text-slate-400">Este dispositivo</span>
            </div>
            <button type="button" onClick={handleRevokeOtherSessions} disabled={isRevokingSessions} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-700 disabled:opacity-50">
              {isRevokingSessions ? 'Encerrando sessões…' : 'Encerrar todas as outras sessões'}
            </button>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Autenticação em duas etapas</h3>
                <p className="mt-1 text-xs text-slate-400">Use um aplicativo autenticador para adicionar uma segunda verificação ao login.</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${mfaEnabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                {mfaEnabled ? 'Ativada' : 'Desativada'}
              </span>
            </div>
            {!mfaEnabled && !mfaEnrollment && (
              <button type="button" onClick={handleStartMfa} disabled={isConfiguringMfa} className="min-h-11 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
                {isConfiguringMfa ? 'Preparando…' : 'Configurar aplicativo autenticador'}
              </button>
            )}
            {mfaEnrollment && (
              <div className="space-y-3 rounded-xl border border-amber-500/30 bg-slate-900 p-3">
                <img src={mfaEnrollment.qrCode} alt="QR Code para configurar autenticação em duas etapas" className="mx-auto h-40 w-40 rounded-lg bg-white p-2" />
                <p className="break-all text-center font-mono text-[10px] text-slate-400">Chave manual: {mfaEnrollment.secret}</p>
                <label htmlFor="mfa-code" className="block text-xs font-semibold text-slate-300">Código de 6 dígitos</label>
                <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ''))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-center font-mono text-base tracking-[0.35em] text-white" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setMfaEnrollment(null); setMfaCode(''); }} className="min-h-11 flex-1 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-300">Cancelar</button>
                  <button type="button" onClick={handleVerifyMfa} disabled={isConfiguringMfa || mfaCode.length !== 6} className="min-h-11 flex-1 rounded-xl bg-amber-500 px-3 text-xs font-bold text-slate-950 disabled:opacity-50">Confirmar</button>
                </div>
              </div>
            )}
          </article>
        </div>

      </section>

      {/* SECTION 3: PRIVACY & LGPD COMPLIANCE */}
      <section id="privacidade" className="scroll-mt-40 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
        
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
              Baixe uma cópia estruturada com perfil, músicas, solicitações, liberações e preferências.
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-500">Formato JSON · tamanho calculado durante a geração</p>
          </div>

          <button
            type="button"
            onClick={handleExportLgpdData}
            disabled={isExportingData}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-2 shrink-0 shadow-sm"
          >
            {isExportingData ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-emerald-400" />}
            <span>{isExportingData ? 'Gerando relatório...' : 'Exportar Dados (LGPD)'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-800 pt-4 text-xs">
          <Link to="/privacidade" target="_blank" className="font-semibold text-amber-400 hover:underline">Política de Privacidade</Link>
          <Link to="/termos" target="_blank" className="font-semibold text-amber-400 hover:underline">Termos de Uso</Link>
          <a href={`mailto:${APP_CONFIG.company.dpoEmail}`} className="font-semibold text-amber-400 hover:underline">Falar com o encarregado de dados</a>
        </div>

      </section>

      {/* SECTION 4: DANGER ZONE (ACCOUNT DELETION) */}
      <section id="conta" className="scroll-mt-40 bg-slate-900 border border-red-500/20 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
        
        <div className="border-b border-slate-800 pb-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h2 className="font-bold text-red-400 text-base">
            Zona de Perigo
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <strong className="text-white text-xs sm:text-sm block">
              Excluir Minha Conta
            </strong>
            <p className="text-xs text-slate-400">
              Exclusão imediata e definitiva: seus dados pessoais são eliminados, suas obras saem do catálogo e a assinatura é cancelada. Termos já emitidos são preservados sem identificação pessoal.
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={event => { if (event.target === event.currentTarget) closeDeleteModal(); }}>
          <div ref={deleteModalRef} role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" tabIndex={-1} className="bg-slate-900 border border-red-500/30 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-fadeIn">
            
            {accountDeleted ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 id="delete-account-title" className="font-bold text-white text-lg">Conta excluída</h3>
                </div>
                <p id="delete-account-description" className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
                  Seus dados pessoais foram eliminados, suas obras saíram do catálogo e a assinatura foi cancelada. Enviamos uma confirmação para o seu e-mail.
                </p>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={leaveDeletedAccount}
                    data-autofocus
                    className="px-5 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-700 font-bold text-xs"
                  >
                    Ir para a página inicial
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 id="delete-account-title" className="font-bold text-white text-lg">Excluir sua conta?</h3>
                    <p className="text-xs text-slate-400">A exclusão é imediata e não pode ser desfeita.</p>
                  </div>
                </div>

                <ul id="delete-account-description" className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5 list-disc pl-8">
                  <li>Seus dados pessoais (e-mail, WhatsApp, CPF, chave Pix) são eliminados e o login deixa de funcionar.</li>
                  <li>Suas obras saem do catálogo e o perfil público passa a aparecer como “Usuário removido”.</li>
                  <li>A assinatura é cancelada agora, sem reembolso do período restante.</li>
                  <li>Negociações em aberto são encerradas e os intérpretes, avisados por e-mail.</li>
                  <li>Termos de liberação já emitidos e o histórico financeiro são mantidos sem identificação pessoal, por obrigação legal.</li>
                </ul>

                <div className="space-y-1.5">
                  <label htmlFor="delete-confirm-text" className="text-xs text-slate-300 font-semibold block">
                    Para confirmar, digite a palavra <strong className="text-red-400">EXCLUIR</strong> abaixo:
                  </label>
                  <input
                    id="delete-confirm-text"
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="EXCLUIR"
                    data-autofocus
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-red-500"
                  />
                </div>

                {deleteError && (
                  <p role="alert" className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5">
                    {deleteError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    disabled={isDeletingAccount}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'EXCLUIR'}
                    className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-lg shadow-red-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isDeletingAccount && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isDeletingAccount ? 'Excluindo...' : 'Excluir definitivamente'}</span>
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
