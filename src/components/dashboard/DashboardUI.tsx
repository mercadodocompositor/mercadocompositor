import React from 'react';

export const DashboardCard: React.FC<React.PropsWithChildren<{ className?: string; as?: 'div' | 'section' }>> = ({ children, className = '', as = 'section' }) => {
  const Element = as;
  return <Element className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</Element>;
};

export const DashboardSectionHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  titleId?: string;
  variant?: 'light' | 'dark';
}> = ({ title, description, action, titleId, variant = 'light' }) => (
  <div className={`flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${variant === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
    <div className="min-w-0">
      <h2 id={titleId} className={`font-serif text-lg font-bold ${variant === 'dark' ? 'text-white' : 'text-[#0A1128]'}`}>{title}</h2>
      {description && <p className={`mt-0.5 text-xs leading-relaxed ${variant === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
