import React, { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';

const DISMISSED_KEY = 'dismissed_system_announcement';

/**
 * Exibe o "comunicado geral" definido pelo administrador em Configurações.
 * Sem este banner o campo era gravado no banco e nunca chegava a ninguém.
 *
 * A dispensa é por texto: quando o administrador publica um comunicado novo,
 * ele volta a aparecer para quem já havia fechado o anterior.
 */
export const SystemAnnouncementBanner: React.FC<{ message: string }> = ({ message }) => {
  const text = message.trim();
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    if (!text) return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(DISMISSED_KEY); } catch { /* storage indisponível */ }
    setIsDismissed(stored === text);
  }, [text]);

  if (!text || isDismissed) return null;

  const handleDismiss = () => {
    setIsDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, text); } catch { /* storage indisponível */ }
  };

  return (
    <aside
      role="status"
      aria-label="Comunicado da plataforma"
      className="bg-sky-600 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 relative z-40 shadow-md"
    >
      <Megaphone className="w-4 h-4 shrink-0" />
      <span className="text-center">{text}</span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dispensar comunicado"
        className="absolute right-3 p-1 rounded hover:bg-sky-700 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </aside>
  );
};
