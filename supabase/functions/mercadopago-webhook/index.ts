import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { parseOrderReference, planSlug } from '../_shared/orderReference.ts'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
})

/**
 * Valida a assinatura HMAC que o Mercado Pago envia no header `x-signature`.
 *
 * Formato: `ts=<timestamp>,v1=<hash>`, onde o hash é HMAC-SHA256 do template
 * `id:<data.id>;request-id:<x-request-id>;ts=<ts>;` usando a chave secreta do
 * painel do Mercado Pago (Webhooks > Assinatura secreta).
 *
 * Sem o segredo configurado a checagem é ignorada com aviso, porque a função
 * ainda relê o recurso na API oficial antes de tocar em qualquer assinatura —
 * um evento forjado não consegue inventar um pagamento aprovado. Com o segredo
 * configurado, a divergência é registrada no log (ver passo 2).
 */
const verifySignature = async (
  secret: string,
  signatureHeader: string | null,
  requestId: string | null,
  dataId: string,
): Promise<boolean> => {
  if (!signatureHeader) return false

  const parts = new Map(
    signatureHeader.split(',')
      .map(part => part.split('='))
      .filter(pair => pair.length >= 2)
      .map(([key, ...rest]) => [key.trim(), rest.join('=').trim()] as const),
  )
  const ts = parts.get('ts')
  const v1 = parts.get('v1')
  if (!ts || !v1) return false

  // O id vai em minúsculas no template quando é alfanumérico (orders "ORD...", preapprovals).
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId || ''};ts=${ts};`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const expected = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')

  if (expected.length !== v1.length) return false
  // Comparação em tempo constante.
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i)
  return diff === 0
}

type MpOrder = {
  id: string
  status: string
  status_detail?: string
  external_reference?: string
  total_amount?: string
  total_paid_amount?: string
  currency?: string
  last_updated_date?: string
  created_date?: string
  transactions?: {
    payments?: Array<{
      id?: string
      status?: string
      status_detail?: string
      amount?: string
      paid_amount?: string
      payment_method?: { id?: string; type?: string; installments?: number }
    }>
    refunds?: unknown[]
    chargebacks?: unknown[]
  }
}

type MpPreapproval = {
  id: string
  status: string // pending | authorized | paused | cancelled
  external_reference?: string
  auto_recurring?: { transaction_amount?: number | string; currency_id?: string; start_date?: string }
}

type MpAuthorizedPayment = {
  id: number | string
  preapproval_id: string
  status?: string
  transaction_amount?: number | string
  currency_id?: string
  debit_date?: string
  date_created?: string
  payment?: { id?: number | string; status?: string; status_detail?: string }
}

type MpPayment = {
  id: number | string
  status: string
  status_detail?: string
  transaction_amount?: number
}

/** Quando um evento chega mas não há nada a fazer: 200 evita reenvio infinito. */
class Ignored {
  constructor(public reason: string) {}
}

/** Falha transitória: 5xx faz o Mercado Pago reenviar o evento depois. */
class Retry {
  constructor(public reason: string, public status = 502) {}
}

/**
 * Converte o status da order no vocabulário que process_mercadopago_payment
 * já trata (o mesmo dos pagamentos): approved ativa, refunded/charged_back
 * suspendem, o resto só registra.
 * https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/payment-management/status/order-status
 */
const mapOrderStatus = (order: MpOrder): string => {
  if ((order.transactions?.chargebacks?.length || 0) > 0) return 'charged_back'
  if (order.status === 'refunded' || order.status_detail === 'refunded') return 'refunded'
  switch (order.status) {
    case 'processed': return 'approved' // accredited ou partially_refunded
    case 'failed': return 'rejected'
    case 'canceled': return 'cancelled'
    case 'processing': return 'in_process'
    default: return 'pending' // created, action_required
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST' && request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  const webhookSecret = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')

  if (!supabaseUrl || !serviceKey) {
    console.error('[mercadopago-webhook] Variáveis do Supabase não configuradas.')
    return json({ error: 'misconfigured_server' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  try {
    // 1. Tipo e id do evento (query params e corpo JSON). Tópicos tratados:
    //    order                             pagamento de 1 mês (Checkout Pro via Orders)
    //    subscription_preapproval          assinatura autorizada/pausada/cancelada
    //    subscription_authorized_payment   cada cobrança mensal da assinatura
    //    payment                           só estorno/contestação de cobrança já registrada
    const url = new URL(request.url)
    let dataId: string | null = url.searchParams.get('data.id') || url.searchParams.get('id')
    let type: string | null = url.searchParams.get('type') || url.searchParams.get('topic')

    if (request.method === 'POST') {
      try {
        const bodyText = await request.text()
        if (bodyText) {
          const body = JSON.parse(bodyText) as { type?: string; action?: string; data?: { id?: string | number } }
          if (body.data?.id) dataId = String(body.data.id)
          if (body.type) type = body.type
          if (body.action?.startsWith('order')) type = 'order'
        }
      } catch { /* parse fallback */ }
    }

    const handled = ['order', 'subscription_preapproval', 'subscription_authorized_payment', 'payment']
    if (!type || !handled.includes(type)) {
      return json({ received: true, ignored: true, reason: 'unhandled_event_type' }, 200)
    }
    if (!dataId) {
      return json({ received: true, ignored: true, reason: 'missing_data_id' }, 200)
    }

    // 2. Autenticidade do evento
    if (webhookSecret) {
      const valid = await verifySignature(
        webhookSecret,
        request.headers.get('x-signature'),
        request.headers.get('x-request-id'),
        dataId,
      )
      if (!valid) {
        // Não recusa: o formato do template de assinatura varia entre tópicos
        // (order, preapproval, authorized_payment, payment) e um 401 aqui
        // descartaria TODOS os eventos daquele tópico em silêncio. A garantia
        // real é o passo 3 — nada é gravado sem reler o recurso na API oficial
        // com o nosso token, e o processamento é idempotente.
        console.warn(`[mercadopago-webhook] Assinatura não confere (${type} ${dataId}); seguindo com releitura na API.`)
      }
    } else {
      console.warn('[mercadopago-webhook] MERCADOPAGO_WEBHOOK_SECRET ausente: evento aceito sem validação de assinatura.')
    }

    if (!mpAccessToken) {
      console.error('[mercadopago-webhook] MERCADOPAGO_ACCESS_TOKEN ausente. Não foi possível consultar o evento.')
      // 500 faz o Mercado Pago reenviar depois; 200 aqui descartaria o
      // pagamento em silêncio enquanto as credenciais não estiverem postas.
      return json({ error: 'missing_mp_token' }, 500)
    }

    // 3. Releitura obrigatória na API oficial: do corpo da notificação só o id é usado.
    const mp = async <T>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(`https://api.mercadopago.com${path}`, {
        ...init,
        headers: { 'Authorization': `Bearer ${mpAccessToken}`, 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        console.error(`[mercadopago-webhook] ${init?.method || 'GET'} ${path} falhou:`, res.status, await res.text())
        // 404 é definitivo (evento de teste ou recurso de outra conta).
        if (res.status === 404) throw new Ignored('mp_not_found')
        throw new Retry('mp_fetch_failed')
      }
      return await res.json() as T
    }

    const handlers: Record<string, () => Promise<unknown>> = {
      order: () => handleOrder(admin, mp, dataId!),
      subscription_preapproval: () => handlePreapproval(admin, mp, dataId!),
      subscription_authorized_payment: () => handleAuthorizedPayment(admin, mp, dataId!),
      payment: () => handlePaymentReversal(admin, mp, dataId!),
    }
    const result = await handlers[type]()
    return json({ received: true, processed: true, type, result }, 200)

  } catch (err) {
    if (err instanceof Ignored) return json({ received: true, ignored: true, reason: err.reason }, 200)
    if (err instanceof Retry) return json({ received: true, error: err.reason }, err.status)
    console.error('[mercadopago-webhook] Erro no processamento do webhook:', err)
    // 500 para o Mercado Pago reenviar: engolir com 200 perdia o pagamento.
    return json({ received: true, error: 'internal_exception' }, 500)
  }
})

type Mp = <T>(path: string, init?: RequestInit) => Promise<T>

/** Usuário e plano a partir do external_reference (ver _shared/orderReference.ts). */
const resolveReference = async (admin: SupabaseClient, reference: string | undefined) => {
  const parsed = parseOrderReference(reference)
  if (!parsed) throw new Ignored('missing_target_user')
  const { data: plans } = await admin.from('subscription_plans').select('name, monthly_price')
  const plan = (plans || []).find(row => planSlug(row.name) === parsed.planSlug)
  return {
    userId: parsed.userId,
    // Plano renomeado entre o checkout e a cobrança: sem preço de referência
    // o pagamento cai em revisão em vez de ativar.
    planName: plan?.name || parsed.planSlug,
    expectedPrice: plan ? Number(plan.monthly_price) : Number.NaN,
  }
}

/**
 * O valor pago precisa cobrir o preço do plano. A cobrança é criada no
 * servidor com o preço do catálogo, então divergência indica pagamento fora do
 * fluxo normal: ele é registrado, mas não ativa a assinatura — fica visível
 * para o financeiro revisar.
 */
const checkAmount = (status: string, detail: string, paid: number, expected: number, currency: string | undefined, label: string) => {
  if (status !== 'approved') return { status, detail }
  const wrongCurrency = Boolean(currency) && currency !== 'BRL'
  if (wrongCurrency || !Number.isFinite(expected) || paid + 0.01 < expected) {
    console.error(`[mercadopago-webhook] ${label} aprovado com valor divergente: pago ${paid} ${currency || ''}, esperado ${expected}.`)
    return {
      status: 'under_review',
      detail: `amount_mismatch: pago ${paid}, esperado ${Number.isFinite(expected) ? expected : 'plano desconhecido'}`,
    }
  }
  return { status, detail }
}

/** Registro atômico no banco (idempotente por p_mp_payment_id). */
const processPayment = async (admin: SupabaseClient, args: Record<string, unknown>) => {
  const { data, error } = await admin.rpc('process_mercadopago_payment', args)
  if (error) {
    // A assinatura nunca é ativada por fora da RPC transacional.
    console.error('[mercadopago-webhook] Erro ao chamar process_mercadopago_payment:', error)
    throw new Retry('process_payment_failed', 500)
  }
  return data
}

/** Pagamento de 1 mês (Checkout Pro via Orders). O id da order é a chave de idempotência. */
const handleOrder = async (admin: SupabaseClient, mp: Mp, orderId: string) => {
  const order = await mp<MpOrder>(`/v1/orders/${encodeURIComponent(orderId)}`)
  const payment = order.transactions?.payments?.[0]
  const ref = await resolveReference(admin, order.external_reference)
  const paid = Number(order.total_paid_amount || payment?.paid_amount || 0)
  const { status, detail } = checkAmount(
    mapOrderStatus(order), order.status_detail || payment?.status_detail || '',
    paid, ref.expectedPrice, order.currency, `Order ${order.id}`,
  )
  return await processPayment(admin, {
    p_user_id: ref.userId,
    p_mp_payment_id: order.id,
    p_status: status,
    p_status_detail: detail,
    p_payment_method: payment?.payment_method?.id || 'mercadopago',
    p_payment_type: payment?.payment_method?.type || '',
    p_card_last4: null,
    p_card_brand: null,
    p_transaction_amount: paid || Number(order.total_amount || 0),
    p_plan_name: ref.planName,
    p_paid_at: order.last_updated_date || order.created_date || new Date().toISOString(),
    p_raw_payload: order,
  })
}

/**
 * Assinatura (preapproval) autorizada, pausada ou cancelada. Só mexe no
 * vínculo e na flag de renovação: quem ativa o plano é a cobrança aprovada.
 */
const handlePreapproval = async (admin: SupabaseClient, mp: Mp, preapprovalId: string) => {
  const pre = await mp<MpPreapproval>(`/preapproval/${encodeURIComponent(preapprovalId)}`)
  const ref = await resolveReference(admin, pre.external_reference)
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, mp_preapproval_id, mp_preapproval_status, trial_started_at')
    .eq('user_id', ref.userId)
    .maybeSingle()
  if (!sub) throw new Ignored('subscription_not_found')

  const now = new Date().toISOString()
  if (pre.status === 'authorized') {
    // Troca de plano: cancela o preapproval anterior para não cobrar duas vezes.
    if (sub.mp_preapproval_id && sub.mp_preapproval_id !== pre.id && sub.mp_preapproval_status === 'authorized') {
      try {
        await mp(`/preapproval/${encodeURIComponent(sub.mp_preapproval_id)}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'cancelled' }),
        })
      } catch (err) {
        // O novo continua valendo; o antigo precisa ser cancelado à mão no painel.
        console.error(`[mercadopago-webhook] Não foi possível cancelar o preapproval anterior ${sub.mp_preapproval_id}:`, err)
      }
    }
    // O checkout só oferece teste para conta PENDENTE (nunca pagou, nunca
    // testou); para quem está ativo, start_date no futuro significa apenas
    // "cobrar no vencimento do período já pago". Inferir o teste só pela
    // data marcava como teste grátis a ativação de renovação de quem já
    // pagava — com notificação errada e carência zero na expiração.
    // Sem o piso de 6 dias: o compositor pode demorar para concluir a
    // autorização e mesmo assim deve ter o teste ativado.
    const trialEnd = pre.auto_recurring?.start_date
    const trialEndTime = trialEnd ? new Date(trialEnd).getTime() : Number.NaN
    const { data: priorApproved } = await admin
      .from('subscription_payments')
      .select('id')
      .eq('user_id', ref.userId)
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle()
    const isSevenDayTrial = Number.isFinite(trialEndTime)
      && trialEndTime > Date.now()
      && sub.status === 'pending'
      && !sub.trial_started_at
      && !priorApproved
    const subscriptionUpdate: Record<string, unknown> = {
      mp_preapproval_id: pre.id,
      mp_preapproval_status: 'authorized',
      auto_renew: true,
      updated_at: now,
    }
    if (isSevenDayTrial) {
      subscriptionUpdate.status = 'active'
      subscriptionUpdate.plan_name = ref.planName
      // Valor contratado no preapproval, no formato do schema ('24,90').
      const contracted = Number(pre.auto_recurring?.transaction_amount)
      const monthly = Number.isFinite(contracted) && contracted > 0 ? contracted : ref.expectedPrice
      if (Number.isFinite(monthly)) subscriptionUpdate.monthly_price = monthly.toFixed(2).replace('.', ',')
      subscriptionUpdate.payment_method = 'Cartão de Crédito'
      subscriptionUpdate.next_billing_date = new Date(trialEndTime).toISOString().slice(0, 10)
      subscriptionUpdate.trial_started_at = now
      subscriptionUpdate.trial_ends_at = new Date(trialEndTime).toISOString()
    }
    await admin.from('subscriptions')
      .update(subscriptionUpdate)
      .eq('user_id', ref.userId)
    // O Mercado Pago reenvia o evento do mesmo preapproval autorizado várias
    // vezes; cada aviso vira e-mail, então só avisa na primeira autorização.
    const alreadyNotified = sub.mp_preapproval_id === pre.id && sub.mp_preapproval_status === 'authorized'
    if (!alreadyNotified) await admin.from('user_notifications').insert({
      user_id: ref.userId,
      title: isSevenDayTrial ? 'Teste grátis ativado' : 'Renovação automática ativada',
      message: isSevenDayTrial
        ? `Seu ${ref.planName} está ativo por 7 dias grátis. A primeira cobrança será feita ao fim do teste; você pode cancelar antes pela tela de assinatura.`
        : `Seu ${ref.planName} será cobrado automaticamente todo mês no cartão. Você pode cancelar quando quiser pela tela de assinatura.`,
      type: 'system',
      is_read: false,
      link: '/dashboard/assinatura',
    })
    return { preapproval: pre.id, status: 'authorized', trial: isSevenDayTrial }
  }

  // Eventos de um preapproval que não é o vigente (ex.: o antigo que acabamos
  // de cancelar numa troca de plano) não podem desligar a renovação do novo.
  if (sub.mp_preapproval_id && sub.mp_preapproval_id !== pre.id) {
    return { preapproval: pre.id, status: pre.status, ignored: 'not_current' }
  }

  await admin.from('subscriptions')
    .update({
      mp_preapproval_id: pre.id,
      mp_preapproval_status: pre.status,
      auto_renew: false,
      updated_at: now,
    })
    .eq('user_id', ref.userId)
  return { preapproval: pre.id, status: pre.status }
}

/**
 * Cobrança mensal de uma assinatura. A chave de idempotência é o id do
 * pagamento gerado pela cobrança (o mesmo que chega depois num estorno).
 */
const handleAuthorizedPayment = async (admin: SupabaseClient, mp: Mp, authorizedPaymentId: string) => {
  const charge = await mp<MpAuthorizedPayment>(`/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`)
  // Cobrança só agendada (sem tentativa de pagamento ainda): nada a registrar.
  if (!charge.payment?.id) throw new Ignored('charge_without_payment')

  // O external_reference confiável é o do preapproval, criado pelo checkout.
  const pre = await mp<MpPreapproval>(`/preapproval/${encodeURIComponent(charge.preapproval_id)}`)
  const ref = await resolveReference(admin, pre.external_reference)

  const paymentStatus = charge.payment.status || 'pending'
  const paid = Number(charge.transaction_amount || 0)
  // O preço de referência é o valor CONTRATADO no preapproval (criado só pelo
  // servidor, com o preço do catálogo da época), não o preço atual: um
  // reajuste no catálogo mandaria todo assinante antigo para revisão e a
  // conta expiraria mesmo com a cobrança aprovada.
  const contracted = Number(pre.auto_recurring?.transaction_amount)
  const expected = Number.isFinite(contracted) && contracted > 0 ? contracted : ref.expectedPrice
  const { status, detail } = checkAmount(
    paymentStatus, charge.payment.status_detail || '',
    paid, expected, charge.currency_id || pre.auto_recurring?.currency_id, `Cobrança recorrente ${charge.id}`,
  )
  return await processPayment(admin, {
    p_user_id: ref.userId,
    p_mp_payment_id: String(charge.payment.id),
    p_status: status,
    p_status_detail: detail,
    p_payment_method: 'mercadopago',
    // Assinaturas do Mercado Pago cobram cartão: exibe "Cartão de Crédito".
    p_payment_type: 'credit_card',
    p_card_last4: null,
    p_card_brand: null,
    p_transaction_amount: paid,
    p_plan_name: ref.planName,
    p_paid_at: charge.debit_date || charge.date_created || new Date().toISOString(),
    p_raw_payload: { authorized_payment: charge, preapproval_id: pre.id },
  })
}

/**
 * Estorno ou contestação de uma cobrança recorrente já registrada. Pagamentos
 * de 1 mês são estornados pelo evento de order; aqui só entra o que já está em
 * subscription_payments com o id do pagamento.
 */
const handlePaymentReversal = async (admin: SupabaseClient, mp: Mp, paymentId: string) => {
  const { data: existing } = await admin
    .from('subscription_payments')
    .select('user_id, plan_name, transaction_amount, payment_method, payment_type, raw_payload')
    .eq('mp_payment_id', paymentId)
    .maybeSingle()
  if (!existing) throw new Ignored('payment_not_registered')

  const payment = await mp<MpPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`)
  if (payment.status !== 'refunded' && payment.status !== 'charged_back') {
    throw new Ignored('no_reversal')
  }
  // Cobrança recorrente estornada/contestada: cancela a renovação, senão o
  // Mercado Pago cobraria de novo no mês seguinte e reativaria a conta
  // suspensa. Reativar exige o compositor assinar outra vez.
  const preapprovalId = (existing.raw_payload as { preapproval_id?: string } | null)?.preapproval_id
  if (preapprovalId) {
    try {
      await mp(`/preapproval/${encodeURIComponent(preapprovalId)}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      })
    } catch (err) {
      console.error(`[mercadopago-webhook] Não foi possível cancelar o preapproval ${preapprovalId} após ${payment.status}:`, err)
    }
    await admin.from('subscriptions')
      .update({ auto_renew: false, mp_preapproval_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('user_id', existing.user_id)
      .eq('mp_preapproval_id', preapprovalId)
  }

  return await processPayment(admin, {
    p_user_id: existing.user_id,
    p_mp_payment_id: paymentId,
    p_status: payment.status,
    p_status_detail: payment.status_detail || '',
    p_payment_method: existing.payment_method,
    p_payment_type: existing.payment_type || '',
    p_card_last4: null,
    p_card_brand: null,
    p_transaction_amount: Number(existing.transaction_amount || payment.transaction_amount || 0),
    p_plan_name: existing.plan_name,
    p_paid_at: null,
    p_raw_payload: payment,
  })
}
