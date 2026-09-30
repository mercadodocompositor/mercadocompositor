import React from 'react';
import { AlertCircle, Eye, Lock } from 'lucide-react';
import type { FieldErrors } from './profileFormUtils';

export const VisibilityBadge: React.FC<{ visibility: 'public' | 'private' }> = ({ visibility }) => (
  visibility === 'public' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-sky-700 shrink-0 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
      <Eye className="w-3 h-3" aria-hidden="true" /> Público
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700 shrink-0 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
      <Lock className="w-3 h-3" aria-hidden="true" /> Privado
    </span>
  )
);

interface SectionHeaderProps {
  titleId: string;
  title: string;
  description: string;
  visibility: 'public' | 'private';
  icon?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ titleId, title, description, visibility, icon }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
    <div>
      <div className="flex items-center gap-2">
        {icon}
        <h2 id={titleId} className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white">{title}</h2>
      </div>
      <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-400">{description}</p>
    </div>
    <VisibilityBadge visibility={visibility} />
  </div>
);

export const getInputClass = (errors: FieldErrors, key: string, extra = '') =>
  `mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-medium text-slate-950 shadow-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/15 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 transition ${
    errors[key]
      ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50 dark:bg-red-950/20'
      : 'border-slate-300 hover:border-slate-400 focus:border-amber-500 dark:border-slate-700 dark:hover:border-slate-600'
  } ${extra}`;

export const errorId = (key: string) => `error-${key}`;

/**
 * Atributos de acessibilidade do controle: marca o campo como inválido e liga a
 * mensagem de erro (e, se houver, o texto de ajuda) para leitores de tela.
 */
export const fieldA11y = (errors: FieldErrors, key: string, hintId?: string) => {
  const describedBy = [errors[key] ? errorId(key) : null, hintId].filter(Boolean).join(' ');
  return {
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': describedBy || undefined
  } as const;
};

export const FieldError: React.FC<{ errors: FieldErrors; name: string }> = ({ errors, name }) => {
  if (!errors[name]) return null;
  return (
    <p id={errorId(name)} className="mt-1.5 text-xs text-red-700 dark:text-red-400 font-semibold flex items-center gap-1.5 animate-fadeIn">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{errors[name]}</span>
    </p>
  );
};

export const FieldHint: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <p id={id} className="mt-1 text-xs text-slate-600 dark:text-slate-400">{children}</p>
);

interface FieldLabelProps {
  htmlFor?: string;
  id?: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/** O asterisco é apenas visual; a obrigatoriedade chega ao leitor de tela via aria-required. */
export const FieldLabel: React.FC<FieldLabelProps> = ({ htmlFor, id, required, icon, children }) => {
  const content = (
    <>
      {icon}
      <span>{children}</span>
      {required && <span aria-hidden="true" className="text-amber-600 dark:text-amber-400">*</span>}
    </>
  );
  const className = 'flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200';
  return htmlFor
    ? <label htmlFor={htmlFor} id={id} className={className}>{content}</label>
    : <span id={id} className={className}>{content}</span>;
};
