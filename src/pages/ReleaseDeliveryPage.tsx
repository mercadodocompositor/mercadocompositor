import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Copy, Download, FileText, Loader2, Music, ShieldCheck } from 'lucide-react';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import {
  loadReleaseDelivery, registerDeliveryLyricsDownload, requestDeliveryAudioUrl, type ReleaseDeliveryInfo
} from '../lib/database';

const formatDate = (value: string) => {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
};

const lyricsFileName = (title: string) =>
  `letra-${title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'musica'}.txt`;

/**
 * Entrega ao cliente que licenciou a obra: termo, música completa e letra.
 * O link chega por e-mail na emissão do termo; o token é a única credencial.
 */
export const ReleaseDeliveryPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [delivery, setDelivery] = useState<ReleaseDeliveryInfo | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; expired: boolean } | null>(null);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    loadReleaseDelivery(token)
      .then(info => { if (active) setDelivery(info); })
      .catch((error: Error & { expired?: boolean }) => {
        if (active) setLoadError({ message: error.message, expired: Boolean(error.expired) });
      });
    return () => { active = false; };
  }, [token]);

  const downloadAudio = async () => {
    setIsDownloadingAudio(true);
    setActionMessage(null);
    try {
      const { url } = await requestDeliveryAudioUrl(token);
      // O link assinado já força o download com o nome da música.
      window.location.assign(url);
      setActionMessage({ type: 'success', text: 'Download iniciado. Se não começar, clique novamente.' });
    } catch (error) {
      setActionMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível baixar a música.' });
    } finally {
      setIsDownloadingAudio(false);
    }
  };

  const downloadLyrics = () => {
    if (!delivery) return;
    const content = `${delivery.songTitle}\nAutoria: ${delivery.authors}\nTermo de liberação: ${delivery.documentCode}\n\n${delivery.lyrics}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = lyricsFileName(delivery.songTitle);
    anchor.click();
    URL.revokeObjectURL(url);
    void registerDeliveryLyricsDownload(token).catch(() => undefined);
  };

  const copyLyrics = async () => {
    if (!delivery) return;
    try {
      await navigator.clipboard.writeText(delivery.lyrics);
      setActionMessage({ type: 'success', text: 'Letra copiada.' });
    } catch {
      setActionMessage({ type: 'error', text: 'Não foi possível copiar. Use o botão de baixar a letra.' });
    }
  };

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

          {loadError && (
            <div role="alert" className="rounded-3xl border border-red-500/30 bg-slate-900 p-8 text-center">
              <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
              <h1 className="mt-4 text-xl font-bold text-white">{loadError.expired ? 'Link de entrega expirado' : 'Link de entrega indisponível'}</h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-300">{loadError.message}</p>
              <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">O termo continua válido. Você pode conferir a autenticidade dele pelo código impresso no documento.</p>
              <Link to="/validar-documento" className="mt-6 inline-flex rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400">Validar um termo</Link>
            </div>
          )}

          {delivery && (
            <>
              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[.18em] text-amber-400">Olá, {delivery.buyerName}</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{delivery.songTitle}</h1>
                <p className="mt-1 text-sm text-slate-400">Autoria: {delivery.authors} · Liberada por {delivery.composerName}</p>
                <dl className="mt-5 grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-slate-500">Termo</dt><dd className="font-mono font-bold text-amber-400">{delivery.documentCode}</dd></div>
                  <div><dt className="text-xs text-slate-500">Emitido em</dt><dd className="font-semibold text-white">{formatDate(delivery.issueDate)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Link válido até</dt><dd className="font-semibold text-white">{formatDate(delivery.expiresAt)}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-slate-500">{delivery.releaseType}</p>
              </section>

              {actionMessage && (
                <div role={actionMessage.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${actionMessage.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                  {actionMessage.type === 'error' ? <AlertCircle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
                  {actionMessage.text}
                </div>
              )}

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                  <FileText className="h-6 w-6 text-amber-400" aria-hidden="true" />
                  <h2 className="mt-3 font-bold text-white">Termo de liberação</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">Cópia oficial em PDF, com código de validação.</p>
                  <Link to={`/validar/${delivery.documentCode}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 px-4 text-sm font-bold text-amber-300 hover:bg-amber-500/10">
                    <Download className="h-4 w-4" aria-hidden="true" /> Baixar termo
                  </Link>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
                  <Music className="h-6 w-6 text-amber-400" aria-hidden="true" />
                  <h2 className="mt-3 font-bold text-white">Música completa</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">Arquivo original enviado pelo compositor.</p>
                  <button type="button" onClick={() => void downloadAudio()} disabled={!delivery.hasAudio || isDownloadingAudio} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
                    {isDownloadingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                    {delivery.hasAudio ? (isDownloadingAudio ? 'Preparando...' : 'Baixar música') : 'Indisponível: fale com o compositor'}
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-bold text-white">Letra</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void copyLyrics()} disabled={!delivery.lyrics} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"><Copy className="h-4 w-4" aria-hidden="true" /> Copiar</button>
                    <button type="button" onClick={downloadLyrics} disabled={!delivery.lyrics} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" /> Baixar letra (.txt)</button>
                  </div>
                </div>
                {delivery.lyrics
                  ? <pre className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950 p-5 font-sans text-sm leading-relaxed text-slate-200">{delivery.lyrics}</pre>
                  : <p className="mt-4 text-sm text-slate-400">O compositor não registrou a letra desta obra.</p>}
              </section>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                O uso da obra segue as condições do termo {delivery.documentCode}. Este link é pessoal: não o compartilhe.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};
