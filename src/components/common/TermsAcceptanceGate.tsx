import React, { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { loadMyTermsAcceptances, loadPlatformSettings, recordTermsAcceptance } from '../../lib/database';
import { captureException } from '../../lib/monitoring';
import { getFriendlyErrorMessage } from '../../lib/apiErrors';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ModalPortal } from './ModalPortal';

/**
 * Exige o aceite da versão vigente dos Termos antes de usar o painel.
 *
 * O cadastro por e-mail grava o aceite por trigger, a partir do metadado do
 * signUp. Quem entra com o Google não passa por esse caminho e ficava sem
 * registro; o mesmo acontece com todos quando a versão dos termos muda.
 */
export const TermsAcceptanceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUserId, logout } = useApp();
  // null = ainda conferindo, ou não foi possível conferir (não bloqueia o painel).
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Aceite obrigatório: Esc não fecha.
  const dialogRef = useModalFocus<HTMLDivElement>(Boolean(pendingVersion), () => undefined);

  useEffect(() => {
    setPendingVersion(null);
    setAccepted(false);
    setError(null);
    if (!currentUserId) return;
    let active = true;
    // A versão vem do banco nesta hora: a do contexto pode ainda ser a de fábrica.
    Promise.all([loadPlatformSettings(), loadMyTermsAcceptances(currentUserId)])
      .then(([settings, versions]) => {
        if (active && settings.termsVersion && !versions.includes(settings.termsVersion)) {
          setPendingVersion(settings.termsVersion);
        }
      })
      .catch(err => captureException(err, { operation: 'TermsAcceptanceGate.check' }));
    return () => { active = false; };
  }, [currentUserId]);

  const confirm = async () => {
    if (!pendingVersion || !accepted || saving) return;
    setSaving(true);
    setError(null);
    try {
      await recordTermsAcceptance(pendingVersion);
      setPendingVersion(null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Não foi possível registrar o aceite. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {children}
      {pendingVersion && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
            <div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="terms-gate-title"
              className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl sm:p-8"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 id="terms-gate-title" className="mt-4 text-xl font-bold text-white">Termos de Uso e Política de Privacidade</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Para continuar usando o painel, confirme que você leu e aceita a versão vigente ({pendingVersion}) dos nossos termos.
              </p>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={event => setAccepted(event.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span>
                  Li e aceito os{' '}
                  <a href="/termos" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">Termos de Uso</a>{' '}
                  e a{' '}
                  <a href="/privacidade" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">Política de Privacidade</a>.
                </span>
              </label>
              {error && (
                <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-red-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={!accepted || saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {saving ? 'Registrando...' : 'Aceitar e continuar'}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                disabled={saving}
                className="mt-3 w-full text-center text-xs text-slate-400 hover:text-white disabled:opacity-60"
              >
                Sair da conta
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
};
