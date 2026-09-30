import React from 'react';
import { AlertCircle, Check, CheckCircle2, LoaderCircle, RotateCcw, Save, X } from 'lucide-react';

export interface ProfileMessage {
  type: 'success' | 'error';
  text: string;
}

interface ProfileSaveBarProps {
  message: ProfileMessage | null;
  isSaving: boolean;
  hasChanges: boolean;
  onDismissMessage: () => void;
  onDiscard: () => void;
}

/** Barra fixa: mantém o salvar e o retorno do salvamento sempre visíveis. */
export const ProfileSaveBar: React.FC<ProfileSaveBarProps> = ({ message, isSaving, hasChanges, onDismissMessage, onDiscard }) => (
  <div className="dashboard-sticky-actions sticky z-20 rounded-2xl border border-slate-200 bg-white/95 shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-slate-950/60 backdrop-blur-md p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div aria-live="polite" className="min-w-0 flex-1">
      {message ? (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 text-sm font-semibold animate-fadeIn ${
            message.type === 'error' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {message.type === 'error'
            ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />}
          <span className="flex-1">{message.text}</span>
          <button
            type="button"
            onClick={onDismissMessage}
            aria-label="Fechar mensagem"
            className="p-0.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          {isSaving ? (
            <><LoaderCircle className="w-4 h-4 shrink-0 animate-spin text-amber-600 dark:text-amber-400" aria-hidden="true" /> Salvando perfil e enviando imagens...</>
          ) : hasChanges ? (
            <><AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" /> Você tem alterações não salvas.</>
          ) : (
            <><CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Todas as alterações estão salvas.</>
          )}
        </p>
      )}
    </div>

    <div className="flex items-center gap-2 shrink-0">
      {hasChanges && (
        <button
          type="button"
          onClick={onDiscard}
          disabled={isSaving}
          className="flex-1 sm:flex-none px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 font-bold text-sm flex items-center justify-center gap-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          <span>Descartar</span>
        </button>
      )}
      <button
        type="submit"
        disabled={!hasChanges || isSaving}
        aria-busy={isSaving || undefined}
        className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed ${
          hasChanges
            ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-xl shadow-amber-500/20 disabled:opacity-60'
            : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
        }`}
      >
        {isSaving ? (
          <><LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" /><span>Salvando...</span></>
        ) : hasChanges ? (
          <><Save className="w-4 h-4" aria-hidden="true" /><span>Salvar alterações</span></>
        ) : (
          <><Check className="w-4 h-4" aria-hidden="true" /><span>Tudo salvo</span></>
        )}
      </button>
    </div>
  </div>
);
