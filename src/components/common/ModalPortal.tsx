import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renderiza a janela direto no <body>. Um ancestral com transform, filter,
 * backdrop-filter ou animação de transform vira bloco de contenção de
 * `position: fixed`, e o modal passa a ser centralizado na página em vez da tela.
 */
export const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  typeof document === 'undefined' ? <>{children}</> : createPortal(children, document.body);
