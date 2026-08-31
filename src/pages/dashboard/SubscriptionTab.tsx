import React from 'react';
import { useApp } from '../../context/AppContext';
import { APP_CONFIG } from '../../config/appConfig';
import { 
  CreditCard, 
  ShieldCheck, 
  ShieldAlert, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RefreshCw,
  QrCode
} from 'lucide-react';

export const SubscriptionTab: React.FC = () => {
  const { subscription } = useApp();
  const currentPlan = APP_CONFIG.plans.find(plan => plan.name === subscription.planName) || APP_CONFIG.plans[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Gestão de Assinatura
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Acompanhe seu plano mensal, faturas e formas de pagamento
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            subscription.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
            subscription.status === 'pending' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
            subscription.status === 'suspended' ? 'bg-red-500/20 text-red-300 border border-red-500/40' :
            'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            Status: {subscription.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div><h2 className="font-bold text-white text-lg">Planos disponíveis</h2><p className="text-xs text-slate-400">Conheça os limites. Alterações são efetivadas somente após confirmação financeira.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {APP_CONFIG.plans.map(plan => {
            const selected = subscription.planName === plan.name;
            return (
              <div
                key={plan.name}
                className={`relative text-left p-5 rounded-2xl border transition-all ${
                  selected
                    ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/25 shadow-xl shadow-amber-500/10'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-600 hover:-translate-y-0.5'
                }`}
              >
                {selected && (
                  <span className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 text-[10px] uppercase tracking-wider font-extrabold">
                    Atual
                  </span>
                )}
                <span className={`text-sm font-bold block ${selected ? 'text-slate-950' : 'text-white'}`}>{plan.name}</span>
                <span className={`text-2xl font-black block mt-2 ${selected ? 'text-amber-700' : 'text-amber-400'}`}>R$ {plan.priceMonthly}<small className={`text-xs font-normal ${selected ? 'text-slate-600' : 'text-slate-400'}`}>/mês</small></span>
                <span className={`text-xs block mt-2 ${selected ? 'text-slate-700' : 'text-slate-400'}`}>{plan.maxSongs ? `Até ${plan.maxSongs} músicas` : 'Músicas ilimitadas + Cartão'}</span>
                <ul className={`mt-4 pt-4 border-t space-y-2 ${selected ? 'border-amber-300' : 'border-slate-800'}`}>
                  {plan.features.map(feature => (
                    <li key={feature} className={`text-[11px] flex items-start gap-2 ${selected ? 'text-slate-700' : 'text-slate-400'}`}>
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${selected ? 'text-amber-600' : 'text-amber-400'}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {selected && <span className="text-[11px] text-emerald-700 font-extrabold block mt-4">✓ Plano selecionado</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mandatory Warning Banner when Suspended required by Section 13 */}
      {subscription.status === 'suspended' && (
        <div className="p-4 bg-red-500/15 border border-red-500/40 rounded-2xl text-red-200 text-xs leading-relaxed space-y-2 animate-fadeIn">
          <div className="flex items-center gap-2 font-bold text-red-300 text-sm">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <span>Assinatura Suspensa — Visibilidade Oculta</span>
          </div>
          <p>
            Quando a assinatura estiver suspensa, o compositor continuará acessando seus dados, mas seu perfil público e suas músicas ficarão ocultos até a regularização.
          </p>
          <p>Entre em contato com o suporte para regularizar a assinatura.</p>
        </div>
      )}

      {/* Plan Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Plano Atual</span>
            <h2 className="text-2xl font-bold text-white">{subscription.planName}</h2>
            <p className="text-xs text-slate-400">{currentPlan.maxSongs ? `Publicação de até ${currentPlan.maxSongs} músicas no catálogo` : 'Publicação de músicas ilimitadas + Cartão'}</p>
          </div>

          <div className="text-left md:text-right space-y-1">
            <span className="text-xs text-slate-400 block">Valor Mensal:</span>
            <span className="text-3xl font-black text-amber-400">R$ {subscription.monthlyPrice}</span>
            <span className="text-xs text-slate-400 block">Cobrança recorrente</span>
          </div>
        </div>

        {/* Subscription Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-slate-400 block">Próxima Cobrança:</span>
            <strong className="text-white text-sm block">{subscription.nextBillingDate}</strong>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-slate-400 block">Forma de Pagamento:</span>
            <strong className="text-white text-sm block">
              {subscription.paymentMethod} {subscription.cardLast4 ? `(•••• ${subscription.cardLast4})` : ''}
            </strong>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-slate-400 block">Status Atual:</span>
            <strong className={`text-sm block capitalize font-bold ${
              subscription.status === 'active' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {subscription.status}
            </strong>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <a
            href={`mailto:${APP_CONFIG.contact.email}?subject=Alteração de plano ou pagamento`}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center gap-2"
          >
            <CreditCard className="w-4 h-4 text-amber-400" />
            <span>Solicitar alteração de plano ou pagamento</span>
          </a>

          <a href={`mailto:${APP_CONFIG.contact.email}?subject=Assinatura`} className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition">Falar sobre cancelamento ou reativação</a>
        </div>

      </div>

      {/* Invoice History required by Section 13 */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="font-bold text-white text-base border-b border-slate-800 pb-3">
          Histórico de Cobranças
        </h3>

        <div className="divide-y divide-slate-800/80">
          {subscription.invoices.map(inv => (
            <div key={inv.id} className="py-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-slate-400" />
                <div>
                  <strong className="text-white block">Fatura #{inv.id}</strong>
                  <span className="text-slate-400">{inv.date}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-slate-200 font-semibold">
                  R$ {inv.value.toFixed(2)}
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                  {inv.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
