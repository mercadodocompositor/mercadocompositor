import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Componente que garante que o scroll da janela retorne ao topo
 * sempre que o usuário navegar para uma nova rota (pathname),
 * exceto quando houver uma âncora específica (#hash).
 */
export const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    const id = decodeURIComponent(hash.slice(1));
    const scrollToAnchor = () => {
      const target = document.getElementById(id);
      if (!target) return false;
      target.scrollIntoView();
      return true;
    };

    if (scrollToAnchor()) return;
    const observer = new MutationObserver(() => {
      if (scrollToAnchor()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [pathname, hash]);

  return null;
};
