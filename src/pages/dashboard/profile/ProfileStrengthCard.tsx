import React from 'react';
import { ChevronRight, Flame } from 'lucide-react';
import { focusField, type ProfileCheck } from './profileFormUtils';

interface ProfileStrengthCardProps {
  checks: ProfileCheck[];
  completionPercentage: number;
}

const toneFor = (percentage: number) =>
  percentage === 100
    ? { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', bar: 'bg-gradient-to-r from-emerald-500 to-teal-400' }
    : percentage >= 70
      ? { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30', bar: 'bg-gradient-to-r from-amber-500 to-emerald-400' }
      : { badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30', bar: 'bg-gradient-to-r from-orange-500 to-amber-400' };

export const ProfileStrengthCard: React.FC<ProfileStrengthCardProps> = ({ checks, completionPercentage }) => {
  const tone = toneFor(completionPercentage);
  const pending = checks.filter(check => !check.done);

  return (
    <section
      aria-label="Indicador de Força do Perfil"
      className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0 ${tone.badge}`}>
          <Flame className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-white">Força do Perfil</h2>
            <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${tone.badge}`}>
              {completionPercentage}% concluído
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {completionPercentage === 100
              ? 'Parabéns! Seu perfil está completo e pronto para gerar negócios com artistas.'
              : 'Complete os itens abaixo para tornar sua vitrine mais profissional e fechar liberações.'}
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Conclusão do perfil"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completionPercentage}
        className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800/80"
      >
        <div
          className={`h-full transition-all duration-500 rounded-full ${tone.bar}`}
          style={{ width: `${completionPercentage}%` }}
        />
      </div>

      {pending.length > 0 && (
        <div className="pt-1">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            O que falta para chegar a 100%
          </h3>
          <ul className="flex flex-wrap gap-2">
            {pending.map(check => (
              <li key={check.id}>
                <button
                  type="button"
                  onClick={() => focusField(check.target)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 text-slate-300 hover:text-white text-xs transition group focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber-400 group-hover:scale-125 transition-transform" />
                  <span>{check.label}</span>
                  <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-amber-400 transition-colors" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
