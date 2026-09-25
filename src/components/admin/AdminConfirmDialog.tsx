import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';
import { ModalPortal } from '../common/ModalPortal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const AdminConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
  children
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Mantém a última versão de onCancel sem reinstalar os listeners a cada render.
  const cancelRef = useRef(onCancel);
  cancelRef.current = isLoading ? () => {} : onCancel;

  // Acessibilidade: Esc fecha, Tab circula só dentro da janela e, ao fechar,
  // o foco volta para o botão que abriu.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        cancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <Trash2 className="w-6 h-6 text-rose-400" />,
          iconBg: 'bg-rose-500/20 border-rose-500/30',
          confirmBtn: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-amber-400" />,
          iconBg: 'bg-amber-500/20 border-amber-500/30',
          confirmBtn: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-amber-500/30'
        };
      default:
        return {
          icon: <Info className="w-6 h-6 text-blue-400" />,
          iconBg: 'bg-blue-500/20 border-blue-500/30',
          confirmBtn: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-fadeIn"
        onClick={onCancel}
      />

      {/* Dialog Box */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative outline-none bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-5 animate-scaleUp z-10 max-h-[calc(100dvh-2rem)] overflow-y-auto touch-scroll">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${styles.iconBg}`}>
            {styles.icon}
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <h3 id={titleId} className="text-base font-bold text-white tracking-tight">{title}</h3>
            <p id={descriptionId} className="text-xs text-slate-300 mt-1 leading-relaxed">{description}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children && (
          <div className="pt-1">
            {children}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg disabled:opacity-50 flex items-center gap-2 ${styles.confirmBtn}`}
          >
            {isLoading ? (
              <>
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              <span>{confirmLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
