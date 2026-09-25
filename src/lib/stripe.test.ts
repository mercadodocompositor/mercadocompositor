import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('integração Stripe', () => {
  const checkout = readFileSync('supabase/functions/stripe-checkout/index.ts', 'utf8');
  const webhook = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
  it('cria assinatura usando preço validado no catálogo', () => {
    expect(checkout).toContain("mode:'subscription'");
    expect(checkout).toContain("from('subscription_plans')");
    expect(checkout).toContain("client_reference_id:user.id");
  });
  it('valida assinatura e trata eventos idempotentemente', () => {
    expect(webhook).toContain("req.headers.get('stripe-signature')");
    expect(webhook).toContain("from('stripe_webhook_events').insert");
    expect(webhook).toContain("invoice.payment_failed");
  });
  it('concede teste grátis só na primeira assinatura e evita checkout duplicado', () => {
    expect(checkout).toContain("subscription_data[trial_period_days]");
    expect(checkout).toContain("status=open");
    expect(checkout).toContain("/expire");
  });
  it('não ignora falhas de gravação e lê a assinatura da fatura no formato novo', () => {
    expect(webhook).toContain("if(updateError)throw updateError");
    expect(webhook).toContain("parent?.subscription_details?.subscription");
    expect(webhook).toContain("ASSINATURA DUPLICADA");
  });
  it('usa preço fixo por plano e identifica o plano pelo Product', () => {
    const shared = readFileSync('supabase/functions/_shared/stripe.ts', 'utf8');
    expect(shared).toContain("export async function ensurePlanPrice");
    expect(checkout).toContain("'line_items[0][price]':priceId");
    expect(checkout).not.toContain('price_data');
    expect(webhook).toContain("eq('stripe_product_id',productId)");
  });
  it('mantém past_due ativo e grava faturas de forma atômica', () => {
    expect(webhook).toContain("['active','trialing','past_due'].includes(stripeStatus)?'active'");
    expect(webhook).toContain("rpc('upsert_subscription_invoice'");
    expect(webhook).toContain("candidates.some(candidate=>safeEqual(signature,candidate))");
  });
  it('troca de plano bloqueia downgrade acima do limite de músicas', () => {
    const changePlan = readFileSync('supabase/functions/stripe-change-plan/index.ts', 'utf8');
    expect(changePlan).toContain("from('songs')");
    expect(changePlan).toContain("payment_behavior='pending_if_incomplete'");
  });
});
