import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Download, Eye, Mail, RefreshCw } from 'lucide-react';
import type { ReleaseDeliveryStatus as DeliveryStatus } from '../../lib/database';

type Props = {
  status?: DeliveryStatus;
  isSending?: boolean;
  onSend: () => void;
  compact?: boolean;
};

export const describeReleaseDelivery = (status?: DeliveryStatus) => {
  if (!status) return {
    label: 'Entrega ainda não gerada',
    detail: 'Envie o termo, a música completa e a letra para o e-mail do cliente.',
    tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    Icon: Mail,
  };
  if (status.emailStatus === 'failed') return {
    label: 'Falha no envio',
    detail: 'O provedor não confirmou o envio. Confira o e-mail do cliente e tente novamente.',
    tone: 'text-red-300 border-red-500/30 bg-red-500/10',
    Icon: AlertCircle,
  };
  if (status.emailStatus === 'retry') return {
    label: 'Nova tentativa programada',
    detail: 'O envio falhou temporariamente e será tentado novamente de forma automática.',
    tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    Icon: RefreshCw,
  };
  if (status.emailStatus === 'pending') return {
    label: 'Entrega na fila de envio',
    detail: 'O pacote está pronto e aguarda a confirmação do provedor de e-mail.',
    tone: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
    Icon: Clock,
  };
  const expired = new Date(status.expiresAt).getTime() < Date.now();
  if (expired) return {
    label: 'Link de entrega expirado',
    detail: `Expirou em ${new Date(status.expiresAt).toLocaleDateString('pt-BR')}. Reenvie para gerar um novo link seguro.`,
    tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    Icon: AlertCircle,
  };
  if (status.audioDownloads > 0) return {
    label: 'Música baixada pelo cliente',
    detail: `Link válido até ${new Date(status.expiresAt).toLocaleDateString('pt-BR')}.`,
    tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    Icon: CheckCircle2,
  };
  if (status.views > 0) return {
    label: 'Entrega aberta pelo cliente',
    detail: `Link válido até ${new Date(status.expiresAt).toLocaleDateString('pt-BR')}; música ainda não baixada.`,
    tone: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
    Icon: Eye,
  };
  return {
    label: 'E-mail aceito pelo provedor',
    detail: `Link seguro válido até ${new Date(status.expiresAt).toLocaleDateString('pt-BR')}; cliente ainda não abriu.`,
    tone: 'text-slate-200 border-blue-500/30 bg-blue-500/10',
    Icon: CheckCircle2,
  };
};

export const ReleaseDeliveryStatus: React.FC<Props> = ({ status, isSending = false, onSend, compact = false }) => {
  const description = describeReleaseDelivery(status);
  const { Icon } = description;
  const hasDelivery = Boolean(status);

  return (
    <section aria-label="Situação da entrega" className={`rounded-xl border ${description.tone} ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <strong className="block text-xs">{description.label}</strong>
          <p className="mt-1 text-[11px] leading-relaxed opacity-90">{description.detail}</p>
          {status?.lastSentAt && <p className="mt-1 text-[10px] opacity-70">Provedor aceitou em {new Date(status.lastSentAt).toLocaleString('pt-BR')}</p>}
        </div>
      </div>

      {status && (status.views > 0 || status.audioDownloads > 0 || status.lyricsDownloads > 0) && (
        <div className="grid grid-cols-3 gap-2 border-t border-current/10 pt-2 text-center text-[10px]">
          <span><Eye className="mx-auto mb-0.5 h-3.5 w-3.5" /><strong className="block">{status.views}</strong>aberturas</span>
          <span><Download className="mx-auto mb-0.5 h-3.5 w-3.5" /><strong className="block">{status.audioDownloads}</strong>músicas</span>
          <span><Download className="mx-auto mb-0.5 h-3.5 w-3.5" /><strong className="block">{status.lyricsDownloads}</strong>letras</span>
        </div>
      )}

      <button
        type="button"
        onClick={onSend}
        disabled={isSending}
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-950/50 px-3 text-[11px] font-bold text-current ring-1 ring-current/20 hover:bg-slate-950/80 disabled:cursor-wait disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isSending ? 'animate-spin' : ''}`} />
        {isSending ? 'Enviando...' : hasDelivery ? 'Reenviar entrega por e-mail' : 'Enviar entrega por e-mail'}
      </button>

      {!compact && hasDelivery && <p className="text-[10px] leading-relaxed opacity-60">O reenvio cria um link válido por 30 dias e invalida imediatamente o anterior.</p>}
    </section>
  );
};
