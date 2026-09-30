import React, { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, LoaderCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { captureException } from '../../lib/monitoring';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ModalPortal } from './ModalPortal';

/**
 * Pede o código do aplicativo autenticador a quem ativou a verificação em duas
 * etapas. Sem isto o fator era cadastrado em Configurações e nunca exigido: o
 * login só com senha entrava direto no painel.
 */
export const MfaChallengeGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUserId, logout } = useApp();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Verificação obrigatória: Esc não fecha.
  const dialogRef = useModalFocus<HTMLDivElement>(Boolean(factorId), () => undefined);

  useEffect(() => {
    setFactorId(null);
    setCode('');
    setError(null);
    setChecked(false);
    if (!supabase || !currentUserId) { setChecked(true); return; }
    let active = true;
    void (async () => {
      try {
        const { data: level, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (levelError) throw levelError;
        if (!active || level.nextLevel !== 'aal2' || level.currentLevel === 'aal2') return;
        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const verified = factors.totp.find(factor => factor.status === 'verified');
        if (active && verified) setFactorId(verified.id);
      } catch (err) {
        captureException(err, { operation: 'MfaChallengeGate.check' });
      } finally {
        if (active) setChecked(true);
      }
    })();
    return () => { active = false; };
  }, [currentUserId]);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !factorId || verifying || !/^\d{6}$/.test(code)) return;
    setVerifying(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setVerifying(false);
    if (verifyError) {
      setCode('');
      setError('Código incorreto ou expirado. Confira o aplicativo autenticador e tente de novo.');
      return;
    }
    setFactorId(null);
    setCode('');
  };

  if (!checked) return <div className="min-h-screen bg-[#060B18]" />;

  // Enquanto o código não é confirmado, o painel não é montado.
  if (factorId) {
    return (
      <ModalPortal>
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#060B18] p-4">
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mfa-gate-title"
            className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl sm:p-8"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <KeyRound className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 id="mfa-gate-title" className="mt-4 text-xl font-bold text-white">Verificação em duas etapas</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Digite o código de 6 dígitos do seu aplicativo autenticador para entrar.
            </p>
            <form onSubmit={verify} className="mt-5 space-y-3">
              <label htmlFor="mfa-gate-code" className="block text-xs font-semibold text-slate-300">Código de 6 dígitos</label>
              <input
                id="mfa-gate-code"
                data-autofocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
                aria-invalid={Boolean(error)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-center font-mono text-lg tracking-[0.4em] text-white focus:border-amber-500 focus:outline-none"
              />
              {error && (
                <p role="alert" className="flex items-start gap-1.5 text-xs text-red-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}
              <button
                type="submit"
                disabled={verifying || code.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifying && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {verifying ? 'Verificando...' : 'Confirmar e entrar'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={verifying}
              className="mt-3 w-full text-center text-xs text-slate-400 hover:text-white disabled:opacity-60"
            >
              Sair da conta
            </button>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
              Perdeu o acesso ao aplicativo? Fale com o suporte para recuperar a conta.
            </p>
          </div>
        </div>
      </ModalPortal>
    );
  }

  return <>{children}</>;
};
