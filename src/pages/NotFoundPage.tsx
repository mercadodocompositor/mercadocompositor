import React from 'react';
import { Link } from 'react-router-dom';
import { Music2, ArrowLeft, Home } from 'lucide-react';
import { APP_CONFIG } from '../config/appConfig';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#060B18] text-white flex flex-col justify-between font-sans selection:bg-amber-500 selection:text-white">
      
      {/* Header Bar */}
      <header className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between border-b border-slate-800/80">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition">
            <img src="/logo.webp" alt={APP_CONFIG.name} className="w-full h-full object-contain" />
          </div>
          <span className="font-serif text-xl font-bold tracking-tight text-white">
            {APP_CONFIG.name}
          </span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center space-y-6 shadow-2xl animate-scaleUp">
          <div className="relative w-20 h-20 mx-auto">
            <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
              <Music2 className="w-10 h-10" />
            </div>
            <span className="absolute -top-2 -right-2 px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-mono font-bold text-xs shadow-md">
              404
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Página não encontrada
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              O endereço que você tentou acessar não existe, foi alterado ou a composição pode ter sido arquivada pelo autor.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Link
              to="/"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition"
            >
              <Home className="w-4 h-4" />
              <span>Ir para o Início</span>
            </Link>

            <button
              type="button"
              onClick={() => window.history.back()}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer Minimal */}
      <footer className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-slate-500 border-t border-slate-800/80">
        © {new Date().getFullYear()} {APP_CONFIG.name}. Todos os direitos reservados.
      </footer>
    </div>
  );
};
