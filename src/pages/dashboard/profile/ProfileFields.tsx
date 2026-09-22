import React from 'react';
import { AlertCircle, Eye, Lock } from 'lucide-react';
import type { FieldErrors } from './profileFormUtils';

export const VisibilityBadge: React.FC<{ visibility: 'public' | 'private' }> = ({ visibility }) => (
  visibility === 'public' ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-full shrink-0">
      <Eye className="w-3 h-3" aria-hidden="true" /> Público
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full shrink-0">
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
  <div className="border-b border-slate-800 pb-3 flex items-start justify-between gap-3">
    <div>
      <div className="flex items-center gap-2">
        {icon}
        <h2 id={titleId} className="font-bold text-white text-base">{title}</h2>
      </div>
      <p className="text-xs text-slate-400 mt-0.5">{description}</p>
    </div>
    <VisibilityBadge visibility={visibility} />
  </div>
);

export const getInputClass = (errors: FieldErrors, key: string, extra = '') =>
  `mt-1.5 w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 transition ${
    errors[key]
      ? 'border-red-500 ring-2 ring-red-500/20 bg-red-950/20'
      : 'border-slate-800 focus:border-amber-500'
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
    <p id={errorId(name)} className="mt-1.5 text-xs text-red-400 font-semibold flex items-center gap-1.5 animate-fadeIn">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" aria-hidden="true" />
      <span>{errors[name]}</span>
    </p>
  );
};

export const FieldHint: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <p id={id} className="text-xs text-slate-500 mt-1">{children}</p>
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
      {required && <span aria-hidden="true" className="text-amber-400">*</span>}
    </>
  );
  const className = 'text-xs font-semibold text-slate-300 flex items-center gap-1.5';
  return htmlFor
    ? <label htmlFor={htmlFor} id={id} className={className}>{content}</label>
    : <span id={id} className={className}>{content}</span>;
};
