import React from 'react';
import { Wrench, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const MaintenanceBanner: React.FC = () => {
  return (
    <aside 
      role="alert" 
      aria-label="Aviso de manutenção do sistema"
      className="bg-amber-500 text-slate-950 px-4 py-2.5 text-xs font-bold text-center flex items-center justify-center gap-2 relative z-50 shadow-md"
    >
      <Wrench className="w-4 h-4 shrink-0 animate-bounce" />
      <span>
        <strong>Aviso de Manutenção:</strong> A plataforma está em atualização preventiva de infraestrutura. Algumas operações podem oscilar temporariamente.
      </span>
      <Link 
        to="/autenticacao?modo=admin" 
        className="ml-2 underline text-slate-950 hover:text-slate-800 text-[11px] inline-flex items-center gap-1 shrink-0"
      >
        <span>Acesso Equipe</span>
        <ArrowRight className="w-3 h-3" />
      </Link>
    </aside>
  );
};
