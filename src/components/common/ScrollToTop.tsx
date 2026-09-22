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
    }
  }, [pathname, hash]);

  return null;
};
