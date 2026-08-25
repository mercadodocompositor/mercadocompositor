import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_CONFIG } from '../../config/appConfig';
import { useApp } from '../../context/AppContext';
import { Music2, Menu, X, ArrowRight, UserCheck, Disc } from 'lucide-react';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, login } = useApp();

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

  return (
    <header className="bg-[#0A1128] border-b border-amber-500/20 sticky top-0 z-40 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform">
            <img src="/logo.webp" alt="Mercado do Compositor" className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="text-amber-400 font-serif text-lg italic tracking-tighter block leading-none">
              Mercado do
            </span>
            <span className="text-white font-serif text-lg font-bold tracking-tight block leading-none">
              Compositor
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-slate-300">
          <button 
            onClick={() => handleNavClick('como-funciona')} 
            className="hover:text-amber-400 transition-colors cursor-pointer"
          >
            Como Funciona
          </button>
          <button 
            onClick={() => handleNavClick('beneficios')} 
            className="hover:text-amber-400 transition-colors cursor-pointer"
          >
            Benefícios
          </button>
          <button 
            onClick={() => handleNavClick('compositores')} 
            className="hover:text-amber-400 transition-colors cursor-pointer"
          >
            Compositores
          </button>
          <button 
            onClick={() => handleNavClick('planos')} 
            className="hover:text-amber-400 transition-colors cursor-pointer"
          >
            Planos
          </button>
        </nav>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            to="/login"
            className="px-4 py-2 rounded-full text-slate-300 hover:text-white text-xs font-semibold hover:bg-slate-900/60 transition"
          >
            <span>Entrar</span>
          </Link>

          <Link
            to="/login?modo=register"
            className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition transform hover:-translate-y-0.5"
          >
            <span>Cadastre-se Grátis</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-300 hover:text-white bg-slate-900 border border-slate-800"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0A1128] border-b border-slate-800 px-4 pt-2 pb-6 space-y-3">
          <button
            onClick={() => handleNavClick('como-funciona')}
            className="block w-full text-left py-2 text-slate-300 hover:text-amber-400 font-medium text-sm"
          >
            Como Funciona
          </button>
          <button
            onClick={() => handleNavClick('beneficios')}
            className="block w-full text-left py-2 text-slate-300 hover:text-amber-400 font-medium text-sm"
          >
            Benefícios
          </button>
          <button
            onClick={() => handleNavClick('compositores')}
            className="block w-full text-left py-2 text-slate-300 hover:text-amber-400 font-medium text-sm"
          >
            Compositores
          </button>
          <button
            onClick={() => handleNavClick('planos')}
            className="block w-full text-left py-2 text-slate-300 hover:text-amber-400 font-medium text-sm"
          >
            Planos
          </button>

          <div className="pt-4 border-t border-slate-800 flex flex-col gap-3">
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-xl bg-slate-900 text-slate-200 font-semibold text-xs border border-slate-800 hover:border-amber-500/40"
            >
              Já tenho uma conta (Entrar)
            </Link>
            <Link
              to="/login?modo=register"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
            >
              Criar Conta Gratuita
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
