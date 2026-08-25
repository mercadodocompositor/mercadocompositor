import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Bell, CheckCircle2, Lock, Shield, X } from 'lucide-react';
import { loadPreferences, savePreferences } from '../../lib/database';

const DEFAULT_PREFERENCES = {
  emailNewRequest: true,
  whatsappNewRequest: false,
  emailPayment: true,
  whatsappPayment: true,
  emailRelease: true,
  emailSubscription: true
};

type Preferences = typeof DEFAULT_PREFERENCES;

export const SettingsTab: React.FC = () => {
  const { profile } = useApp();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [savedPreferences, setSavedPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [message, setMessage] = useState<string | null>(null);
  const hasChanges = useMemo(() => JSON.stringify(preferences) !== JSON.stringify(savedPreferences), [preferences, savedPreferences]);
  useEffect(()=>{loadPreferences(DEFAULT_PREFERENCES).then(value=>{setPreferences(value);setSavedPreferences(value);}).catch(()=>setMessage('Não foi possível carregar as preferências.'));},[]);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  const setPreference = (key: keyof Preferences, value: boolean) => setPreferences(current => ({ ...current, [key]: value }));

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    await savePreferences(preferences);
    setSavedPreferences(preferences);
    setMessage('Preferências salvas neste navegador. Os envios serão ativados quando os canais forem integrados ao backend.');
    window.setTimeout(() => setMessage(null), 4000);
  };

  const rows: Array<{ key: keyof Preferences; title: string; description: string; channel: string }> = [
    { key: 'emailNewRequest', title: 'Nova solicitação', description: 'Aviso quando um intérprete demonstrar interesse.', channel: 'E-mail' },
    { key: 'whatsappNewRequest', title: 'Nova solicitação', description: 'Aviso quando um intérprete demonstrar interesse.', channel: 'WhatsApp' },
    { key: 'emailPayment', title: 'Pagamento confirmado', description: 'Atualização sobre pagamentos registrados.', channel: 'E-mail' },
    { key: 'whatsappPayment', title: 'Pagamento confirmado', description: 'Atualização sobre pagamentos registrados.', channel: 'WhatsApp' },
    { key: 'emailRelease', title: 'Liberação emitida', description: 'Confirmação de novos documentos demonstrativos.', channel: 'E-mail' },
    { key: 'emailSubscription', title: 'Assinatura', description: 'Avisos sobre cobrança e situação do plano.', channel: 'E-mail' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <header className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
        <h1 className="text-2xl font-extrabold text-white">Configurações da Conta</h1>
        <p className="text-xs text-slate-400 mt-1">Preferências de notificação e segurança da conta.</p>
      </header>

      {message && <div role="status" className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold flex items-center gap-3"><CheckCircle2 className="w-5 h-5" /><span className="flex-1">{message}</span><button type="button" onClick={() => setMessage(null)} aria-label="Fechar aviso"><X className="w-4 h-4" /></button></div>}

      <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="border-b border-slate-800 pb-3"><h2 className="font-bold text-white flex items-center gap-2"><Bell className="w-5 h-5 text-amber-400" />Notificações</h2><p className="text-xs text-slate-400 mt-1">As escolhas são salvas localmente. O envio real depende da futura integração dos canais.</p></div>
        <div className="divide-y divide-slate-800">
          {rows.map(row => <label key={row.key} className="py-4 flex items-center justify-between gap-4 cursor-pointer"><div><strong className="text-white text-sm block">{row.title} <span className="text-[10px] text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5 ml-1">{row.channel}</span></strong><span className="text-xs text-slate-400">{row.description}</span></div><input type="checkbox" checked={preferences[row.key]} onChange={event => setPreference(row.key, event.target.checked)} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500" /></label>)}
        </div>
        <button type="submit" disabled={!hasChanges} className="px-6 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed">{hasChanges ? 'Salvar preferências' : 'Preferências atualizadas'}</button>
      </form>

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h2 className="font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3"><Lock className="w-5 h-5 text-amber-400" />Segurança e sessão</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs"><div className="bg-slate-950 border border-slate-800 rounded-2xl p-4"><span className="text-slate-500 block">Conta atual</span><strong className="text-white block mt-1">{profile.email}</strong></div><div className="bg-slate-950 border border-slate-800 rounded-2xl p-4"><span className="text-slate-500 block">Dados</span><strong className="text-white block mt-1">Protegidos pelo Supabase</strong></div></div>
        <p className="text-xs text-slate-400 flex gap-2"><Shield className="w-4 h-4 text-slate-500 shrink-0" />A autenticação e a recuperação de senha são protegidas pelo Supabase Auth.</p>
      </section>
    </div>
  );
};
