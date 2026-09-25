import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ModalPortal } from '../common/ModalPortal';

export interface AdminDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export const AdminDrawer: React.FC<AdminDrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = 'xl'
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getMaxWidthClass = () => {
    switch (maxWidth) {
      case 'md': return 'max-w-md';
      case 'lg': return 'max-w-lg';
      case '2xl': return 'max-w-2xl';
      case '3xl': return 'max-w-3xl';
      default: return 'max-w-xl';
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[990] overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10 w-full justify-end">
        <div 
          className={`w-full ${getMaxWidthClass()} bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col justify-between transform transition-transform ease-in-out duration-300 animate-slideLeft`}
        >
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-3 min-w-0 pr-4">
              {icon && (
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white tracking-tight truncate">{title}</h3>
                {subtitle && (
                  <p className="text-xs text-slate-400 truncate mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Fechar painel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {children}
          </div>

          {/* Optional Footer */}
          {footer && (
            <div className="p-4 sm:p-6 border-t border-slate-800 bg-slate-950/90 backdrop-blur-md sticky bottom-0 z-20">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
