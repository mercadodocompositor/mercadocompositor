import type { SubscriptionPlanItem } from '../types';
import { APP_CONFIG } from '../config/appConfig';

/**
 * Fonte única de verdade para exibir planos.
 *
 * O catálogo real vive em `subscription_plans` e é editável pelo painel
 * administrativo e alimenta as telas públicas e administrativas.
 * `APP_CONFIG.plans` só vale como fallback para o
 * modo sem Supabase (desenvolvimento/testes) e enquanto o catálogo carrega.
 */
export interface ResolvedPlan {
  name: string;
  monthlyPrice: number;
  maxSongs: number | null;
  features: string[];
  description: string;
  /** true quando veio do catálogo real do banco. */
  isFromCatalog: boolean;
}

/** `24.9` -> `"24,90"`. Aceita também as strings herdadas de `subscriptions.monthly_price`. */
export const formatMoneyBR = (value: number | string | null | undefined): string => {
  const numeric = parseMoneyBR(value);
  if (numeric === null) return '0,00';
  return numeric.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * `subscriptions.monthly_price` é uma coluna de texto que recebeu formatos
 * diferentes ao longo do tempo: `'24,90'` (default do schema e fallback do
 * integrações antigas) e `'24.90'`. Os dois
 * precisam virar o mesmo número.
 */
export const parseMoneyBR = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = value.trim().replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  // Com vírgula e ponto juntos ("1.234,56"), o ponto é separador de milhar.
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const fromConfig = (plan: (typeof APP_CONFIG.plans)[number]): ResolvedPlan => ({
  name: plan.name,
  monthlyPrice: plan.priceValue,
  maxSongs: plan.maxSongs,
  features: plan.features,
  description: '',
  isFromCatalog: false,
});

const fromCatalog = (plan: SubscriptionPlanItem): ResolvedPlan => ({
  name: plan.name,
  monthlyPrice: plan.monthlyPrice,
  maxSongs: plan.maxSongs,
  features: plan.features || [],
  description: plan.description || '',
  isFromCatalog: true,
});

/** Planos oferecidos ao compositor: catálogo ativo do banco, ou fallback local. */
export const listOfferedPlans = (catalog: SubscriptionPlanItem[]): ResolvedPlan[] => {
  const active = catalog.filter(plan => plan.isActive);
  if (active.length > 0) {
    return [...active].sort((a, b) => a.sortOrder - b.sortOrder).map(fromCatalog);
  }
  return APP_CONFIG.plans.map(fromConfig);
};

/**
 * Resolve o plano de uma assinatura pelo nome. Um plano renomeado ou desativado
 * no painel continua sendo o plano vigente de quem já assinou, por isso a busca
 * também considera planos inativos antes de cair no fallback.
 */
export const resolvePlan = (catalog: SubscriptionPlanItem[], planName: string): ResolvedPlan => {
  const fromDb = catalog.find(plan => plan.name === planName);
  if (fromDb) return fromCatalog(fromDb);
  const configured = APP_CONFIG.plans.find(plan => plan.name === planName);
  if (configured) return fromConfig(configured);
  return {
    name: planName || 'Plano não identificado',
    monthlyPrice: 0,
    maxSongs: null,
    features: [],
    description: '',
    isFromCatalog: false,
  };
};

/** Casamento tolerante usado pelo parâmetro `?plano=` das páginas públicas. */
export const matchPlanParam = (catalog: SubscriptionPlanItem[], rawParam: string | null): ResolvedPlan | null => {
  if (!rawParam) return null;
  const clean = decodeURIComponent(rawParam).trim().toLowerCase();
  if (!clean) return null;
  const offered = listOfferedPlans(catalog);
  return offered.find(plan => {
    const name = plan.name.toLowerCase();
    return name === clean || name.includes(clean) || clean.includes(name.replace('plano ', ''));
  }) || null;
};
