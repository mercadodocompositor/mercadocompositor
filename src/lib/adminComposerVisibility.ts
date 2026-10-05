import type { AdminComposer } from '../types';

/** LGPD keeps pseudonymized profile rows to preserve historical contracts. */
export function isRemovedComposer(composer: Pick<AdminComposer, 'username' | 'email'>): boolean {
  return composer.username.startsWith('usuario-removido-') ||
    /^removido-.*@invalido\.local$/i.test(composer.email);
}
