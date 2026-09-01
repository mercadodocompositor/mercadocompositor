import type { SubscriptionStatus } from '../types';

export interface SubscriptionStatusMeta {
  label: string;
  shortLabel: string;
  description: string;
  nextStep: string;
  textClass: string;
  badgeClass: string;
  panelClass: string;
}

export const SUBSCRIPTION_STATUS_META: Record<SubscriptionStatus, SubscriptionStatusMeta> = {
  active: {
    label: 'Assinatura ativa',
    shortLabel: 'Plano ativo',
    description: 'Seu perfil e suas músicas publicadas estão visíveis no catálogo.',
    nextStep: 'Mantenha seus dados e a forma de pagamento atualizados.',
    textClass: 'text-emerald-600',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300',
    panelClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  pending: {
    label: 'Confirmação pendente',
    shortLabel: 'Confirmação pendente',
    description: 'O acesso ao painel está liberado, mas o catálogo público aguarda confirmação financeira.',
    nextStep: 'Acompanhe a confirmação ou fale com o suporte caso o pagamento já tenha sido realizado.',
    textClass: 'text-amber-600',
    badgeClass: 'border-amber-500/40 bg-amber-500/20 text-amber-300',
    panelClass: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  suspended: {
    label: 'Assinatura suspensa',
    shortLabel: 'Plano suspenso',
    description: 'Seus dados continuam disponíveis no painel, mas o perfil público e as músicas estão ocultos.',
    nextStep: 'Regularize a assinatura com o suporte para restaurar a visibilidade.',
    textClass: 'text-red-600',
    badgeClass: 'border-red-500/40 bg-red-500/20 text-red-300',
    panelClass: 'border-red-200 bg-red-50 text-red-900',
  },
  cancelled: {
    label: 'Assinatura cancelada',
    shortLabel: 'Plano cancelado',
    description: 'A cobrança foi encerrada e seu catálogo não está disponível publicamente.',
    nextStep: 'Solicite a reativação para voltar a publicar o catálogo.',
    textClass: 'text-slate-600',
    badgeClass: 'border-slate-700 bg-slate-800 text-slate-300',
    panelClass: 'border-slate-300 bg-slate-100 text-slate-900',
  },
};
