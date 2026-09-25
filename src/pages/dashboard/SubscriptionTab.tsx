import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { APP_CONFIG } from '../../config/appConfig';
import { SUBSCRIPTION_STATUS_META } from '../../lib/subscriptionStatus';
import { formatMoneyBR, listOfferedPlans, parseMoneyBR, resolvePlan, type ResolvedPlan } from '../../lib/plans';
import { formatBrazilianDate } from '../../lib/dateUtils';
import { DashboardCard, DashboardSectionHeader } from '../../components/dashboard/DashboardUI';
import { downloadInvoiceReceipt } from '../../lib/invoiceReceipt';
import { changeStripePlan, createStripeCheckout, createStripePortal } from '../../lib/stripe';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import type { Invoice } from '../../types';
import { AlertCircle, CalendarClock, CheckCircle2, CreditCard, Download, ExternalLink, FileText, Info, Loader2, Lock, RefreshCw } from 'lucide-react';

const INVOICES_PREVIEW = 12;
// O webhook grava a troca de plano alguns segundos depois da confirmação do Stripe.
const PLAN_CHANGE_POLL_ATTEMPTS = 6;
const PLAN_CHANGE_POLL_INTERVAL_MS = 1500;
// Na volta do checkout o webhook pode demorar um pouco mais que na troca de plano.
const CHECKOUT_POLL_ATTEMPTS = 10;
const CHECKOUT_POLL_INTERVAL_MS = 2000;
const INVOICE_STATUS: Record<Invoice['status'], { label: string; className: string }> = {
  pago: { label: 'Pago', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  pendente: { label: 'Pendente', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  falhou: { label: 'Não aprovado', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  cancelado: { label: 'Cancelado', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  estornado: { label: 'Estornado', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

type CheckoutReturn = 'confirming' | 'confirmed' | 'delayed' | 'cancelled';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const Banner: React.FC<{ tone: 'info' | 'success' | 'warning' | 'danger'; icon: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }> = ({ tone, icon, title, children, action }) => {
  const toneClass = {
    info: 'border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200',
    success: 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200',
    warning: 'border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200',
    danger: 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200',
  }[tone];
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-3 text-sm ${toneClass}`}>
      <div className="flex items-start gap-3 flex-1"><span className="shrink-0 mt-0.5">{icon}</span><div><strong className="block">{title}</strong>{children && <span className="text-xs">{children}</span>}</div></div>
      {action}
    </div>
  );
};

export const SubscriptionTab: React.FC = () => {
  const { subscription, refreshSubscription, subscriptionPlans, profile, authLoading } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const plan = resolvePlan(subscriptionPlans, subscription.planName);
  const offeredPlans = listOfferedPlans(subscriptionPlans);
  const statusMeta = SUBSCRIPTION_STATUS_META[subscription.status];
  const isPending = subscription.status === 'pending';
  // Espelha a regra do stripe-checkout: o teste grátis vale só para a primeira assinatura.
  const trialAvailable = !subscription.stripeSubscriptionId && !subscription.trialStartedAt;
  // Com assinatura em vigor, os outros planos são troca de plano, não uma nova assinatura.
  const canChangePlan = subscription.status === 'active' && !!subscription.stripeSubscriptionId;
  const hasBillingPortal = !!subscription.stripeCustomerId && !!subscription.stripeSubscriptionId;
  const isTrialing = subscription.stripeSubscriptionStatus === 'trialing';
  const isPastDue = subscription.stripeSubscriptionStatus === 'past_due';
  const scheduledEnd = subscription.status === 'active' ? subscription.cancelAt : undefined;
  // Valor que o Stripe cobra deste assinante; o catálogo pode ter sido reajustado depois.
  const contractedPrice = parseMoneyBR(subscription.monthlyPrice) ?? plan.monthlyPrice;
  const [planToChange, setPlanToChange] = useState<ResolvedPlan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const invoicesNewestFirst = subscription.invoices.map((invoice, index) => ({ invoice, number: invoice.number || String(index + 1).padStart(3, '0') })).reverse();
  const visibleInvoices = showAllInvoices ? invoicesNewestFirst : invoicesNewestFirst.slice(0, INVOICES_PREVIEW);

  // Volta do checkout do Stripe: o webhook grava a assinatura alguns segundos
  // depois, então a página acompanha até ela aparecer como ativa.
  useEffect(() => {
    const result = searchParams.get('stripe');
    if (!result) return;
    // Remove o parâmetro para que recarregar a página não repita a mensagem.
    const next = new URLSearchParams(searchParams);
    next.delete('stripe');
    setSearchParams(next, { replace: true });
    if (result === 'cancelled') { setCheckoutReturn('cancelled'); return; }
    if (result !== 'success') return;
    let stopped = false;
    setCheckoutReturn('confirming');
    void (async () => {
      for (let attempt = 0; attempt < CHECKOUT_POLL_ATTEMPTS; attempt++) {
        const latest = await refreshSubscription();
        if (stopped) return;
        if (latest?.status === 'active') { setCheckoutReturn('confirmed'); return; }
        await sleep(CHECKOUT_POLL_INTERVAL_MS);
        if (stopped) return;
      }
      setCheckoutReturn('delayed');
    })();
    return () => { stopped = true; };
    // Só na montagem: o parâmetro é consumido e removido da URL acima.
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const latest = await refreshSubscription();
      if (checkoutReturn === 'delayed' && latest?.status === 'active') setCheckoutReturn('confirmed');
    } finally { setIsRefreshing(false); }
  };

  const handleDownloadReceipt = async (invoice: Invoice, number: string) => {
    setReceiptLoadingId(invoice.id);
    setError(null);
    try {
      await downloadInvoiceReceipt({ invoice, number, composerName: profile.name || profile.stageName, composerEmail: profile.email, fallbackPlanName: subscription.planName });
    } catch (cause) {
      console.error('[Assinatura] Falha ao gerar recibo:', cause);
      setError('Não foi possível gerar o recibo agora. Tente novamente em instantes.');
    } finally { setReceiptLoadingId(null); }
  };

  const openStripe = async (planName?: string) => {
    setError(null); setNotice(null); setCheckoutReturn(null); setPaymentLoading(planName || 'portal');
    const result = planName ? await createStripeCheckout(planName) : await createStripePortal();
    if (result.success && result.url) window.location.href = result.url;
    else { setError(result.error || 'Não foi possível abrir o Stripe.'); setPaymentLoading(null); }
  };

  const loadLatest = async () => (await refreshSubscription())?.planName;

  const confirmPlanChange = async () => {
    if (!planToChange) return;
    const target = planToChange.name;
    setError(null); setNotice(null); setPaymentLoading(target);
    const result = await changeStripePlan(target);
    if (!result.success) {
      setError(result.error || 'Não foi possível trocar de plano.');
      setPaymentLoading(null); setPlanToChange(null);
      return;
    }
    let latest = await loadLatest();
    for (let attempt = 1; attempt < PLAN_CHANGE_POLL_ATTEMPTS && latest !== target; attempt++) {
      await sleep(PLAN_CHANGE_POLL_INTERVAL_MS);
      latest = await loadLatest();
    }
    setNotice(latest === target ? `Plano alterado para ${target}.` : `Troca para ${target} confirmada no Stripe. Ela aparece aqui em instantes.`);
    setPaymentLoading(null); setPlanToChange(null);
  };

  if (subscription.isPlaceholder) {
    if (!authLoading) return (
      <div className="max-w-4xl mx-auto"><div role="alert" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl flex items-center gap-4">
        <AlertCircle className="w-6 h-6 text-amber-500" /><div className="flex-1"><strong className="block">Não foi possível carregar sua assinatura</strong><span className="text-xs text-slate-500">Verifique sua conexão e tente novamente.</span></div>
        <button type="button" onClick={handleRefresh} disabled={isRefreshing} className="px-4 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50">Tentar novamente</button>
      </div></div>
    );
    return <div className="max-w-4xl mx-auto h-48 rounded-3xl bg-slate-100 dark:bg-slate-900 animate-pulse" aria-label="Carregando assinatura" />;
  }

  const portalButton = (label: string, primary = false) => (
    <button type="button" onClick={() => void openStripe()} disabled={paymentLoading !== null} className={`shrink-0 px-4 py-2.5 rounded-xl font-bold text-xs disabled:opacity-50 ${primary ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'}`}>
      {paymentLoading === 'portal' ? 'Abrindo...' : label}
    </button>
  );

  const billingDate = scheduledEnd
    ? { label: 'Acesso até', value: scheduledEnd }
    : isTrialing ? { label: 'Teste grátis até', value: subscription.nextBillingDate }
    : subscription.status === 'active' ? { label: 'Próxima cobrança', value: subscription.nextBillingDate }
    : { label: 'Válido até', value: subscription.nextBillingDate };

  const plansTitle = isPending ? 'Escolha seu plano' : canChangePlan ? 'Trocar de plano' : 'Assinar novamente';

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <header><h1 className="text-2xl font-black text-slate-900 dark:text-white">Assinatura</h1><p className="text-sm text-slate-500 dark:text-slate-400">Gerencie seu plano, pagamentos e faturas.</p></header>

      {checkoutReturn === 'confirming' && <Banner tone="info" icon={<Loader2 className="w-5 h-5 animate-spin" />} title="Pagamento recebido. Ativando sua assinatura...">Isso leva só alguns segundos.</Banner>}
      {checkoutReturn === 'confirmed' && <Banner tone="success" icon={<CheckCircle2 className="w-5 h-5" />} title={isTrialing ? 'Seu teste grátis começou!' : 'Assinatura ativa!'}>
        {isTrialing ? 'Seu perfil e suas músicas já estão no catálogo. A primeira cobrança só acontece no fim do teste.' : 'Seu perfil e suas músicas já estão visíveis no catálogo público.'}
      </Banner>}
      {checkoutReturn === 'delayed' && <Banner tone="warning" icon={<AlertCircle className="w-5 h-5" />} title="Estamos confirmando seu pagamento" action={<button type="button" onClick={handleRefresh} disabled={isRefreshing} className="shrink-0 px-4 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50">{isRefreshing ? 'Atualizando...' : 'Atualizar'}</button>}>
        O Stripe recebeu seu pagamento, mas a confirmação ainda não chegou aqui. Isso pode levar alguns minutos; não é preciso pagar de novo.
      </Banner>}
      {checkoutReturn === 'cancelled' && <Banner tone="info" icon={<Info className="w-5 h-5" />} title="Pagamento não concluído">Você saiu do checkout antes de finalizar. Nenhuma cobrança foi feita.</Banner>}
      {error && <Banner tone="danger" icon={<AlertCircle className="w-5 h-5" />} title={error} />}
      {notice && <Banner tone="success" icon={<CheckCircle2 className="w-5 h-5" />} title={notice} />}
      {isPastDue && <Banner tone="warning" icon={<AlertCircle className="w-5 h-5" />} title="Pagamento em atraso" action={hasBillingPortal && portalButton('Atualizar cartão', true)}>
        A última cobrança não foi aprovada e o Stripe vai tentar de novo. Seu catálogo continua visível por enquanto; atualize o cartão para evitar a suspensão.
      </Banner>}
      {subscription.status === 'suspended' && <Banner tone="danger" icon={<AlertCircle className="w-5 h-5" />} title="Assinatura suspensa" action={hasBillingPortal ? portalButton('Regularizar pagamento', true) : undefined}>
        {hasBillingPortal
          ? 'As cobranças não foram aprovadas e seu catálogo está oculto. Atualize o cartão e pague a fatura em aberto para restaurar a visibilidade.'
          : <>Seu catálogo está oculto. Fale com o suporte em <a className="underline" href={`mailto:${APP_CONFIG.company.supportEmail}?subject=Assinatura suspensa`}>{APP_CONFIG.company.supportEmail}</a>.</>}
      </Banner>}
      {scheduledEnd && <Banner tone="warning" icon={<CalendarClock className="w-5 h-5" />} title={`Sua assinatura termina em ${formatBrazilianDate(scheduledEnd) || scheduledEnd}`} action={hasBillingPortal && portalButton('Manter assinatura')}>
        Até lá tudo continua funcionando. Depois dessa data seu catálogo sai do ar e não há novas cobranças.
      </Banner>}

      {isPending ? <DashboardCard>
        <DashboardSectionHeader title="Nenhum plano contratado" description={statusMeta.label} />
        <div className="p-5 sm:p-6 text-sm text-slate-600 dark:text-slate-300 space-y-1">
          <p>Você ainda não tem uma assinatura paga. Escolha um dos planos abaixo para liberar seu perfil e suas músicas no catálogo público.</p>
          {trialAvailable && <p className="font-semibold text-emerald-600 dark:text-emerald-400">Sua primeira assinatura tem 7 dias grátis. A cobrança só começa depois do período de teste, e você pode cancelar antes.</p>}        </div>
      </DashboardCard> : <DashboardCard>
        <DashboardSectionHeader title={subscription.planName} description={statusMeta.label} />
        <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><span className="text-xs text-slate-500 block">Valor mensal contratado</span><strong className="text-xl">R$ {formatMoneyBR(contractedPrice)}</strong></div>
          <div><span className="text-xs text-slate-500 block">Situação</span><strong className={statusMeta.textClass}>{isTrialing ? 'Teste grátis' : statusMeta.label}</strong></div>
          <div><span className="text-xs text-slate-500 block">{billingDate.label}</span><strong>{formatBrazilianDate(billingDate.value) || 'Não informado'}</strong></div>
        </div>
        {plan.features.length > 0 && <div className="px-5 sm:px-6 pb-6"><ul className="grid sm:grid-cols-2 gap-2">{plan.features.map(feature => <li key={feature} className="text-xs text-slate-600 dark:text-slate-300 flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />{feature}</li>)}</ul></div>}
        {hasBillingPortal && <div className="px-5 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs text-slate-500">Cartão, faturas e cancelamento ficam no portal seguro do Stripe.</span>
          <button type="button" onClick={() => void openStripe()} disabled={paymentLoading !== null} className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-xs disabled:opacity-50"><CreditCard className="inline w-4 h-4 mr-2" />{paymentLoading === 'portal' ? 'Abrindo...' : 'Gerenciar cobrança'}</button>
        </div>}
      </DashboardCard>}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">{plansTitle}</h2>
          <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1"><Lock className="w-3.5 h-3.5" />Pagamento processado pelo Stripe. A plataforma não recebe nem armazena os dados do seu cartão.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{offeredPlans.map(item => {
          const isCurrent = !isPending && subscription.planName === item.name;
          return <div key={item.name} className={`p-5 rounded-3xl border bg-white dark:bg-slate-900 flex flex-col ${isCurrent ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-slate-200 dark:border-slate-800'}`}>
            <div className="flex items-center justify-between gap-2"><strong>{item.name}</strong>{isCurrent && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Seu plano</span>}</div>
            <span className="text-2xl font-black text-amber-500 mt-2">R$ {formatMoneyBR(item.monthlyPrice)}<small className="text-xs font-normal text-slate-500">/mês</small></span>
            {!canChangePlan && trialAvailable && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">7 dias grátis, depois R$ {formatMoneyBR(item.monthlyPrice)}/mês</span>}
            <ul className="my-4 space-y-2 flex-1">{item.features.map(feature => <li key={feature} className="text-xs text-slate-500 flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />{feature}</li>)}</ul>
            {canChangePlan
              ? <button type="button" onClick={() => setPlanToChange(item)} disabled={paymentLoading !== null || isCurrent} className="px-4 py-3 rounded-xl bg-amber-400 text-slate-950 font-bold text-sm disabled:opacity-50">{paymentLoading === item.name ? 'Trocando plano...' : isCurrent ? 'Plano atual' : item.monthlyPrice > contractedPrice ? 'Fazer upgrade' : 'Mudar para este plano'}</button>
              : <button type="button" onClick={() => void openStripe(item.name)} disabled={paymentLoading !== null} className="px-4 py-3 rounded-xl bg-amber-400 text-slate-950 font-bold text-sm disabled:opacity-50">{paymentLoading === item.name ? 'Abrindo Stripe...' : trialAvailable ? 'Começar 7 dias grátis' : 'Assinar com Stripe'}</button>}
          </div>;
        })}</div>
      </section>

      {subscription.invoices.length > 0 && <DashboardCard className="overflow-hidden">
        <DashboardSectionHeader title="Histórico financeiro" description="Cobranças da sua assinatura" />
        <div className="divide-y divide-slate-200 dark:divide-slate-800 px-5 sm:px-6">{visibleInvoices.map(({ invoice, number }) => {
          const status = INVOICE_STATUS[invoice.status] || { label: invoice.status, className: INVOICE_STATUS.cancelado.className };
          const hasReceipt = invoice.status === 'pago' || invoice.status === 'estornado';
          return <div key={invoice.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3"><FileText className="w-4 h-4 text-slate-500" /><div><strong className="block">Fatura nº {number}</strong><span className="text-slate-500">{formatBrazilianDate(invoice.date) || invoice.date}</span></div></div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold">R$ {formatMoneyBR(invoice.value)}</span>
              <span className={`px-2 py-0.5 rounded-full font-semibold ${status.className}`}>{status.label}</span>
              {invoice.status === 'falhou' && invoice.hostedUrl && <a href={invoice.hostedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold">Pagar agora<ExternalLink className="w-3.5 h-3.5" /></a>}
              {/* O recibo oficial do Stripe tem prioridade; o PDF próprio cobre faturas antigas sem link. */}
              {hasReceipt && (invoice.pdfUrl
                ? <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700"><Download className="w-3.5 h-3.5" />Recibo</a>
                : <button type="button" onClick={() => handleDownloadReceipt(invoice, number)} disabled={receiptLoadingId !== null} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-50">{receiptLoadingId === invoice.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Recibo</button>)}
            </div>
          </div>;
        })}</div>
        {invoicesNewestFirst.length > INVOICES_PREVIEW && <button type="button" onClick={() => setShowAllInvoices(value => !value)} className="m-5 text-xs font-semibold text-amber-600">{showAllInvoices ? 'Mostrar só as mais recentes' : `Ver todas as ${invoicesNewestFirst.length} faturas`}</button>}
      </DashboardCard>}

      <AdminConfirmDialog
        isOpen={planToChange !== null}
        variant="info"
        title={planToChange ? `Trocar para o ${planToChange.name}?` : ''}
        description={!planToChange ? '' : isTrialing
          ? `Você está no teste grátis. O novo valor de R$ ${formatMoneyBR(planToChange.monthlyPrice)}/mês vale a partir da primeira cobrança.`
          : planToChange.monthlyPrice > contractedPrice
            ? `A mensalidade passa para R$ ${formatMoneyBR(planToChange.monthlyPrice)}. A diferença proporcional até o fim do período atual é cobrada agora no cartão cadastrado.`
            : `A mensalidade passa para R$ ${formatMoneyBR(planToChange.monthlyPrice)}. O valor não usado do plano atual vira crédito na próxima fatura.`}
        confirmLabel="Trocar de plano"
        isLoading={paymentLoading !== null}
        onConfirm={() => void confirmPlanChange()}
        onCancel={() => setPlanToChange(null)}
      />

      <footer className="text-center text-xs text-slate-500 space-y-2">
        <p>{hasBillingPortal ? 'Para trocar o cartão, baixar faturas ou cancelar, use “Gerenciar cobrança”. ' : ''}Outras dúvidas: <a className="underline" href={`mailto:${APP_CONFIG.company.supportEmail}?subject=Assinatura`}>{APP_CONFIG.company.supportEmail}</a></p>
        <nav className="flex justify-center gap-3"><Link to="/termos" className="hover:underline">Termos de Uso</Link><Link to="/privacidade" className="hover:underline">Privacidade</Link></nav>
      </footer>
    </div>
  );
};
