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
    textClass: 'text-emerald-600 dark:text-emerald-400',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300',
    panelClass: 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200',
  },
  pending: {
    label: 'Nenhuma assinatura ativa',
    shortLabel: 'Plano ainda não contratado',
    description: 'O plano foi apenas selecionado. Nenhuma assinatura ou cobrança está ativa.',
    nextStep: 'Inicie os 7 dias grátis para liberar o catálogo público.',
    textClass: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'border-amber-500/40 bg-amber-500/20 text-amber-300',
    panelClass: 'border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200',
  },
  suspended: {
    label: 'Assinatura suspensa',
    shortLabel: 'Plano suspenso',
    description: 'Seus dados continuam disponíveis no painel, mas o perfil público e as músicas estão ocultos.',
    nextStep: 'Regularize a assinatura com o suporte para restaurar a visibilidade.',
    textClass: 'text-red-600 dark:text-red-400',
    badgeClass: 'border-red-500/40 bg-red-500/20 text-red-300',
    panelClass: 'border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200',
  },
  cancelled: {
    label: 'Assinatura cancelada',
    shortLabel: 'Plano cancelado',
    description: 'A cobrança foi encerrada e seu catálogo não está disponível publicamente.',
    nextStep: 'Solicite a reativação para voltar a publicar o catálogo.',
    textClass: 'text-slate-600 dark:text-slate-400',
    badgeClass: 'border-slate-700 bg-slate-800 text-slate-300',
    panelClass: 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-200',
  },
};
