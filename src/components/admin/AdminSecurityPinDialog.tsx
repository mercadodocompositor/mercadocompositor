import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, X, AlertTriangle, KeyRound } from 'lucide-react';
import { useAdminToast } from './AdminToast';

export interface AdminSecurityPinDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  correctPin?: string;
  onSuccess: () => void;
  onCancel: () => void;
  actionLabel?: string;
}

export const AdminSecurityPinDialog: React.FC<AdminSecurityPinDialogProps> = ({
  isOpen,
  title,
  description,
  correctPin = '1234',
  onSuccess,
  onCancel,
  actionLabel = 'Autorizar Operação'
}) => {
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '']);
  const [errorCount, setErrorCount] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [hasError, setHasError] = useState(false);
  const toast = useAdminToast();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setPinDigits(['', '', '', '']);
      setHasError(false);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigitChange = (index: number, value: string) => {
    if (isLockedOut) return;

    const val = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = val;
    setPinDigits(newDigits);
    setHasError(false);

    if (val && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut) return;

    const enteredPin = pinDigits.join('');
    if (enteredPin.length < 4) {
      setHasError(true);
      toast.warning('PIN Incompleto', 'Digite os 4 dígitos do PIN mestre de segurança.');
      return;
    }

    if (enteredPin === correctPin) {
      toast.success('Autorização Concedida', 'Operação crítica autorizada com sucesso.');
      onSuccess();
    } else {
      setHasError(true);
      const nextErrors = errorCount + 1;
      setErrorCount(nextErrors);

      if (nextErrors >= 3) {
        setIsLockedOut(true);
        toast.error('Bloqueio Temporário', 'Muitas tentativas incorretas. Aguarde 10 segundos.');
        setTimeout(() => {
          setIsLockedOut(false);
          setErrorCount(0);
        }, 10000);
      } else {
        toast.error('PIN Incorreto', `PIN de segurança inválido (${3 - nextErrors} tentativas restantes).`);
      }

      setPinDigits(['', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-fadeIn"
        onClick={onCancel}
      />

      {/* Security Box */}
      <div className="relative bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 animate-scaleUp z-10">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Ação Crítica / 2FA
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

        {/* PIN Digits Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 block text-center">
              Digite o PIN Master de 4 dígitos (Padrão: <span className="font-mono text-amber-400 font-bold">1234</span>):
            </label>

            <div className="flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map(index => (
                <input
                  key={index}
                  ref={el => { inputRefs.current[index] = el; }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  disabled={isLockedOut}
                  value={pinDigits[index]}
                  onChange={e => handleDigitChange(index, e.target.value)}
                  onKeyDown={e => handleKeyDown(index, e)}
                  className={`w-12 h-14 bg-slate-950 text-white text-center font-mono text-xl font-bold rounded-2xl border transition focus:outline-none ${
                    hasError 
                      ? 'border-rose-500 text-rose-400 shadow-lg shadow-rose-500/20' 
                      : 'border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-md'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                />
              ))}
            </div>
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
              disabled={isLockedOut}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              {actionLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
