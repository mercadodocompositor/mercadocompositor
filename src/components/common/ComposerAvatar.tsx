import React, { useEffect, useState } from 'react';
import { Music } from 'lucide-react';

interface ComposerAvatarProps {
  name: string;
  photoUrl?: string | null;
  className?: string;
}

const initialsOf = (name: string) =>
  name.split(/\s+/).map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'MC';

/**
 * Foto do compositor com moldura dourada. Sem foto, ou se a imagem falhar,
 * mostra as iniciais do nome artístico no lugar (sem manipular o DOM).
 */
export const ComposerAvatar: React.FC<ComposerAvatarProps> = ({ name, photoUrl, className = '' }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [photoUrl]);

  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <div className={`relative shrink-0 ${className}`}>
      <div className="w-full h-full p-1 sm:p-1.5 rounded-full bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-600 shadow-2xl shadow-amber-500/25 ring-4 ring-[#0A1128]">
        {showPhoto ? (
          <img
            src={photoUrl!}
            onError={() => setFailed(true)}
            alt={`Foto de ${name}`}
            className="w-full h-full rounded-full object-cover bg-slate-950"
          />
        ) : (
          <div
            role="img"
            aria-label={`Foto de ${name}`}
            className="w-full h-full rounded-full bg-gradient-to-br from-[#0A1128] via-slate-900 to-[#1E293B] flex flex-col items-center justify-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(245,158,11,0.25),transparent_70%)]" aria-hidden="true" />
            <span className="font-serif italic font-extrabold text-amber-400 text-3xl sm:text-5xl tracking-tighter relative z-10" aria-hidden="true">
              {initialsOf(name)}
            </span>
            <span className="text-[10px] sm:text-xs uppercase font-bold tracking-widest text-slate-300 mt-1 relative z-10 flex items-center gap-1" aria-hidden="true">
              <Music className="w-3 h-3 text-amber-400" /> Autor
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
