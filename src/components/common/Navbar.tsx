import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_CONFIG } from '../../config/appConfig';
import { useApp } from '../../context/AppContext';
import { Menu, X, ArrowRight } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useApp();

  const handleNavClick = (id: string) => {
    setMobileMenuOpen(false);
    if (window.location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  return (
    <header className="bg-white/95 dark:bg-[#0A1128] border-b border-slate-200 dark:border-amber-500/20 sticky top-0 z-40 text-slate-900 dark:text-white backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 shadow-xs">
            <img src="/logo.webp" alt="Mercado do Compositor" width="40" height="40" decoding="async" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <span className="text-amber-600 dark:text-amber-400 font-serif text-lg italic tracking-tighter block leading-none">
              Mercado do
            </span>
            <span className="text-slate-900 dark:text-white font-serif text-lg font-bold tracking-tight block leading-none">
              Compositor
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button 
            onClick={() => handleNavClick('como-funciona')} 
            className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
          >
            Como Funciona
          </button>
          <button 
            onClick={() => handleNavClick('beneficios')} 
            className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
          >
            Benefícios
          </button>
          <Link 
            to="/compositores" 
            className="normal-case hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
          >
            Compositores
          </Link>
          <button 
            onClick={() => handleNavClick('planos')} 
            className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
          >
            Planos
          </button>
          <button 
            onClick={() => handleNavClick('faq')} 
            className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
          >
            Dúvidas
          </button>
        </nav>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-3">
          {/* Theme Toggle Button */}
          <ThemeToggle />

          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition transform hover:-translate-y-0.5"
            >
              <span>Acessar Painel</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="px-4 py-2 rounded-full text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800/60 transition"
              >
                <span>Entrar</span>
              </Link>

              <Link
                to="/cadastro"
                className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition transform hover:-translate-y-0.5"
              >
                <span>Cadastre-se Grátis</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button & Theme Toggle */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition active:scale-95"
            aria-label="Abrir menu de navegação"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Backdrop and Menu */}
      {mobileMenuOpen && (
        <>
          <div 
            className="fixed inset-0 top-20 bg-slate-950/80 backdrop-blur-sm z-30 md:hidden animate-fadeIn"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="md:hidden relative z-40 bg-white dark:bg-[#0A1128] text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 px-5 pt-3 pb-8 space-y-3 shadow-2xl animate-fadeIn transition-colors duration-200">
            <button
              onClick={() => handleNavClick('como-funciona')}
              className="block w-full text-left py-2.5 text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400 font-medium text-sm border-b border-slate-200/60 dark:border-slate-800/60"
            >
              Como Funciona
            </button>
            <button
              onClick={() => handleNavClick('beneficios')}
              className="block w-full text-left py-2.5 text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400 font-medium text-sm border-b border-slate-200/60 dark:border-slate-800/60"
            >
              Benefícios
            </button>
            <Link
              to="/compositores"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left py-2.5 text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400 font-medium text-sm border-b border-slate-200/60 dark:border-slate-800/60"
            >
              Compositores
            </Link>
            <button
              onClick={() => handleNavClick('planos')}
              className="block w-full text-left py-2.5 text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400 font-medium text-sm border-b border-slate-200/60 dark:border-slate-800/60"
            >
              Planos
            </button>
            <button
              onClick={() => handleNavClick('faq')}
              className="block w-full text-left py-2.5 text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400 font-medium text-sm border-b border-slate-200/60 dark:border-slate-800/60"
            >
              Dúvidas Frequentes (FAQ)
            </button>

            {/* Mobile Theme Selector */}
            <div className="py-2.5 flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tema da interface</span>
              <ThemeToggle variant="segmented" />
            </div>

            <div className="pt-4 flex flex-col gap-3">
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-3.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  <span>Acessar Meu Painel</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-3 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold text-sm border border-slate-200 dark:border-slate-800 hover:border-amber-500/40"
                  >
                    Já tenho uma conta (Entrar)
                  </Link>
                  <Link
                    to="/cadastro"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-3.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20"
                  >
                    Criar Conta Gratuita
                  </Link>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
};
