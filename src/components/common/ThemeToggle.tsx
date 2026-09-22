import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme, ThemeMode } from '../../context/ThemeContext';

interface ThemeToggleProps {
  className?: string;
  variant?: 'button' | 'segmented';
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  variant = 'button',
  showLabel = false
}) => {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  if (variant === 'segmented') {
    const options: { mode: ThemeMode; label: string; icon: React.FC<{ className?: string }> }[] = [
      { mode: 'light', label: 'Claro', icon: Sun },
      { mode: 'dark', label: 'Escuro', icon: Moon },
      { mode: 'system', label: 'Automático', icon: Laptop },
    ];

    return (
      <div 
        role="radiogroup" 
        aria-label="Opções de tema da interface"
        className={`inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 ${className}`}
      >
        {options.map(opt => {
          const Icon = opt.icon;
          const isSelected = theme === opt.mode;

          return (
            <button
              key={opt.mode}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(opt.mode)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Single button toggle
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className={`relative inline-flex items-center justify-center p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/70 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer active:scale-95 ${className}`}
    >
      <span className="sr-only">
        {isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
      </span>
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 text-slate-700 dark:text-slate-300 transition-transform duration-300 -rotate-12 hover:rotate-0" />
      )}
      {showLabel && (
        <span className="ml-2 text-xs font-medium">
          {isDark ? 'Modo Claro' : 'Modo Escuro'}
        </span>
      )}
    </button>
  );
};
