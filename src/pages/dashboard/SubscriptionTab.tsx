import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { APP_CONFIG } from '../../config/appConfig';
import { SUBSCRIPTION_STATUS_META } from '../../lib/subscriptionStatus';
import { formatMoneyBR, listOfferedPlans, resolvePlan } from '../../lib/plans';
import { formatBrazilianDate } from '../../lib/dateUtils';
import { DashboardCard, DashboardSectionHeader } from '../../components/dashboard/DashboardUI';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { downloadInvoiceReceipt } from '../../lib/invoiceReceipt';
import { cancelRecurringSubscription, createMercadoPagoPreference, parsePaymentFeedback, type CheckoutMode } from '../../lib/mercadopago';
import {
  CreditCard,
  FileText,
  CheckCircle2,
  Info,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  X,
  ExternalLink,
  Download,
  Clock,
  ChevronDown
} from 'lucide-react';

const INVOICES_PREVIEW = 12;

const INVOICE_STATUS_LABEL: Record<string, string> = {
  pago: 'Pago',
  pendente: 'Pendente',
  cancelado: 'Cancelado',
  estornado: 'Estornado',
};

export const SubscriptionTab: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { subscription, refreshSubscription, subscriptionPlans, profile, authLoading } = useApp();
  // Os planos e preços vêm de subscription_plans — o mesmo catálogo que a Edge
  // Function do checkout consulta para definir o valor cobrado.
  const offeredPlans = listOfferedPlans(subscriptionPlans);
  const currentPlan = resolvePlan(subscriptionPlans, subscription.planName);
  const statusMeta = SUBSCRIPTION_STATUS_META[subscription.status];

  // Chave `${plano}:${modo}` do botão que está gerando o pagamento.
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCancellingRenewal, setIsCancellingRenewal] = useState(false);
  const [renewalNotice, setRenewalNotice] = useState<string | null>(null);
  const hasAutoRenew = Boolean(subscription.autoRenew);
  const isInTrial = Boolean(subscription.trialEndsAt && new Date(subscription.trialEndsAt).getTime() > Date.now());
  const hasPaidInvoice = subscription.invoices.some(invoice => invoice.status === 'pago');
  const hasBillingHistory = subscription.invoices.length > 0;
  const hasSubscriptionDetails = hasBillingHistory
    || Boolean(subscription.nextBillingDate)
    || hasAutoRenew;
  const isOnlySelected = subscription.status === 'pending' && !hasSubscriptionDetails;
  // next_billing_date chega como "AAAA-MM-DD"; exibido sempre como DD/MM/AAAA.
  const nextBillingLabel = formatBrazilianDate(subscription.nextBillingDate);
  const trialEndsLabel = formatBrazilianDate(subscription.trialEndsAt);
  // Antes de a assinatura real carregar, o contexto traz um valor "pendente"
  // de fábrica: sem este cuidado a oferta de teste piscava para quem já pagou.
  const isTrialEligible = !subscription.isPlaceholder
    && !subscription.trialStartedAt && !hasPaidInvoice && subscription.status === 'pending';
  // Mesma data que a Edge Function usa como início da cobrança do teste.
  const trialFirstChargeLabel = formatBrazilianDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  // Assinatura iniciada no Mercado Pago e não concluída (compositor desistiu
  // ou fechou a aba antes de autorizar o cartão).
  const hasPendingAuthorization = subscription.recurringStatus === 'pending' && !hasAutoRenew;
  // Cancelou a renovação, mas o período pago continua valendo.
  const isRenewalCancelled = subscription.status === 'active' && !hasAutoRenew && subscription.recurringStatus === 'cancelled';
  const pageTitle = isOnlySelected ? 'Escolha seu plano' : 'Gerenciar assinatura';
  const pageDescription = isOnlySelected
    ? 'Compare os planos e contrate com segurança pelo Mercado Pago'
    : 'Acompanhe seu plano, próximas cobranças e histórico de pagamentos';
  const plansSectionTitle = isOnlySelected || subscription.status !== 'active' ? 'Planos disponíveis' : 'Trocar de plano';
  const statusNextStep = hasPendingAuthorization
    ? 'Conclua ou descarte a autorização iniciada no Mercado Pago.'
    : isOnlySelected
      ? isTrialEligible
        ? 'Comece seus 7 dias grátis para liberar o catálogo público.'
        : 'Escolha um plano para liberar novamente o catálogo público.'
      : statusMeta.nextStep;
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  // invoices só recebe inserções em ordem cronológica: a posição é um número
  // de fatura estável. A lista mostra da mais recente para a mais antiga.
  const invoicesNewestFirst = subscription.invoices
    .map((invoice, index) => ({ invoice, number: String(index + 1).padStart(3, '0') }))
    .reverse();
  const visibleInvoices = showAllInvoices ? invoicesNewestFirst : invoicesNewestFirst.slice(0, INVOICES_PREVIEW);
  // Para quem está com o plano ativo, a lista de planos começa recolhida:
  // o foco é o plano atual. Vencida ou cancelada, já abre para reassinar.
  const [showPlans, setShowPlans] = useState<boolean | null>(null);
  const isPlansOpen = isOnlySelected || (showPlans ?? subscription.status !== 'active');
  const [isDiscardingPending, setIsDiscardingPending] = useState(false);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<{
    status: 'success' | 'pending' | 'failure' | 'recurring';
    planName: string | null;
  } | null>(null);
  // Na volta do Mercado Pago, o webhook costuma chegar alguns segundos depois
  // do redirecionamento. A página consulta a assinatura até a confirmação
  // (ou por até 1 minuto) em vez de afirmar de cara que deu certo.
  const [confirmationStartedAt, setConfirmationStartedAt] = useState<number | null>(null);
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false);
  const isReturnInProgress = paymentNotice !== null && paymentNotice.status !== 'failure';
  const isReturnConfirmed = isReturnInProgress
    && subscription.status === 'active'
    && (!paymentNotice?.planName || subscription.planName === paymentNotice.planName)
    && (paymentNotice?.status !== 'recurring' || hasAutoRenew);
  const isAwaitingConfirmation = isReturnInProgress && !isReturnConfirmed && !confirmationTimedOut;

  useEffect(() => {
    if (!isAwaitingConfirmation || confirmationStartedAt === null) return;
    const interval = window.setInterval(() => {
      if (Date.now() - confirmationStartedAt >= 60_000) {
        setConfirmationTimedOut(true);
        return;
      }
      void refreshSubscription();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [isAwaitingConfirmation, confirmationStartedAt, refreshSubscription]);

  // Analisa retorno de pagamento vindo do Mercado Pago
  useEffect(() => {
    const feedback = parsePaymentFeedback(searchParams);
    if (feedback.isPaymentReturn && feedback.status) {
      setPaymentNotice({
        status: feedback.status,
        planName: feedback.planName
      });

      // O webhook do Mercado Pago pode chegar alguns segundos depois do
      // redirecionamento: recarrega agora e de novo em seguida.
      if (feedback.status !== 'failure') {
        void refreshSubscription();
        setConfirmationStartedAt(Date.now());
        setConfirmationTimedOut(false);
      }

      // Limpa os parâmetros de busca da URL para não reenviar ao dar F5
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('payment');
      newParams.delete('collection_status');
      newParams.delete('status');
      newParams.delete('plan');
      newParams.delete('preference_id');
      newParams.delete('payment_id');
      setSearchParams(newParams, { replace: true });
    }
  }, [refreshSubscription, searchParams, setSearchParams]);

  // Voltar do Mercado Pago pelo botão "voltar" restaura a página do cache
  // (bfcache) com o botão ainda em "Abrindo Mercado Pago...".
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setCheckoutLoadingPlan(null);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // Antes de abrir a assinatura, confirma o e-mail da conta Mercado Pago: o
  // Mercado Pago só aceita a autorização de quem estiver logado com ele.
  const [emailDialogPlan, setEmailDialogPlan] = useState<string | null>(null);
  const [mpEmail, setMpEmail] = useState('');
  const [mpEmailError, setMpEmailError] = useState<string | null>(null);

  // Espelha as regras da Edge Function mercadopago-checkout para o compositor
  // saber, antes de sair do site, quanto paga hoje e quando vem a cobrança.
  const describeCheckout = (planName: string) => {
    const plan = resolvePlan(subscriptionPlans, planName);
    const price = `R$ ${formatMoneyBR(plan.monthlyPrice)}`;
    const isActive = subscription.status === 'active';
    const isPlanChange = isActive && subscription.planName !== plan.name;
    const today = new Date().toISOString().slice(0, 10);
    const hasPaidPeriod = isActive && !isPlanChange && subscription.nextBillingDate > today;

    if (isTrialEligible) {
      return {
        title: 'Confirme seu teste grátis',
        rows: [['Plano', plan.name], ['Cobrado hoje', 'R$ 0,00'], ['1ª cobrança', `${price} em ${trialFirstChargeLabel}`], ['Depois', `${price} por mês`]],
        note: `Cancele até ${trialFirstChargeLabel} e nada será cobrado.`
      };
    }
    if (isPlanChange) {
      return {
        title: 'Confirme a troca de plano',
        rows: [['Plano atual', subscription.planName], ['Novo plano', plan.name], ['Cobrado hoje', price], ['Depois', `${price} por mês`]],
        note: `O ${plan.name} passa a valer assim que o pagamento for aprovado. Os dias restantes do ${subscription.planName} são somados ao novo período e a renovação anterior é cancelada.`
      };
    }
    if (hasPaidPeriod) {
      return {
        title: 'Confirme a renovação automática',
        rows: [['Plano', plan.name], ['Cobrado hoje', 'R$ 0,00'], ['1ª cobrança', `${price} em ${nextBillingLabel}`], ['Depois', `${price} por mês`]],
        note: 'O período que você já pagou continua valendo. A cobrança começa no vencimento.'
      };
    }
    return {
      title: 'Confirme sua assinatura',
      rows: [['Plano', plan.name], ['Cobrado hoje', price], ['Depois', `${price} por mês`]],
      note: 'Cancele quando quiser. O período pago continua valendo até o fim.'
    };
  };
  const checkoutSummary = emailDialogPlan ? describeCheckout(emailDialogPlan) : null;

  // O e-mail da conta Mercado Pago informado da última vez fica salvo neste
  // navegador para vir preenchido; na falta dele, usa o e-mail do cadastro.
  const mpEmailStorageKey = `mp_payer_email:${profile.email || 'anon'}`;

  const openCheckoutDialog = (planName: string) => {
    setCheckoutError(null);
    setMpEmailError(null);
    let remembered = '';
    try { remembered = localStorage.getItem(mpEmailStorageKey) || ''; } catch { /* storage indisponível */ }
    setMpEmail(current => current || remembered || profile.email || '');
    setEmailDialogPlan(planName);
  };

  const confirmCheckoutEmail = () => {
    const email = mpEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMpEmailError('Informe um e-mail válido.');
      return;
    }
    try { localStorage.setItem(mpEmailStorageKey, email); } catch { /* storage indisponível */ }
    const planName = emailDialogPlan;
    setEmailDialogPlan(null);
    if (planName) void handleCheckout(planName, 'recurring', email);
  };

  const handleCheckout = async (planName: string, mode: CheckoutMode = 'recurring', payerEmail?: string) => {
    setCheckoutError(null);
    setCheckoutLoadingPlan(`${planName}:${mode}`);

    try {
      const result = await createMercadoPagoPreference(planName, mode, payerEmail);
      if (!result.success || !result.url) {
        setCheckoutError(result.error || 'Não foi possível iniciar o pagamento. Tente novamente em instantes.');
        setCheckoutLoadingPlan(null);
        return;
      }

      // Redireciona para a autorização da assinatura no Mercado Pago
      window.location.href = result.url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Falha ao conectar com o Mercado Pago.');
      setCheckoutLoadingPlan(null);
    }
  };

  const validUntilText = nextBillingLabel ? ` Seu plano continua ativo até ${nextBillingLabel}.` : '';

  const handleCancelRenewal = async () => {
    setCheckoutError(null);
    setIsCancellingRenewal(true);
    try {
      const result = await cancelRecurringSubscription();
      if (!result.success) {
        setCheckoutError(result.error || 'Não foi possível cancelar a renovação automática. Tente novamente.');
        return;
      }
      setRenewalNotice(`Renovação automática cancelada.${validUntilText} Depois disso, assine novamente quando quiser.`);
      await refreshSubscription();
    } finally {
      setIsCancellingRenewal(false);
      setIsCancelDialogOpen(false);
    }
  };

  // Descarta a autorização pendente no Mercado Pago (o link deixa de valer).
  const handleDiscardPending = async () => {
    setCheckoutError(null);
    setIsDiscardingPending(true);
    try {
      const result = await cancelRecurringSubscription();
      if (!result.success) {
        setCheckoutError(result.error || 'Não foi possível descartar a assinatura pendente. Tente novamente.');
        return;
      }
      setRenewalNotice('Assinatura pendente descartada. Nenhuma cobrança foi feita.');
      await refreshSubscription();
    } finally {
      setIsDiscardingPending(false);
    }
  };

  const handleDownloadReceipt = async (invoice: (typeof subscription.invoices)[number], number: string) => {
    setReceiptLoadingId(invoice.id);
    try {
      await downloadInvoiceReceipt({
        invoice,
        number,
        composerName: profile.name || profile.stageName,
        composerEmail: profile.email,
        fallbackPlanName: subscription.planName,
      });
    } catch (err) {
      console.error('[Assinatura] Falha ao gerar recibo:', err);
      setCheckoutError('Não foi possível gerar o recibo agora. Tente novamente em instantes.');
    } finally {
      setReceiptLoadingId(null);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSubscription();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Enquanto a assinatura real não chega, o contexto traz um valor provisório
  // "pendente": mostrar a página com ele fazia quem já paga ver "Escolha seu
  // plano" por um instante.
  if (subscription.isPlaceholder) {
    if (!authLoading) {
      return (
        <div className="max-w-4xl mx-auto animate-fadeIn">
          <div role="alert" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center gap-4">
            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="flex-1">
              <strong className="block text-[#0A1128] dark:text-white text-sm">Não foi possível carregar sua assinatura</strong>
              <span className="text-xs text-slate-500 dark:text-slate-400">Verifique sua conexão e tente novamente.</span>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Tentar novamente</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto space-y-6" aria-busy="true" aria-label="Carregando assinatura">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl space-y-2 animate-pulse">
          <div className="h-6 w-56 rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="h-3 w-80 max-w-full rounded bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-3xl space-y-3 animate-pulse">
              <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-8 w-32 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800 mt-4" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl h-48 animate-pulse" />
      </div>
    );
  }

  // Quem ainda não assina escolhe o plano primeiro; quem já assina vê antes o
  // resumo do plano atual, com a troca de plano recolhida logo abaixo.
  const plansSection = (
    <>
      {/* Available Plans */}
      <section className="space-y-3" aria-labelledby="available-plans-title">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            {isOnlySelected ? (
              <h2 id="available-plans-title" className="font-bold text-slate-900 dark:text-white text-lg">{plansSectionTitle}</h2>
            ) : (
              <h2 id="available-plans-title" className="font-bold text-slate-900 dark:text-white text-lg">
                <button
                  type="button"
                  onClick={() => setShowPlans(!isPlansOpen)}
                  aria-expanded={isPlansOpen}
                  aria-controls="available-plans-grid"
                  className="flex items-center gap-2 hover:text-amber-500 dark:hover:text-amber-400 transition"
                >
                  <span>{plansSectionTitle}</span>
                  <ChevronDown className={`w-5 h-5 transition-transform ${isPlansOpen ? 'rotate-180' : ''}`} />
                </button>
              </h2>
            )}
            <p className="text-xs text-slate-600 dark:text-slate-400">{isTrialEligible ? `Experimente 7 dias grátis. Cadastre o cartão agora: a primeira cobrança só acontece em ${trialFirstChargeLabel}.` : 'Assinatura mensal com renovação automática no cartão de crédito via Mercado Pago.'} Cancele quando quiser.</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Mercado Pago Protegido</span>
          </div>
        </div>

        {isPlansOpen && (
        <div id="available-plans-grid" className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
          {offeredPlans.map(plan => {
            const isCurrent = subscription.planName === plan.name;
            const isActive = isCurrent && subscription.status === 'active';
            const isLoadingRecurring = checkoutLoadingPlan === `${plan.name}:recurring`;
            const isBusy = checkoutLoadingPlan !== null;
            const hasRenewalHere = isCurrent && hasAutoRenew;
            // Mesmo plano em destaque na página inicial ("Mais Popular").
            const isHighlighted = !isCurrent && Boolean(APP_CONFIG.plans.find(item => item.name === plan.name)?.highlight);
            // Quem já assina tem a ação principal no resumo; aqui é só troca.
            const isPlanChange = !isOnlySelected && !isCurrent;

            return (
              <div
                key={plan.name}
                className={`relative text-left p-5 rounded-3xl border flex flex-col justify-between transition-all ${
                  isCurrent
                    ? 'bg-white dark:bg-slate-900/90 border-amber-500 ring-2 ring-amber-500/25 shadow-xl shadow-amber-500/10'
                    : isHighlighted
                      ? 'bg-white dark:bg-slate-900 border-emerald-500/60 shadow-xl shadow-emerald-500/10 hover:border-emerald-400 hover:-translate-y-0.5'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:-translate-y-0.5'
                }`}
              >
                {isHighlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-950 shadow-lg">
                    Mais escolhido
                  </span>
                )}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold block text-[#0A1128] dark:text-white">{plan.name}</span>
                    {isCurrent && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-extrabold ${isActive ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'}`}>
                        {isActive ? 'Plano ativo' : 'Selecionado'}
                      </span>
                    )}
                  </div>

                  <span className="text-2xl font-black block mt-2 text-amber-600 dark:text-amber-400">
                    R$ {formatMoneyBR(plan.monthlyPrice)}<small className="text-xs font-normal text-slate-500 dark:text-slate-400">/mês</small>
                  </span>
                  <span className="text-xs block mt-1 text-slate-600 dark:text-slate-300">
                    {plan.maxSongs ? `Até ${plan.maxSongs} músicas` : 'Músicas ilimitadas'}
                  </span>
                  {isTrialEligible && <span className="text-xs block mt-2 font-bold text-emerald-600 dark:text-emerald-400">7 dias grátis • depois R$ {formatMoneyBR(plan.monthlyPrice)}/mês</span>}

                  <ul className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    {plan.features.map(feature => (
                      <li key={feature} className="text-[11px] flex items-start gap-2 text-slate-500 dark:text-slate-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Checkout CTA */}
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                  {isActive && (
                    <div className="text-center py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Seu plano está ativo</span>
                    </div>
                  )}

                  {hasRenewalHere ? (
                    <div className="text-center py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Renovação automática ativa</span>
                    </div>
                  ) : isCurrent && hasPendingAuthorization ? (
                    <div className="text-center py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                      Conclua a autorização acima
                    </div>
                  ) : isCurrent && !isOnlySelected ? (
                    <div className="text-center py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                      Seu plano atual
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openCheckoutDialog(plan.name)}
                      disabled={isBusy}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 ${
                        isPlanChange
                          ? 'border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                          : 'shadow-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                      }`}
                    >
                      {isLoadingRecurring ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Abrindo Mercado Pago...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          <span>{isPlanChange ? 'Mudar para este plano' : isTrialEligible ? 'Começar 7 dias grátis' : 'Assinar com renovação automática'}</span>
                        </>
                      )}
                    </button>
                  )}

                  <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500">
                    <CreditCard className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>{isTrialEligible ? `Sem cobrança hoje • 1ª cobrança em ${trialFirstChargeLabel}` : 'Cobrança mensal no cartão • cancele quando quiser'}</span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
        )}
      </section>
    </>
  );

  const statusSection = (
    <>
      {/* Status Meta Info */}
      <div className={`rounded-2xl border p-4 text-xs leading-relaxed ${statusMeta.panelClass}`}>
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold">{statusMeta.label}</h3>
            <p className="mt-1">{statusMeta.description}</p>
            <p className="mt-1 font-semibold">{statusNextStep}</p>
          </div>
        </div>
      </div>
    </>
  );

  const summarySection = (
    <>
      {/* Plan Card & Current Details */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="space-y-1">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
              {subscription.status === 'active' ? 'Plano atual' : isOnlySelected ? 'Plano selecionado' : 'Último plano'}
            </span>
            <h3 className="text-2xl font-bold text-[#0A1128] dark:text-white">{subscription.planName}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{currentPlan.maxSongs ? `Publicação de até ${currentPlan.maxSongs} músicas no catálogo` : 'Publicação de músicas ilimitadas'}</p>
          </div>

          <div className="text-left md:text-right space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 block">Valor Mensal:</span>
            <span className="text-3xl font-black text-amber-600 dark:text-amber-400">R$ {formatMoneyBR(isOnlySelected ? currentPlan.monthlyPrice : subscription.monthlyPrice)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">Recebimento integrado via Mercado Pago</span>
          </div>
        </div>

        {/* Subscription Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-slate-500 dark:text-slate-400 block">
              {isOnlySelected ? 'Início da assinatura:' : isInTrial ? 'Fim do teste / 1ª cobrança:' : hasAutoRenew ? 'Próxima cobrança:' : 'Válido até:'}
            </span>
            <strong className="text-[#0A1128] dark:text-white text-sm block">
              {isOnlySelected ? 'Após a contratação' : nextBillingLabel || 'Data indisponível'}
            </strong>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-slate-500 dark:text-slate-400 block">Forma de Pagamento:</span>
            <strong className="text-[#0A1128] dark:text-white text-sm block">
              {isOnlySelected
                ? 'Definida no Mercado Pago'
                : `${subscription.paymentMethod}${subscription.cardLast4 ? ` (•••• ${subscription.cardLast4})` : ''}`}
            </strong>
            <span className={`block text-[11px] ${hasAutoRenew ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
              {isOnlySelected
                ? 'Cartão para renovação automática'
                : hasAutoRenew ? 'Renovação automática ativa' : isRenewalCancelled ? 'Renovação cancelada' : 'Sem renovação automática'}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-slate-500 dark:text-slate-400 block">Status Atual:</span>
            <strong className={`text-sm block font-bold ${statusMeta.textClass}`}>
              {statusMeta.label}
            </strong>
            {isInTrial && trialEndsLabel && (
              <span className="block text-[11px] text-emerald-600 dark:text-emerald-400">Teste grátis até {trialEndsLabel}</span>
            )}
          </div>
        </div>

        {isRenewalCancelled && (
          <div role="status" className="p-4 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3">
            <Info className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <strong className="block text-sm font-bold text-amber-950 dark:text-amber-100">Renovação automática cancelada</strong>
              <span>Seu {subscription.planName} continua ativo{nextBillingLabel ? ` até ${nextBillingLabel}` : ''} e não haverá novas cobranças. Reative para não perder o acesso ao fim do período.</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          {!hasAutoRenew && !hasPendingAuthorization && (
            <button
              type="button"
              onClick={() => openCheckoutDialog(subscription.planName)}
              disabled={checkoutLoadingPlan !== null}
              className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              <span>{isTrialEligible ? 'Começar 7 dias grátis' : isRenewalCancelled ? 'Reativar renovação automática' : 'Assinar com renovação automática'}</span>
            </button>
          )}

          {hasAutoRenew ? (
            <button
              type="button"
              onClick={() => setIsCancelDialogOpen(true)}
              disabled={isCancellingRenewal}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs transition disabled:opacity-50"
            >
              {isCancellingRenewal ? 'Cancelando...' : 'Cancelar renovação automática'}
            </button>
          ) : (
            <a
              href={`mailto:${APP_CONFIG.contact.email}?subject=Assinatura`}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs transition"
            >
              Falar com o suporte
            </a>
          )}
        </div>

      </div>
    </>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0A1128] dark:text-white tracking-tight flex items-center gap-2">
            <span>{pageTitle}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {pageDescription}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Atualizar status da assinatura"
            aria-label="Atualizar status da assinatura"
            className="p-2 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-600 dark:text-amber-400' : ''}`} />
          </button>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusMeta.badgeClass}`}>
            {statusMeta.label}
          </span>
        </div>
      </div>

      {/* Retorno do Mercado Pago: acompanha a confirmação do webhook */}
      {isReturnInProgress && paymentNotice && (
        isReturnConfirmed ? (
          <div role="status" aria-live="polite" className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="block font-bold text-emerald-950 dark:text-emerald-100 text-sm">
                {isInTrial ? 'Teste grátis ativado!' : paymentNotice.status === 'recurring' ? 'Assinatura ativada!' : 'Pagamento confirmado!'}
              </strong>
              <span className="text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm">
                {isInTrial
                  ? `Seu ${subscription.planName} está ativo até ${trialEndsLabel}. A primeira cobrança será feita nessa data, e você pode cancelar antes sem pagar nada.`
                  : hasAutoRenew
                    ? `Seu ${subscription.planName} está ativo com renovação automática.${nextBillingLabel ? ` Próxima cobrança em ${nextBillingLabel}.` : ''}`
                    : `Seu ${subscription.planName} está ativo${nextBillingLabel ? ` até ${nextBillingLabel}` : ''}. Seus benefícios já estão liberados no catálogo.`}
              </span>
            </div>
            <button type="button" onClick={() => setPaymentNotice(null)} aria-label="Fechar aviso" className="p-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : confirmationTimedOut ? (
          <div role="status" aria-live="polite" className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center gap-3 shadow-xs animate-fadeIn">
            <div className="flex items-start gap-3 flex-1">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-amber-950 dark:text-amber-100 text-sm">Ainda aguardando o Mercado Pago</strong>
                <span className="text-amber-800 dark:text-amber-300 text-xs sm:text-sm">A confirmação está demorando mais que o normal. Você pode sair desta página: o plano é ativado automaticamente e você recebe uma notificação no painel.</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Verificar agora</span>
              </button>
              <button type="button" onClick={() => setPaymentNotice(null)} aria-label="Fechar aviso" className="p-1 rounded-lg text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div role="status" aria-live="polite" className="p-4 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-fadeIn">
            <RefreshCw className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
            <div className="flex-1">
              <strong className="block font-bold text-sm">
                {paymentNotice.status === 'recurring' ? 'Confirmando sua assinatura...' : 'Confirmando seu pagamento...'}
              </strong>
              <span className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm">
                O Mercado Pago está confirmando o {paymentNotice.planName || 'plano'}. Costuma levar poucos segundos, e esta página atualiza sozinha.
              </span>
            </div>
          </div>
        )
      )}

      {renewalNotice && (
        <div role="status" aria-live="polite" className="p-4 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-fadeIn">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="flex-1">{renewalNotice}</span>
          <button type="button" onClick={() => setRenewalNotice(null)} aria-label="Fechar aviso" className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {paymentNotice && paymentNotice.status === 'failure' && (
        <div role="alert" className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-2xl text-red-900 dark:text-red-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div>
              <strong className="block font-bold text-red-950 dark:text-red-100 text-sm">Pagamento não concluído</strong>
              <span className="text-red-800 dark:text-red-300 text-xs sm:text-sm">Nenhuma cobrança foi feita. Os motivos mais comuns são:</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-red-800 dark:text-red-300 text-xs">
              <li>o e-mail da conta Mercado Pago é diferente do informado;</li>
              <li>o cartão foi recusado pelo banco (limite, dados incorretos ou bloqueio);</li>
              <li>a autorização foi interrompida antes de terminar.</li>
            </ul>
            <button
              type="button"
              onClick={() => { const plan = paymentNotice.planName || subscription.planName; setPaymentNotice(null); openCheckoutDialog(plan); }}
              disabled={checkoutLoadingPlan !== null}
              className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition disabled:opacity-50"
            >
              Tentar novamente
            </button>
          </div>
          <button type="button" onClick={() => setPaymentNotice(null)} aria-label="Fechar aviso" className="p-1 rounded-lg text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {hasPendingAuthorization && (paymentNotice?.status !== 'recurring' || confirmationTimedOut) && (
        <div role="status" className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center gap-3 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-3 flex-1">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold text-amber-950 dark:text-amber-100 text-sm">Autorização pendente no Mercado Pago</strong>
              <span className="text-amber-800 dark:text-amber-300 text-xs sm:text-sm">Você iniciou a assinatura do {subscription.planName}, mas ainda não concluiu a autorização do cartão. Nenhuma cobrança foi feita.</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openCheckoutDialog(subscription.planName)}
              disabled={checkoutLoadingPlan !== null || isDiscardingPending}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition disabled:opacity-50"
            >
              Concluir assinatura
            </button>
            <button
              type="button"
              onClick={handleDiscardPending}
              disabled={checkoutLoadingPlan !== null || isDiscardingPending}
              className="px-3 py-2 rounded-xl text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 font-semibold text-xs transition disabled:opacity-50"
            >
              {isDiscardingPending ? 'Descartando...' : 'Descartar'}
            </button>
          </div>
        </div>
      )}

      {checkoutError && (
        <div role="alert" className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-2xl text-red-900 dark:text-red-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="block font-bold text-red-950 dark:text-red-100 text-sm">Não foi possível abrir o Mercado Pago</strong>
            <span className="text-red-800 dark:text-red-300 text-xs sm:text-sm">{checkoutError}</span>
          </div>
          <button type="button" onClick={() => setCheckoutError(null)} aria-label="Fechar aviso" className="p-1 rounded-lg text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isOnlySelected ? (
        <>
          {plansSection}
          {statusSection}
        </>
      ) : (
        <>
          {statusSection}
          {summarySection}
          {plansSection}
        </>
      )}

      {/* Invoice History required by Section 13. Antes da primeira cobrança, o
          bloco não é exibido para não sugerir que já existe uma assinatura. */}
      {hasBillingHistory && (
        <DashboardCard className="overflow-hidden">
          <DashboardSectionHeader title="Histórico de Cobranças" description="Faturas vinculadas à sua assinatura, da mais recente para a mais antiga" />

          <div className="divide-y divide-slate-200 dark:divide-slate-800/80 px-5 sm:px-6">
            {visibleInvoices.map(({ invoice: inv, number }) => {
            const canDownload = inv.status === 'pago' || inv.status === 'estornado';
            return (
            <div key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <strong className="text-[#0A1128] dark:text-white block">Fatura nº {number}</strong>
                  <span className="text-slate-500 dark:text-slate-400 block">{formatBrazilianDate(inv.date) || inv.date}</span>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] truncate" title={`Código da transação no Mercado Pago: ${inv.id}`}>Transação {inv.id}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-slate-700 dark:text-slate-200 font-semibold">
                  R$ {formatMoneyBR(inv.value)}
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${inv.status === 'pago' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : inv.status === 'pendente' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : inv.status === 'estornado' ? 'bg-red-500/20 text-red-700 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                  {INVOICE_STATUS_LABEL[inv.status] || inv.status}
                </span>
                {canDownload && (
                  <button
                    type="button"
                    onClick={() => handleDownloadReceipt(inv, number)}
                    disabled={receiptLoadingId !== null}
                    title="Baixar recibo em PDF"
                    aria-label={`Baixar recibo da fatura nº ${number}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 transition disabled:opacity-50"
                  >
                    {receiptLoadingId === inv.id
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <Download className="w-3.5 h-3.5" />}
                    <span>Recibo</span>
                  </button>
                )}
              </div>
            </div>
            );
            })}
          </div>
          {invoicesNewestFirst.length > INVOICES_PREVIEW && (
            <div className="border-t border-slate-200 dark:border-slate-800 px-5 sm:px-6 py-3">
              <button
                type="button"
                onClick={() => setShowAllInvoices(value => !value)}
                aria-expanded={showAllInvoices}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
              >
                {showAllInvoices ? 'Mostrar só as mais recentes' : `Ver todas as ${invoicesNewestFirst.length} faturas`}
              </button>
            </div>
          )}
        </DashboardCard>
      )}

      {/* Informações de confiança: quem cobra, regras e contato */}
      <footer className="pt-2 pb-4 text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 space-y-1.5">
        <p className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>Pagamentos processados com segurança por {APP_CONFIG.company.paymentProcessor}. Não armazenamos os dados do seu cartão.</span>
        </p>
        <nav aria-label="Informações legais" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link to="/termos" className="underline-offset-2 hover:underline hover:text-slate-700 dark:hover:text-slate-200">Termos de Uso e cancelamento</Link>
          <span aria-hidden="true">•</span>
          <Link to="/privacidade" className="underline-offset-2 hover:underline hover:text-slate-700 dark:hover:text-slate-200">Privacidade</Link>
          <span aria-hidden="true">•</span>
          <a href={`mailto:${APP_CONFIG.company.supportEmail}?subject=Assinatura`} className="underline-offset-2 hover:underline hover:text-slate-700 dark:hover:text-slate-200">{APP_CONFIG.company.supportEmail}</a>
        </nav>
        <p>{APP_CONFIG.company.legalName} • CNPJ {APP_CONFIG.company.cnpj}</p>
      </footer>

      <AdminConfirmDialog
        isOpen={emailDialogPlan !== null}
        title={checkoutSummary?.title || 'Confirme sua assinatura'}
        description="Confira os valores antes de seguir para o Mercado Pago."
        confirmLabel="Continuar no Mercado Pago"
        cancelLabel="Voltar"
        variant="info"
        onConfirm={confirmCheckoutEmail}
        onCancel={() => setEmailDialogPlan(null)}
      >
        {checkoutSummary && (
          <div className="mb-4 space-y-3">
            <dl className="rounded-2xl border border-slate-800 bg-slate-950 divide-y divide-slate-800 text-xs">
              {checkoutSummary.rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className={`text-right font-semibold ${label === 'Cobrado hoje' ? 'text-amber-400' : 'text-white'}`}>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] leading-relaxed text-slate-400">{checkoutSummary.note}</p>
          </div>
        )}
        <form onSubmit={event => { event.preventDefault(); confirmCheckoutEmail(); }} className="space-y-1.5">
          <label htmlFor="mp-payer-email" className="block text-xs font-semibold text-slate-300">E-mail da conta Mercado Pago</label>
          <input
            id="mp-payer-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={mpEmail}
            onChange={event => { setMpEmail(event.target.value); setMpEmailError(null); }}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          {mpEmailError
            ? <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{mpEmailError}</p>
            : <p className="text-[11px] text-slate-500">Use o e-mail da conta em que você vai entrar no Mercado Pago. Se for outro, a autorização é recusada.</p>}
        </form>
      </AdminConfirmDialog>

      <AdminConfirmDialog
        isOpen={isCancelDialogOpen}
        title="Cancelar renovação automática?"
        description={`Não haverá novas cobranças no seu cartão.${validUntilText} Você pode assinar novamente quando quiser.`}
        confirmLabel="Cancelar renovação"
        cancelLabel="Manter assinatura"
        variant="warning"
        isLoading={isCancellingRenewal}
        onConfirm={handleCancelRenewal}
        onCancel={() => { if (!isCancellingRenewal) setIsCancelDialogOpen(false); }}
      />

    </div>
  );
};
