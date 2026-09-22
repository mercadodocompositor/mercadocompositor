import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { isDateWithinPeriod } from '../../lib/dateUtils';

export type DateFilterPreset = 'all' | 'today' | '7d' | '30d' | 'month';

export interface AdminDateRangeFilterProps {
  activePreset: DateFilterPreset;
  onPresetChange: (preset: DateFilterPreset) => void;
}

export const AdminDateRangeFilter: React.FC<AdminDateRangeFilterProps> = ({
  activePreset,
  onPresetChange
}) => {
  const presets: { id: DateFilterPreset; label: string }[] = [
    { id: 'all', label: 'Todo o Período' },
    { id: 'today', label: 'Hoje' },
    { id: '7d', label: 'Últimos 7 dias' },
    { id: '30d', label: 'Últimos 30 dias' },
    { id: 'month', label: 'Este Mês' }
  ];

  return (
    <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
      <Calendar className="w-3.5 h-3.5 text-slate-500 ml-2" />
      <select
        value={activePreset}
        onChange={e => onPresetChange(e.target.value as DateFilterPreset)}
        aria-label="Filtrar por período"
        className="bg-transparent text-slate-300 font-semibold pr-2 py-1 text-xs focus:outline-none focus:text-white cursor-pointer"
      >
        {presets.map(p => (
          <option key={p.id} value={p.id} className="bg-slate-900 text-white">
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export function filterByDatePreset(dateStr: string | undefined | null, preset: DateFilterPreset): boolean {
  return isDateWithinPeriod(dateStr, preset);
}
