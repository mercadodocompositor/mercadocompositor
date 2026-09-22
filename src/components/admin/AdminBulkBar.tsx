import React from 'react';
import { Check, X, Trash2, Download, ShieldCheck, Sparkles, CheckCircle2, XCircle } from 'lucide-react';

export interface BulkActionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'danger' | 'secondary' | 'success';
  onClick: () => void;
  disabled?: boolean;
}

export interface AdminBulkBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkActionItem[];
  itemLabel?: string;
}

export const AdminBulkBar: React.FC<AdminBulkBarProps> = ({
  selectedCount,
  onClearSelection,
  actions,
  itemLabel = 'itens'
}) => {
  if (selectedCount <= 0) return null;

  const getVariantStyles = (variant?: BulkActionItem['variant']) => {
    switch (variant) {
      case 'primary':
        return 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-amber-500/20';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-emerald-600/20';
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-rose-600/20';
      default:
        return 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold';
    }
  };

  return (
    <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-[900] w-[calc(100%-1.5rem)] max-w-2xl animate-slideUp">
      <div className="bg-slate-900/95 backdrop-blur-md border border-amber-500/30 rounded-2xl p-3 sm:p-4 shadow-2xl shadow-black/80 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
        {/* Selection Counter & Clear */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs flex items-center justify-center font-mono shrink-0">
              {selectedCount}
            </span>
            <span className="text-xs font-semibold text-white truncate">
              {selectedCount === 1 ? `1 ${itemLabel.replace(/s$/, '')} selecionado` : `${selectedCount} ${itemLabel} selecionados`}
            </span>
          </div>

          <button
            onClick={onClearSelection}
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 hover:underline transition px-2 py-1 rounded-lg shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Desmarcar</span>
          </button>
        </div>

        {/* Actions List */}
        <div className="flex items-center gap-2 flex-wrap justify-stretch sm:justify-end w-full sm:w-auto">
          {actions.map(action => (
            <button
              key={action.id}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`flex-1 sm:flex-none justify-center px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${getVariantStyles(action.variant)}`}
            >
              {action.icon}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
