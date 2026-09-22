import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildOrderReference } from '../_shared/orderReference.ts'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
})

const mpUnavailable = () => json({
  error: 'mercadopago_api_error',
  message: 'Não foi possível gerar a sessão de pagamento no Mercado Pago.'
}, 502)

/**
 * Três ações, todas com a sessão do compositor:
 *   { planName, mode: 'single' }     pagamento de 1 mês (Checkout Pro via Orders: Pix, cartão, boleto)
 *   { planName, mode: 'recurring' }  renovação automática no cartão (Assinaturas / preapproval)
 *   { action: 'cancel_recurring' }   cancela a renovação automática; o período pago continua valendo
 */
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  const appUrl = Deno.env.get('APP_URL') || 'https://mercadodocompositor.com.br'

  const authorization = request.headers.get('authorization')
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
    return json({ error: 'unauthorized', message: 'Credenciais de autenticação ausentes.' }, 401)
  }

  // Validação da sessão do usuário
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return json({ error: 'invalid_session', message: 'Sessão expirada ou inválida.' }, 401)
  }

  const userId = userData.user.id
  const userEmail = userData.user.email || ''

  try {
    const body = await request.json() as { planName?: unknown; mode?: unknown; action?: unknown; payerEmail?: unknown }

    // Se o access token do Mercado Pago ainda não estiver configurado nas secrets
    if (!mpAccessToken) {
      return json({
        error: 'mercadopago_not_configured',
        message: 'Os pagamentos ainda não estão disponíveis. Tente novamente mais tarde ou fale com o suporte.'
      }, 503)
    }
    const mpHeaders = { 'Authorization': `Bearer ${mpAccessToken}`, 'Content-Type': 'application/json' }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: currentSub } = await admin
      .from('subscriptions')
      .select('plan_name, status, next_billing_date, mp_preapproval_id, mp_preapproval_status, trial_started_at')
      .eq('user_id', userId)
      .maybeSingle()

    // ---------------------------------------------------------------------
    // Cancelamento da renovação automática (CDC: cancelar sem burocracia)
    // ---------------------------------------------------------------------
    if (body.action === 'cancel_recurring') {
      if (!currentSub?.mp_preapproval_id) {
        return json({ error: 'no_recurring', message: 'Sua conta não tem renovação automática ativa.' }, 400)
      }
      const cancelRes = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(currentSub.mp_preapproval_id)}`, {
        method: 'PUT',
        headers: mpHeaders,
        body: JSON.stringify({ status: 'cancelled' })
      })
      if (!cancelRes.ok) {
        console.error('[mercadopago-checkout] Falha ao cancelar preapproval:', cancelRes.status, await cancelRes.text())
        return json({ error: 'mercadopago_api_error', message: 'Não foi possível cancelar a renovação agora. Tente novamente em instantes.' }, 502)
      }
      await admin.from('subscriptions')
        .update({ auto_renew: false, mp_preapproval_status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
      await admin.from('system_logs').insert({
        category: 'financial',
        title: 'Renovação automática cancelada',
        description: `Compositor cancelou a renovação automática (preapproval ${currentSub.mp_preapproval_id}).`,
        actor: userEmail || userId,
        status: 'info'
      })
      return json({ cancelled: true, validUntil: currentSub.next_billing_date })
    }

    const planName = typeof body.planName === 'string' ? body.planName.trim().slice(0, 100) : ''
    const mode = body.mode === 'recurring' ? 'recurring' : 'single'
    if (!planName) {
      return json({ error: 'invalid_plan', message: 'Selecione um plano válido.' }, 400)
    }

    // O preço cobrado vem SEMPRE do catálogo. Antes, um nome de plano
    // desconhecido caía num preço de fallback (24,90) e o webhook renovava o
    // plano atual da conta — um assinante Ouro podia renovar pagando Bronze.
    const { data: dbPlan } = await admin
      .from('subscription_plans')
      .select('name, monthly_price, description, is_active')
      .eq('name', planName)
      .maybeSingle()

    // Plano desativado só pode ser renovado por quem já está nele.
    if (!dbPlan || (!dbPlan.is_active && currentSub?.plan_name !== dbPlan.name)) {
      return json({ error: 'invalid_plan', message: 'Este plano não está disponível para contratação.' }, 400)
    }

    const price = Number(dbPlan.monthly_price)
    if (!Number.isFinite(price) || price <= 0) {
      return json({ error: 'invalid_plan', message: 'Este plano não está disponível para contratação.' }, 400)
    }
    const description = dbPlan.description || `Assinatura ${planName}`

    // Busca dados cadastrais do compositor para enriquecer a cobrança
    const [profileRes, privRes] = await Promise.all([
      admin.from('profiles').select('name, stage_name').eq('user_id', userId).maybeSingle(),
      admin.from('private_profiles').select('cpf, email, whatsapp').eq('user_id', userId).maybeSingle()
    ])

    const payerName = profileRes.data?.name || profileRes.data?.stage_name || 'Compositor'
    // Na assinatura recorrente o Mercado Pago só deixa autorizar quem estiver
    // logado numa conta com exatamente este e-mail ("Seu e-mail não corresponde
    // ao da assinatura"). O compositor informa o e-mail da conta Mercado Pago,
    // que pode ser diferente do cadastro na plataforma.
    const informedPayerEmail = typeof body.payerEmail === 'string' ? body.payerEmail.trim().toLowerCase().slice(0, 254) : ''
    if (informedPayerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(informedPayerEmail)) {
      return json({ error: 'invalid_payer_email', message: 'Informe um e-mail válido da sua conta Mercado Pago.' }, 400)
    }
    const payerEmail = informedPayerEmail || privRes.data?.email || userEmail
    const payerCpf = (privRes.data?.cpf || '').replace(/\D/g, '')

    const cleanAppUrl = appUrl.replace(/\/$/, '')
    const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`
    const returnUrl = (payment: string) =>
      `${cleanAppUrl}/dashboard/assinatura?payment=${payment}&plan=${encodeURIComponent(planName)}`
    const externalReference = buildOrderReference(userId, planName)

    // ---------------------------------------------------------------------
    // Renovação automática: Assinaturas do Mercado Pago (preapproval)
    // https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
    // ---------------------------------------------------------------------
    if (mode === 'recurring') {
      // Contas anteriores à criação dos campos de trial podem ter o marcador
      // nulo mesmo já tendo pago. O histórico financeiro fecha essa brecha.
      const { data: priorApprovedPayment, error: paymentHistoryError } = await admin
        .from('subscription_payments')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .limit(1)
        .maybeSingle()
      if (paymentHistoryError) throw paymentHistoryError

      const isActive = currentSub?.status === 'active'
      const samePlan = currentSub?.plan_name === planName
      // Só bloqueia quem está em dia. Com a conta vencida (cartão recusado) o
      // preapproval pode seguir "authorized" no Mercado Pago enquanto ele
      // tenta cobrar: o compositor precisa poder assinar de novo com outro
      // cartão — o webhook cancela o antigo quando o novo for autorizado.
      if (isActive && samePlan && currentSub?.mp_preapproval_status === 'authorized') {
        return json({ error: 'already_recurring', message: 'Sua renovação automática deste plano já está ativa.' }, 409)
      }

      // Mesmo plano com período pago em vigor: a 1ª cobrança fica para o
      // vencimento, para não pagar duas vezes o mesmo mês. Troca de plano é
      // cobrada na hora e o novo plano vale imediatamente (os dias restantes
      // do ciclo anterior são somados pela process_mercadopago_payment).
      const today = new Date().toISOString().slice(0, 10)
      const paidUntil = isActive && samePlan ? currentSub?.next_billing_date : null
      // Benefício concedido uma única vez por conta: o cartão é autorizado
      // agora e a primeira cobrança fica para daqui a 7 dias.
      const isTrialEligible = !currentSub?.trial_started_at
        && !priorApprovedPayment
        && currentSub?.status === 'pending'
      const trialStartDate = isTrialEligible
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : undefined
      const startDate = paidUntil && paidUntil > today
        ? new Date(`${paidUntil}T12:00:00-03:00`).toISOString()
        : trialStartDate

      // Reaproveita a autorização pendente recente do mesmo plano e valor: cada
      // clique criava um preapproval novo no Mercado Pago (cliques repetidos,
      // "concluir depois", voltar e tentar de novo). Até 1 hora a data da 1ª
      // cobrança/teste continua praticamente a mesma; depois disso, cria outro.
      if (currentSub?.mp_preapproval_status === 'pending' && currentSub.mp_preapproval_id) {
        try {
          const existingRes = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(currentSub.mp_preapproval_id)}`, { headers: mpHeaders })
          if (existingRes.ok) {
            const existing = await existingRes.json() as {
              id: string; status?: string; init_point?: string; external_reference?: string; payer_email?: string
              date_created?: string; auto_recurring?: { transaction_amount?: number | string }
            }
            const createdAt = existing.date_created ? new Date(existing.date_created).getTime() : Number.NaN
            const isRecent = Number.isFinite(createdAt) && Date.now() - createdAt < 60 * 60 * 1000
            const sameAmount = Math.abs(Number(existing.auto_recurring?.transaction_amount) - price) < 0.01
            // Autorização criada para outro e-mail seria recusada de novo no Mercado Pago.
            const samePayer = (existing.payer_email || '').trim().toLowerCase() === payerEmail.toLowerCase()
            if (existing.status === 'pending' && existing.init_point && existing.external_reference === externalReference && isRecent && sameAmount && samePayer) {
              return json({ mode, preapprovalId: existing.id, checkoutUrl: existing.init_point, planName, price, reused: true })
            }
          }
        } catch (err) {
          // Falha na consulta não impede o checkout: segue criando um novo.
          console.warn('[mercadopago-checkout] Não foi possível reaproveitar o preapproval pendente:', err)
        }
      }

      const preapprovalPayload = {
        reason: `Mercado do Compositor - ${planName}`,
        external_reference: externalReference,
        payer_email: payerEmail,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: Number(price.toFixed(2)),
          currency_id: 'BRL',
          ...(startDate ? { start_date: startDate } : {})
        },
        back_url: returnUrl('recurring'),
        status: 'pending'
      }

      const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: mpHeaders,
        body: JSON.stringify(preapprovalPayload)
      })
      if (!mpResponse.ok) {
        console.error('[mercadopago-checkout] Erro ao criar preapproval:', mpResponse.status, await mpResponse.text())
        return mpUnavailable()
      }
      const preapproval = await mpResponse.json() as { id: string; init_point?: string }
      if (!preapproval.init_point) {
        console.error('[mercadopago-checkout] Preapproval criado sem init_point:', preapproval.id)
        return mpUnavailable()
      }

      // Guarda o vínculo pendente só se não houver outro já autorizado; o
      // webhook confirma quando o compositor concluir no Mercado Pago.
      if (currentSub?.mp_preapproval_status !== 'authorized') {
        await admin.from('subscriptions')
          .update({ mp_preapproval_id: preapproval.id, mp_preapproval_status: 'pending', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
      }

      return json({ mode, preapprovalId: preapproval.id, checkoutUrl: preapproval.init_point, planName, price, firstChargeAt: startDate || null, trialDays: isTrialEligible ? 7 : 0 })
    }

    // ---------------------------------------------------------------------
    // Pagamento de 1 mês: Checkout Pro via Orders API
    // https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order
    // ---------------------------------------------------------------------
    // A Orders API recebe valores monetários como string com 2 casas.
    const amount = price.toFixed(2)
    const [firstName, ...lastNames] = payerName.trim().split(/\s+/)

    const orderPayload = {
      type: 'online',
      processing_mode: 'manual',
      total_amount: amount,
      external_reference: externalReference,
      description,
      payer: {
        email: payerEmail,
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastNames.length ? { last_name: lastNames.join(' ') } : {}),
        ...(payerCpf ? { identification: { type: 'CPF', number: payerCpf } } : {})
      },
      items: [
        {
          title: `Mercado do Compositor - ${planName}`,
          unit_price: amount,
          quantity: 1,
          unit_measure: 'unit',
          total_amount: amount
        }
      ],
      config: {
        // O tópico "Order" também precisa estar ativo em Suas integrações >
        // Webhooks: é de lá que vem a assinatura secreta validada no webhook.
        notification_url: webhookUrl,
        statement_descriptor: 'COMPOSITOR',
        online: {
          success_url: returnUrl('success'),
          pending_url: returnUrl('pending'),
          failure_url: returnUrl('failure'),
          auto_return: 'approved'
        }
      }
    }

    const mpResponse = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        ...mpHeaders,
        // Uma chave por tentativa: evita order duplicada se a requisição for reenviada.
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify(orderPayload)
    })

    if (!mpResponse.ok) {
      // A resposta crua do Mercado Pago fica só no log do servidor.
      console.error('[mercadopago-checkout] Erro ao criar order:', mpResponse.status, await mpResponse.text())
      return mpUnavailable()
    }

    const mpData = await mpResponse.json() as { id: string; checkout_url?: string }
    if (!mpData.checkout_url) {
      console.error('[mercadopago-checkout] Order criada sem checkout_url:', mpData.id)
      return mpUnavailable()
    }

    return json({ mode, orderId: mpData.id, checkoutUrl: mpData.checkout_url, planName, price })
  } catch (err) {
    console.error('[mercadopago-checkout] Exceção inesperada:', err)
    return json({
      error: 'internal_error',
      message: 'Erro interno ao processar checkout. Tente novamente em instantes.'
    }, 500)
  }
})
