import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle, BellRing, CheckCircle2, Clock, Copy, Download, FileText, Headphones, Link2, Loader2, Music, RefreshCw, ShieldCheck
} from 'lucide-react';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { APP_URL } from '../config/appConfig';
import { formatBrlAmount } from '../lib/money';
import {
  loadReleaseDelivery, notifyComposerAboutDelivery, registerDeliveryLyricsDownload, requestDeliveryAudioUrl,
  requestDeliveryStreamUrl, requestDeliveryTermDocument, type DeliveryFailure, type ReleaseDeliveryInfo
} from '../lib/database';

const formatDate = (value: string) => {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const formatSize = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

const lyricsFileName = (title: string) =>
  `letra-${title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'musica'}.txt`;

const DAY_MS = 24 * 60 * 60 * 1000;

type Slot = 'term' | 'audio' | 'lyrics';
type Feedback = { type: 'success' | 'error'; text: string };

// Feedback ao lado do botão que o gerou; sucesso some sozinho, erro fica.
const FeedbackLine: React.FC<{ feedback?: Feedback }> = ({ feedback }) => (
  <div aria-live="polite" className="min-h-0">
    {feedback && (
      <p role={feedback.type === 'error' ? 'alert' : undefined} className={`mt-3 flex items-start gap-1.5 text-xs leading-relaxed ${feedback.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
        {feedback.type === 'error' ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        {feedback.text}
      </p>
    )}
  </div>
);

/**
 * Entrega ao cliente que licenciou a obra: termo, música completa e letra.
 * O link chega por e-mail na emissão do termo; o token é a única credencial.
 */
export const ReleaseDeliveryPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [delivery, setDelivery] = useState<ReleaseDeliveryInfo | null>(null);
  const [loadError, setLoadError] = useState<DeliveryFailure | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);
  const [isDownloadingTerm, setIsDownloadingTerm] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [notifyState, setNotifyState] = useState<'idle' | 'sending' | Feedback>('idle');
  const [feedback, setFeedback] = useState<Partial<Record<Slot, Feedback>>>({});
  const timers = useRef<Partial<Record<Slot, ReturnType<typeof setTimeout>>>>({});

  // O token está na URL: nada de indexação nem de Referer para terceiros.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Entrega da obra licenciada';
    const tags = [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']].map(([name, content]) => {
      const tag = document.createElement('meta');
      tag.name = name;
      tag.content = content;
      document.head.appendChild(tag);
      return tag;
    });
    return () => {
      document.title = previousTitle;
      tags.forEach(tag => tag.remove());
    };
  }, []);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    loadReleaseDelivery(token)
      .then(info => { if (active) setDelivery(info); })
      .catch((error: DeliveryFailure) => { if (active) setLoadError(error); });
    return () => { active = false; };
  }, [token, loadAttempt]);

  const showFeedback = (slot: Slot, next: Feedback | null) => {
    clearTimeout(timers.current[slot]);
    setFeedback(current => ({ ...current, [slot]: next ?? undefined }));
    if (next?.type === 'success') {
      timers.current[slot] = setTimeout(() => setFeedback(current => ({ ...current, [slot]: undefined })), 6000);
    }
  };

  const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

  const downloadTerm = async () => {
    setIsDownloadingTerm(true);
    showFeedback('term', null);
    try {
      const [term, { downloadDeliveryTerm }] = await Promise.all([
        requestDeliveryTermDocument(token),
        import('../lib/releaseArchive'),
      ]);
      await downloadDeliveryTerm(term);
      showFeedback('term', { type: 'success', text: 'Termo baixado. Guarde o PDF junto com a música.' });
    } catch (error) {
      showFeedback('term', { type: 'error', text: errorText(error, 'Não foi possível baixar o termo.') });
    } finally {
      setIsDownloadingTerm(false);
    }
  };

  const copyText = async (slot: Slot, text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showFeedback(slot, { type: 'success', text: success });
    } catch {
      showFeedback(slot, { type: 'error', text: 'Não foi possível copiar. Selecione o texto e copie manualmente.' });
    }
  };

  const downloadAudio = async () => {
    setIsDownloadingAudio(true);
    showFeedback('audio', null);
    try {
      const { url } = await requestDeliveryAudioUrl(token);
      // O link assinado responde como anexo: o navegador baixa sem sair da página.
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      showFeedback('audio', { type: 'success', text: 'O download deve começar em instantes. Se nada acontecer, clique novamente.' });
    } catch (error) {
      showFeedback('audio', { type: 'error', text: errorText(error, 'Não foi possível baixar a música.') });
    } finally {
      setIsDownloadingAudio(false);
    }
  };

  const loadStream = async () => {
    setIsLoadingStream(true);
    showFeedback('audio', null);
    try {
      setStreamUrl((await requestDeliveryStreamUrl(token)).url);
    } catch (error) {
      showFeedback('audio', { type: 'error', text: errorText(error, 'Não foi possível carregar a música.') });
    } finally {
      setIsLoadingStream(false);
    }
  };

  const notifyComposer = async () => {
    setNotifyState('sending');
    try {
      const { notified, composerName } = await notifyComposerAboutDelivery(token);
      setNotifyState({
        type: 'success',
        text: notified
          ? `Avisamos ${composerName}. Quando a entrega for reenviada, o novo link chegará no seu e-mail.`
          : `${composerName} já foi avisado nas últimas 24 horas. O novo link chegará no seu e-mail assim que a entrega for reenviada.`,
      });
    } catch (error) {
      setNotifyState({ type: 'error', text: errorText(error, 'Não foi possível avisar o compositor. Tente novamente.') });
    }
  };

  const downloadLyrics = () => {
    if (!delivery) return;
    const content = `${delivery.songTitle}\nAutoria: ${delivery.authors}\nTermo de liberação: ${delivery.documentCode}\n\n${delivery.lyrics}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = lyricsFileName(delivery.songTitle);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revogar no mesmo tick cancela o download no Safari e no Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showFeedback('lyrics', { type: 'success', text: 'Letra baixada.' });
    void registerDeliveryLyricsDownload(token).catch(() => undefined);
  };

  const notifyButton = (label: string) => (
    <>
      <button type="button" onClick={() => void notifyComposer()} disabled={notifyState === 'sending' || (typeof notifyState === 'object' && notifyState.type === 'success')} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60">
        {notifyState === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
        {notifyState === 'sending' ? 'Avisando...' : label}
      </button>
      {typeof notifyState === 'object' && <FeedbackLine feedback={notifyState} />}
    </>
  );

  const renderError = (error: DeliveryFailure) => {
    const composer = error.composerName || 'o compositor';
    const content = {
      expired: {
        title: 'Link de entrega expirado',
        text: `${error.message} Peça um novo a ${composer}: o termo continua válido e a entrega pode ser reenviada.`,
      },
      not_found: {
        title: 'Link substituído ou inválido',
        text: 'Cada reenvio da entrega gera um link novo e desativa o anterior. Procure no seu e-mail a mensagem mais recente sobre este termo e use o botão dela.',
      },
      audio_missing: { title: 'Música indisponível', text: error.message },
      unavailable: { title: 'Não foi possível abrir a entrega', text: error.message },
    }[error.reason];
    return (
      <div role="alert" className="rounded-3xl border border-red-500/30 bg-slate-900 p-8 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
        <h1 className="mt-4 text-xl font-bold text-white">{content.title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-300">{content.text}</p>
        {error.reason === 'expired' && <div className="mx-auto max-w-md">{notifyButton(`Pedir novo link a ${composer}`)}</div>}
        {error.reason === 'unavailable' && (
          <button type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-slate-950 hover:bg-amber-400">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
          </button>
        )}
        <p className="mx-auto mt-6 max-w-md text-xs text-slate-500">
          Para conferir a autenticidade do termo, use o código impresso no documento.{' '}
          <Link to="/validar-documento" className="font-semibold text-amber-400 hover:text-amber-300">Validar um termo</Link>
        </p>
      </div>
    );
  };

  const expiresInMs = delivery ? new Date(delivery.expiresAt).getTime() - Date.now() : Infinity;
  const expiresSoon = expiresInMs < 7 * DAY_MS;
  const validationUrl = delivery ? `${APP_URL}/validar/${delivery.documentCode}` : '';
  const audioDetails = delivery?.audio ? [
    delivery.audio.format,
    delivery.audio.sizeBytes ? formatSize(delivery.audio.sizeBytes) : null,
    delivery.audio.durationSeconds ? formatDuration(delivery.audio.durationSeconds) : null,
  ].filter(Boolean).join(' · ') : '';

  return (
    <div className="min-h-screen bg-[#060B18] text-slate-100 flex flex-col font-sans">
      <Navbar />
      <main className="flex-grow px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
              <ShieldCheck className="h-4 w-4" /> Entrega da obra licenciada
            </span>
          </div>

          {!delivery && !loadError && (
            <div role="status" className="flex items-center justify-center gap-2 rounded-3xl border border-slate-800 bg-slate-900 p-10 text-sm text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin" /> Abrindo a entrega...
            </div>
          )}

          {!delivery && loadError && renderError(loadError)}

          {delivery && (
            <>
              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-400">Olá, {delivery.buyerName}</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{delivery.songTitle}</h1>
                <p className="mt-1 text-sm text-slate-400">Autoria: {delivery.authors} · Liberada por {delivery.composerName}</p>
                <dl className="mt-5 grid gap-x-4 gap-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-slate-500">Termo</dt><dd className="font-mono font-bold text-amber-400">{delivery.documentCode}</dd></div>
                  <div><dt className="text-xs text-slate-500">Emitido em</dt><dd className="font-semibold text-white">{formatDate(delivery.issueDate)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Tipo de liberação</dt><dd className="font-semibold text-white">{delivery.releaseType}</dd></div>
                  {delivery.interpreterName && <div><dt className="text-xs text-slate-500">Intérprete</dt><dd className="font-semibold text-white">{delivery.interpreterName}</dd></div>}
                  {delivery.iswc && <div><dt className="text-xs text-slate-500">ISWC</dt><dd className="font-mono font-semibold text-white">{delivery.iswc}</dd></div>}
                  {delivery.agreedValue !== null && <div><dt className="text-xs text-slate-500">Valor acordado</dt><dd className="font-semibold text-white">R$ {formatBrlAmount(delivery.agreedValue)}</dd></div>}
                  {delivery.authorizedPurpose && <div className="sm:col-span-3"><dt className="text-xs text-slate-500">Finalidade autorizada</dt><dd className="text-slate-200">{delivery.authorizedPurpose}</dd></div>}
                </dl>
                <p className={`mt-3 flex items-start gap-1.5 text-xs ${expiresSoon ? 'font-semibold text-amber-300' : 'text-slate-500'}`}>
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {expiresSoon
                    ? `Este link expira em ${formatDateTime(delivery.expiresAt)}. Baixe o termo e a música antes disso.`
                    : `Link de entrega válido até ${formatDateTime(delivery.expiresAt)}.`}
                </p>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                  <FileText className="h-6 w-6 text-amber-400" aria-hidden="true" />
                  <h2 className="mt-3 font-bold text-white">Termo de liberação</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">Via completa em PDF, com documentos, valor e condições, para apresentar à produtora ou distribuidora.</p>
                  <button type="button" onClick={() => void downloadTerm()} disabled={isDownloadingTerm} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 px-4 text-sm font-bold text-amber-300 hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-50">
                    {isDownloadingTerm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                    {isDownloadingTerm ? 'Preparando PDF...' : 'Baixar termo (PDF)'}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-400">
                    <Link to={`/validar/${delivery.documentCode}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 hover:text-amber-300">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Conferir autenticidade
                    </Link>
                    <button type="button" onClick={() => void copyText('term', validationUrl, 'Link de validação copiado. Ele pode ser enviado à produtora ou distribuidora.')} className="inline-flex items-center gap-1.5 hover:text-amber-300">
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Copiar link de validação
                    </button>
                  </div>
                  <FeedbackLine feedback={feedback.term} />
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                  <Music className="h-6 w-6 text-amber-400" aria-hidden="true" />
                  <h2 className="mt-3 font-bold text-white">Música completa</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Arquivo original enviado pelo compositor{audioDetails ? ` · ${audioDetails}` : ''}.
                  </p>
                  {delivery.hasAudio ? (
                    <>
                      {streamUrl ? (
                        <audio
                          controls
                          autoPlay
                          preload="auto"
                          src={streamUrl}
                          onError={() => { setStreamUrl(null); showFeedback('audio', { type: 'error', text: 'A reprodução foi interrompida. Clique em "Ouvir aqui" para carregar de novo.' }); }}
                          className="mt-4 w-full"
                        >
                          Seu navegador não reproduz áudio. Use o botão de baixar.
                        </audio>
                      ) : (
                        <button type="button" onClick={() => void loadStream()} disabled={isLoadingStream} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50">
                          {isLoadingStream ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" aria-hidden="true" />}
                          {isLoadingStream ? 'Carregando...' : 'Ouvir aqui'}
                        </button>
                      )}
                      <button type="button" onClick={() => void downloadAudio()} disabled={isDownloadingAudio} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-50">
                        {isDownloadingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                        {isDownloadingAudio ? 'Preparando...' : 'Baixar música'}
                      </button>
                      <FeedbackLine feedback={feedback.audio} />
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200">
                      A música completa não está disponível nesta entrega. Avise {delivery.composerName} para conferir o arquivo e reenviar.
                      {notifyButton('Avisar o compositor')}
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-bold text-white">Letra</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void copyText('lyrics', delivery.lyrics, 'Letra copiada.')} disabled={!delivery.lyrics} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"><Copy className="h-4 w-4" aria-hidden="true" /> Copiar</button>
                    <button type="button" onClick={downloadLyrics} disabled={!delivery.lyrics} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" /> Baixar letra (.txt)</button>
                  </div>
                </div>
                <FeedbackLine feedback={feedback.lyrics} />
                {delivery.lyrics
                  ? <pre className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950 p-5 font-sans text-sm leading-relaxed text-slate-200">{delivery.lyrics}</pre>
                  : <p className="mt-4 text-sm text-slate-400">O compositor não registrou a letra desta obra.</p>}
              </section>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                O uso da obra segue as condições do termo {delivery.documentCode}. Este link de entrega é pessoal;
                para comprovar a liberação à produtora ou distribuidora, envie o PDF do termo ou o link de validação.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};
