// Formato do external_reference das orders do Mercado Pago.
//
// A documentação da Orders API só mostra referências com letras, dígitos e
// "_" (ex.: "order_pro_123"), então usamos esse alfabeto: um JSON ou um nome
// de plano com espaço/acento poderia ser recusado na criação da order.
//
//   mdc_<uuid do usuário sem hífens>_<slug do plano>
//   mdc_3f2a...9c1d_plano_bronze
//
// O webhook resolve o slug de volta para o nome do plano consultando
// subscription_plans (planSlug(name) === slug).

export const planSlug = (planName: string): string =>
  planName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const buildOrderReference = (userId: string, planName: string): string =>
  `mdc_${userId.replace(/-/g, '').toLowerCase()}_${planSlug(planName)}`

export const parseOrderReference = (reference: string | null | undefined): { userId: string; planSlug: string } | null => {
  const match = /^mdc_([0-9a-f]{32})_([a-z0-9_]+)$/.exec(reference || '')
  if (!match) return null
  const hex = match[1]
  const userId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return { userId, planSlug: match[2] }
}
