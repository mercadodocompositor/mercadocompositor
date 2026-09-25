import { supabase } from './supabase';
import { APP_CONFIG } from '../config/appConfig';
import { formatMoneyBR } from './plans';
import { formatBrazilianDate } from './dateUtils';
import type { Invoice } from '../types';

export interface InvoiceReceiptInput {
  invoice: Invoice;
  /** Número sequencial exibido na tela ("001"). */
  number: string;
  composerName: string;
  composerEmail: string;
  /** Plano atual, usado só se o pagamento não estiver em subscription_payments. */
  fallbackPlanName: string;
}

const STATUS_LABEL: Record<string, string> = {
  pago: 'Pago',
  estornado: 'Estornado',
  pendente: 'Pendente',
  cancelado: 'Cancelado',
};

const formatPaymentMethod = (method?: string | null, type?: string | null) => {
  const clean = `${method || ''} ${type || ''}`.toLowerCase();
  if (clean.includes('pix') || clean.includes('bank_transfer')) return 'Pix';
  if (clean.includes('ticket') || clean.includes('bol')) return 'Boleto bancário';
  return 'Cartão de crédito';
};

/**
 * Gera o recibo em PDF de uma cobrança da assinatura. Os dados do plano e do
 * meio de pagamento vêm de subscription_payments (fonte da verdade; o
 * compositor lê só as próprias linhas pela RLS). O jsPDF é carregado sob
 * demanda para não entrar no bundle da página.
 */
export async function downloadInvoiceReceipt(input: InvoiceReceiptInput): Promise<void> {
  const { invoice } = input;

  let planName = input.fallbackPlanName;
  let paymentMethod = 'Cartão de crédito';
  let paidAt = invoice.date;
  if (supabase) {
    const { data } = await supabase
      .from('subscription_payments')
      .select('plan_name, payment_method, payment_type, paid_at')
      .eq('mp_payment_id', invoice.id)
      .maybeSingle();
    if (data) {
      planName = data.plan_name || planName;
      paymentMethod = formatPaymentMethod(data.payment_method, data.payment_type);
      paidAt = data.paid_at || paidAt;
    }
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Cabeçalho no mesmo padrão visual do termo de liberação.
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 24, 'F');
  doc.setFillColor(245, 158, 11);
  doc.rect(margin, y + 23, contentWidth, 1.5, 'F');
  doc.setTextColor(245, 158, 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(APP_CONFIG.name.toUpperCase(), margin + 6, y + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('RECIBO DE PAGAMENTO — ASSINATURA', margin + 6, y + 16);
  y += 34;

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${APP_CONFIG.company.legalName}`, margin, y);
  doc.text(`CNPJ ${APP_CONFIG.company.cnpj} • ${APP_CONFIG.company.supportEmail}`, margin, y + 5);
  y += 16;

  const rows: Array<[string, string]> = [
    ['Recibo nº', input.number],
    ['Data do pagamento', formatBrazilianDate(paidAt) || paidAt],
    ['Assinante', input.composerName || '—'],
    ['E-mail', input.composerEmail || '—'],
    ['Descrição', `Assinatura mensal — ${planName}`],
    ['Forma de pagamento', paymentMethod],
    ['Referência da transação', invoice.id],
    ['Situação', STATUS_LABEL[invoice.status] || invoice.status],
  ];

  doc.setDrawColor(226, 232, 240);
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(value, contentWidth - 60), margin + 60, y);
    y += 4;
    doc.line(margin, y, margin + contentWidth, y);
    y += 6;
  }

  y += 4;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('VALOR', margin + 6, y + 11);
  doc.setFontSize(16);
  doc.setTextColor(invoice.status === 'estornado' ? 185 : 15, invoice.status === 'estornado' ? 28 : 23, invoice.status === 'estornado' ? 28 : 42);
  doc.text(`R$ ${formatMoneyBR(invoice.value)}`, margin + contentWidth - 6, y + 12, { align: 'right' });
  y += 30;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const footer = [
    invoice.status === 'estornado'
      ? 'Este pagamento foi estornado e o valor devolvido ao meio de pagamento original.'
      : 'Declaramos ter recebido o valor acima referente à assinatura mensal da plataforma.',
    'Documento emitido eletronicamente pelo painel do assinante. Este recibo não substitui a nota fiscal de serviço.',
  ];
  doc.text(doc.splitTextToSize(footer.join(' '), contentWidth), margin, y);

  doc.save(`recibo-${input.number}-${APP_CONFIG.shortName.toLowerCase()}.pdf`);
}
