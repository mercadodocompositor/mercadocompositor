import { supabase } from './supabase';

export type CheckoutMode = 'single' | 'recurring';

export interface MercadoPagoCheckoutResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface MercadoPagoPaymentRecord {
  id: string;
  mpPaymentId: string;
  // under_review: aprovado no Mercado Pago com valor abaixo do plano (webhook não ativa a assinatura).
  status: 'approved' | 'pending' | 'in_process' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back' | 'under_review';
  statusDetail?: string;
  paymentMethod: string;
  paymentType?: string;
  cardLast4?: string;
  cardBrand?: string;
  transactionAmount: number;
  planName: string;
  paidAt?: string;
  createdAt: string;
}

type CheckoutResponse = { checkoutUrl?: string; cancelled?: boolean; error?: string; message?: string };

const UNAVAILABLE = 'Serviço de pagamentos temporariamente indisponível. Por favor, tente novamente em instantes ou contate o suporte.';

const isConnectionError = (err: { message?: string; name?: string }) =>
  Boolean(err.message?.includes('Edge Function') ||
    err.message?.includes('Failed to send a request') ||
    err.message?.includes('fetch') ||
    err.name === 'FunctionsFetchError');

/** Chama a Edge Function mercadopago-checkout e devolve o corpo ou a mensagem de erro dela. */
async function invokeCheckout(body: Record<string, unknown>): Promise<{ data?: CheckoutResponse; error?: string }> {
  if (!supabase) return { error: 'Supabase não inicializado.' };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { error: 'Você precisa estar autenticado para contratar um plano.' };

    const { data, error } = await supabase.functions.invoke('mercadopago-checkout', {
      body,
      headers: { Authorization: `Bearer ${token}` }
    });

    if (error) {
      // Resposta não-2xx: o corpo traz { error, message } da Edge Function.
      // Sem isso o usuário via só "Edge Function returned a non-2xx status code".
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const errorBody = await context.clone().json().catch(() => null) as CheckoutResponse | null;
        console.error('[MercadoPago] Erro na Edge Function:', context.status, errorBody);
        if (errorBody?.message) return { error: errorBody.message };
      }
      console.error('[MercadoPago] Erro na Edge Function:', error);
      return { error: isConnectionError(error) ? UNAVAILABLE : (error.message || 'Não foi possível se conectar ao serviço de pagamentos.') };
    }

    if (data?.error) return { error: data.message || 'Erro ao gerar pagamento no Mercado Pago.' };
    return { data };
  } catch (err) {
    console.error('[MercadoPago] Exceção ao chamar o checkout:', err);
    const msg = err instanceof Error ? err.message : '';
    return { error: isConnectionError({ message: msg }) ? UNAVAILABLE : (msg || 'Falha inesperada ao iniciar checkout.') };
  }
}

/**
 * Inicia o pagamento no Mercado Pago:
 *   single     1 mês via Checkout Pro (Orders API): Pix, cartão ou boleto
 *   recurring  renovação automática mensal no cartão (Assinaturas / preapproval)
 *
 * payerEmail: e-mail da conta Mercado Pago que vai autorizar a assinatura. O
 * Mercado Pago recusa a autorização se o usuário logado tiver outro e-mail.
 */
export async function createMercadoPagoPreference(planName: string, mode: CheckoutMode = 'single', payerEmail?: string): Promise<MercadoPagoCheckoutResult> {
  const { data, error } = await invokeCheckout({ planName, mode, ...(payerEmail ? { payerEmail } : {}) });
  if (error) return { success: false, error };
  if (!data?.checkoutUrl) return { success: false, error: 'Link de pagamento não retornado pelo Mercado Pago.' };
  return { success: true, url: data.checkoutUrl };
}

/** Cancela a renovação automática. O período já pago continua valendo. */
export async function cancelRecurringSubscription(): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await invokeCheckout({ action: 'cancel_recurring' });
  if (error) return { success: false, error };
  return { success: Boolean(data?.cancelled) };
}

/**
 * Analisa os parâmetros de retorno após o redirecionamento do Mercado Pago
 */
export function parsePaymentFeedback(searchParams: URLSearchParams): {
  isPaymentReturn: boolean;
  status: 'success' | 'pending' | 'failure' | 'recurring' | null;
  planName: string | null;
} {
  const paymentStatus = searchParams.get('payment');
  const collectionStatus = searchParams.get('collection_status') || searchParams.get('status');
  const plan = searchParams.get('plan');

  // Volta da autorização da renovação automática (back_url do preapproval).
  if (paymentStatus === 'recurring') {
    return { isPaymentReturn: true, status: 'recurring', planName: plan };
  }
  if (paymentStatus === 'success' || collectionStatus === 'approved') {
    return { isPaymentReturn: true, status: 'success', planName: plan };
  }
  if (paymentStatus === 'pending' || collectionStatus === 'pending' || collectionStatus === 'in_process') {
    return { isPaymentReturn: true, status: 'pending', planName: plan };
  }
  if (paymentStatus === 'failure' || collectionStatus === 'rejected' || collectionStatus === 'cancelled') {
    return { isPaymentReturn: true, status: 'failure', planName: plan };
  }

  return { isPaymentReturn: false, status: null, planName: null };
}

/**
 * Formata o método de pagamento recebido do Mercado Pago para exibição
 */
export function formatPaymentMethod(methodId?: string, paymentType?: string): string {
  if (!methodId) return 'Mercado Pago';
  const clean = methodId.toLowerCase();
  if (clean.includes('pix')) return 'Pix';
  if (clean.includes('bolbradesco') || clean.includes('ticket') || paymentType === 'ticket') return 'Boleto Bancário';
  if (clean.includes('account_money')) return 'Saldo Mercado Pago';
  return 'Cartão de Crédito';
}

/**
 * Calcula a data estimada da próxima cobrança (30 dias corridos)
 */
export function calculateNextBillingDate(startDate: Date = new Date()): string {
  const next = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  return next.toLocaleDateString('pt-BR');
}
