import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, X, KeyRound, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useAdminToast } from './AdminToast';
import { useApp } from '../../context/AppContext';
import { ModalPortal } from '../common/ModalPortal';

export interface AdminSecurityPinDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  onSuccess: () => void;
  onCancel: () => void;
  actionLabel?: string;
}

export const AdminSecurityPinDialog: React.FC<AdminSecurityPinDialogProps> = ({
  isOpen,
  title,
  description,
  onSuccess,
  onCancel,
  actionLabel = 'Autorizar Operação'
}) => {
  const { verifyAdminPassword } = useApp();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [hasError, setHasError] = useState(false);
  const toast = useAdminToast();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setHasError(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut || isVerifying) return;

    if (!password.trim()) {
      setHasError(true);
      toast.warning('Senha Obrigatória', 'Digite a senha da sua conta de administrador para autorizar.');
      return;
    }

    setIsVerifying(true);
    try {
      // Validação real via Supabase Auth
      const isValid = await verifyAdminPassword(password.trim());

      if (isValid) {
        toast.success('Autorização Concedida', 'Operação crítica autorizada com sucesso.');
        setPassword('');
        setErrorCount(0);
        onSuccess();
      } else {
        setHasError(true);
        const nextErrors = errorCount + 1;
        setErrorCount(nextErrors);

        if (nextErrors >= 3) {
          setIsLockedOut(true);
          toast.error('Bloqueio Temporário', 'Muitas tentativas incorretas. Aguarde 15 segundos.');
          setTimeout(() => {
            setIsLockedOut(false);
            setErrorCount(0);
          }, 15000);
        } else {
          toast.error('Senha Incorreta', `Senha de administrador inválida (${3 - nextErrors} tentativas restantes).`);
        }

        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      toast.error('Erro na Validação', 'Não foi possível verificar a autenticidade da conta.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-fadeIn"
        onClick={onCancel}
      />

      {/* Security Box */}
      <div className="relative bg-slate-900 border border-amber-500/30 rounded-3xl p-5 sm:p-8 max-w-md w-full shadow-2xl space-y-6 animate-scaleUp z-10 max-h-[calc(100dvh-2rem)] overflow-y-auto touch-scroll">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Ação Crítica / Reautenticação
              </span>
              <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Cancelar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
          {description}
        </p>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 block">
              Confirme sua senha de Administrador:
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                disabled={isLockedOut || isVerifying}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setHasError(false);
                }}
                placeholder="Digite sua senha da conta"
                className={`w-full bg-slate-950 text-white pl-10 pr-10 py-3 text-sm rounded-xl border transition focus:outline-none ${
                  hasError 
                    ? 'border-rose-500 text-rose-400 shadow-lg shadow-rose-500/20' 
                    : 'border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-md'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {isLockedOut && (
              <span className="text-[11px] text-rose-400 font-medium block">
                Bloqueado temporariamente por excesso de tentativas. Aguarde 15 segundos.
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLockedOut || isVerifying}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isVerifying && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
              <span>{actionLabel}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
};
