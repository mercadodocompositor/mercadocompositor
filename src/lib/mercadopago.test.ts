import { describe, it, expect } from 'vitest';
import { 
  parsePaymentFeedback, 
  formatPaymentMethod, 
  calculateNextBillingDate 
} from './mercadopago';

describe('Utilitários do Mercado Pago', () => {
  it('identifica retorno com pagamento aprovado (success/approved)', () => {
    const params1 = new URLSearchParams('payment=success&plan=Plano%20Prata');
    const result1 = parsePaymentFeedback(params1);
    expect(result1.isPaymentReturn).toBe(true);
    expect(result1.status).toBe('success');
    expect(result1.planName).toBe('Plano Prata');

    const params2 = new URLSearchParams('collection_status=approved&plan=Plano%20Ouro');
    const result2 = parsePaymentFeedback(params2);
    expect(result2.isPaymentReturn).toBe(true);
    expect(result2.status).toBe('success');
    expect(result2.planName).toBe('Plano Ouro');
  });

  it('identifica retorno com pagamento pendente (pending/in_process)', () => {
    const params = new URLSearchParams('collection_status=in_process&plan=Plano%20Bronze');
    const result = parsePaymentFeedback(params);
    expect(result.isPaymentReturn).toBe(true);
    expect(result.status).toBe('pending');
    expect(result.planName).toBe('Plano Bronze');
  });

  it('identifica retorno com pagamento rejeitado (failure/rejected)', () => {
    const params = new URLSearchParams('payment=failure&plan=Plano%20Prata');
    const result = parsePaymentFeedback(params);
    expect(result.isPaymentReturn).toBe(true);
    expect(result.status).toBe('failure');
  });

  it('retorna isPaymentReturn false quando não há parâmetros de pagamento', () => {
    const params = new URLSearchParams('tab=assinatura&view=details');
    const result = parsePaymentFeedback(params);
    expect(result.isPaymentReturn).toBe(false);
    expect(result.status).toBeNull();
  });

  it('formata métodos de pagamento conhecidos do Mercado Pago', () => {
    expect(formatPaymentMethod('pix')).toBe('Pix');
    expect(formatPaymentMethod('PIX_DYNAMIC')).toBe('Pix');
    expect(formatPaymentMethod('bolbradesco', 'ticket')).toBe('Boleto Bancário');
    expect(formatPaymentMethod('ticket', 'ticket')).toBe('Boleto Bancário');
    expect(formatPaymentMethod('account_money')).toBe('Saldo Mercado Pago');
    expect(formatPaymentMethod('master')).toBe('Cartão de Crédito');
    expect(formatPaymentMethod('visa')).toBe('Cartão de Crédito');
    expect(formatPaymentMethod()).toBe('Mercado Pago');
  });

  it('calcula data de próxima cobrança 30 dias à frente', () => {
    const base = new Date('2026-05-10T12:00:00Z');
    const nextDate = calculateNextBillingDate(base);
    expect(nextDate).toBeDefined();
    // 10 de maio + 30 dias = 9 de junho de 2026
    expect(nextDate).toContain('2026');
  });
});
