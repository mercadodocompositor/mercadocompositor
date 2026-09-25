import { supabase } from './supabase';

type StripeAction = { success: boolean; url?: string; error?: string };
type StripeCall = { data?: { url?: string; ok?: boolean; message?: string }; error?: string };

async function call(name: string, body?: Record<string, unknown>): Promise<StripeCall> {
  if (!supabase) return { error: 'Supabase não configurado.' };
  const { data, error } = await supabase.functions.invoke(name, { body: body || {} });
  if (error) {
    // Respostas não-2xx da função chegam como FunctionsHttpError; a mensagem útil está no corpo.
    const response = (error as { context?: Response }).context;
    const detail = response && typeof response.json === 'function'
      ? await response.json().then((b: { message?: string }) => b?.message).catch(() => undefined)
      : undefined;
    console.error(`[stripe] ${name}`, response?.status, detail || error.message);
    return { error: detail || 'Não foi possível conectar ao serviço de pagamento.' };
  }
  return { data };
}

/** Funções que devolvem um link do Stripe para redirecionar o usuário. */
async function invoke(name: string, body?: Record<string, unknown>): Promise<StripeAction> {
  const { data, error } = await call(name, body);
  if (error) return { success: false, error };
  if (!data?.url) return { success: false, error: data?.message || 'O Stripe não retornou um link válido.' };
  return { success: true, url: data.url };
}

export const createStripeCheckout = (planName: string) => invoke('stripe-checkout', { planName });
export const createStripePortal = () => invoke('stripe-portal');
export const changeStripePlan = async (planName: string): Promise<StripeAction> => {
  const { data, error } = await call('stripe-change-plan', { planName });
  if (error) return { success: false, error };
  return data?.ok ? { success: true } : { success: false, error: data?.message || 'Não foi possível trocar de plano.' };
};
