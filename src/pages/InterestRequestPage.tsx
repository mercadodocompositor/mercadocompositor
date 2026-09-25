import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, LockKeyhole, Music, Send } from 'lucide-react';
import { Navbar } from '../components/common/Navbar';
import { Footer } from '../components/common/Footer';
import { useApp } from '../context/AppContext';
import { getPublicComposer } from '../lib/database';
import type { Song } from '../types';
import { getInterestRequestUrl, getSongUrlKey } from '../lib/urls';
import { getRequestCode } from '../lib/identifiers';
import { REQUEST_CONSENT_POLICY_VERSION, REQUEST_CONSENT_STATEMENT } from '../config/requestConsent';
import { isValidCpfCnpj } from '../lib/brazilianDocuments';

type FormData = {
  buyerName: string; buyerStageName: string; cpfCnpj: string; buyerEmail: string; buyerEmailConfirm: string;
  buyerWhatsapp: string; buyerCityState: string; purpose: string; purposeOther: string; message: string;
};
type FieldErrors = Partial<Record<keyof FormData | 'terms', string>>;

const OTHER_PURPOSE = 'Outra finalidade';
const PURPOSES = ['Gravação de Single / Lançamento Digital', 'Gravação de Álbum / EP Completo', 'Gravação de DVD / Projeto Ao Vivo', 'Uso Comercial / Trilha Sonora / Publicidade', OTHER_PURPOSE];

const initialForm: FormData = {
  buyerName: '', buyerStageName: '', cpfCnpj: '', buyerEmail: '', buyerEmailConfirm: '', buyerWhatsapp: '', buyerCityState: '',
  purpose: PURPOSES[0], purposeOther: '', message: ''
};

// Ordem de foco quando há erros: segue a ordem visual do formulário.
const FIELD_ORDER: Array<keyof FieldErrors> = ['buyerName', 'cpfCnpj', 'buyerCityState', 'buyerEmail', 'buyerEmailConfirm', 'buyerWhatsapp', 'purpose', 'purposeOther', 'message', 'terms'];

const validateForm = (form: FormData, acceptedTerms: boolean): FieldErrors => {
  const errors: FieldErrors = {};
  if (form.buyerName.trim().length < 2) errors.buyerName = 'Informe seu nome completo.';
  if (!form.cpfCnpj.trim()) errors.cpfCnpj = 'Informe seu CPF ou CNPJ.';
  else if (!isValidCpfCnpj(form.cpfCnpj)) errors.cpfCnpj = 'CPF ou CNPJ inválido. Confira os números.';
  if (form.buyerCityState.trim().length < 3) errors.buyerCityState = 'Informe cidade e estado.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.buyerEmail.trim())) errors.buyerEmail = 'Informe um e-mail válido (ex.: seu.nome@email.com).';
  else if (form.buyerEmail.trim().toLowerCase() !== form.buyerEmailConfirm.trim().toLowerCase()) errors.buyerEmailConfirm = 'Os e-mails não conferem.';
  const phoneDigits = form.buyerWhatsapp.replace(/\D/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 13) errors.buyerWhatsapp = 'Informe um WhatsApp com DDD (ex.: 11 99999-9999).';
  if (form.purpose === OTHER_PURPOSE && form.purposeOther.trim().length < 3) errors.purposeOther = 'Descreva a finalidade da gravação.';
  if (form.message.trim().length < 20) errors.message = `Conte um pouco mais sobre o projeto (mínimo de 20 caracteres; faltam ${20 - form.message.trim().length}).`;
  if (!acceptedTerms) errors.terms = 'Confirme a declaração para enviar.';
  return errors;
};

const maskCpfCnpj = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

const maskPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};

export const InterestRequestPage: React.FC = () => {
  const { username, songRef } = useParams<{ username: string; songRef: string }>();
  const navigate = useNavigate();
  const { addInterestRequest } = useApp();
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestCode, setRequestCode] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Rascunho por aba: sobrevive a erro de rede e recarga, sem guardar o CPF.
  const draftKey = `interest-request-draft:${username}:${songRef}`;

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(draftKey);
      if (saved) setForm(current => ({ ...current, ...(JSON.parse(saved) as Partial<FormData>), cpfCnpj: current.cpfCnpj }));
    } catch { /* rascunho inválido: segue com o formulário vazio */ }
  }, [draftKey]);

  useEffect(() => {
    try {
      const { cpfCnpj: _document, ...rest } = form;
      window.sessionStorage.setItem(draftKey, JSON.stringify(rest));
    } catch { /* armazenamento indisponível */ }
  }, [draftKey, form]);

  useEffect(() => {
    let active = true;
    if (!username || !songRef) { setLoading(false); return; }
    getPublicComposer(username.toLowerCase())
      .then(catalog => {
        if (!active) return;
        const found = catalog?.songs?.find(item =>
          (item.id === songRef || getSongUrlKey(item) === songRef.toLowerCase())
          && item.status === 'published'
          && item.isAvailableForRelease
        );
        setSong(found || null);
        if (found && songRef !== getSongUrlKey(found)) {
          navigate(getInterestRequestUrl(username.toLowerCase(), found), { replace: true });
        }
      })
      .catch(() => active && setSong(null))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [navigate, songRef, username]);

  const set = (field: keyof FormData, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (isSubmitting) return;
    if (website) return;
    if (!song) { setError('Esta música não está disponível para solicitações.'); return; }
    const errors = validateForm(form, acceptedTerms);
    setFieldErrors(errors);
    const firstInvalid = FIELD_ORDER.find(field => errors[field]);
    if (firstInvalid) {
      const count = Object.keys(errors).length;
      setError(count === 1 ? 'Corrija o campo destacado para enviar.' : `Corrija os ${count} campos destacados para enviar.`);
      window.setTimeout(() => document.getElementById(`interest-${firstInvalid}`)?.focus(), 0);
      return;
    }
    const purpose = form.purpose === OTHER_PURPOSE ? `${OTHER_PURPOSE}: ${form.purposeOther.trim()}`.slice(0, 300) : form.purpose;

    setIsSubmitting(true);
    try {
      const request: Awaited<ReturnType<typeof addInterestRequest>> = await addInterestRequest({
        songId: song.id, songTitle: song.title, songCover: song.coverUrl,
        buyerName: form.buyerName.trim(), buyerStageName: form.buyerStageName.trim() || form.buyerName.trim(),
        cpfCnpj: form.cpfCnpj.trim(), buyerEmail: form.buyerEmail.trim().toLowerCase(), buyerWhatsapp: form.buyerWhatsapp.trim(),
        buyerCityState: form.buyerCityState.trim(), purpose, message: form.message.trim(),
        consentAccepted: true, consentPolicyVersion: REQUEST_CONSENT_POLICY_VERSION
      });
      setRequestCode(getRequestCode(request.id));
      try { window.sessionStorage.removeItem(draftKey); } catch { /* sem armazenamento */ }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // A mensagem do servidor é a informação útil aqui: limite de
      // solicitações atingido, obra indisponível ou plataforma em manutenção.
      // O que foi digitado continua no formulário (e no rascunho da aba).
      setError(`${err instanceof Error && err.message
        ? err.message
        : 'Falha ao registrar a solicitação. Verifique sua conexão e tente novamente.'} Seus dados continuam preenchidos.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const backUrl = `/compositor/${username}${song ? `?musica=${song.id}` : ''}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 px-4 py-10 sm:py-14">
          <div className="mx-auto max-w-6xl animate-pulse space-y-8">
            <div className="h-4 w-36 bg-slate-800 rounded" />
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 space-y-6">
                <div className="h-4 w-44 bg-slate-800 rounded" />
                <div className="h-8 w-80 bg-slate-800 rounded-xl" />
                <div className="h-4 w-full bg-slate-800/60 rounded" />
                <div className="grid gap-4 sm:grid-cols-2 pt-4">
                  <div className="h-12 bg-slate-950 rounded-xl border border-slate-800" />
                  <div className="h-12 bg-slate-950 rounded-xl border border-slate-800" />
                  <div className="h-12 bg-slate-950 rounded-xl border border-slate-800" />
                  <div className="h-12 bg-slate-950 rounded-xl border border-slate-800" />
                </div>
                <div className="h-28 bg-slate-950 rounded-xl border border-slate-800" />
                <div className="h-12 bg-slate-800 rounded-xl" />
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4">
                <div className="aspect-square w-full rounded-2xl bg-slate-800" />
                <div className="h-5 w-3/4 bg-slate-800 rounded" />
                <div className="h-4 w-1/2 bg-slate-800/60 rounded" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!song) return <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col"><Navbar /><main className="flex-1 px-4 py-20"><div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center"><Music className="mx-auto h-12 w-12 text-slate-600" /><h1 className="mt-4 text-2xl font-bold">Música indisponível</h1><p className="mt-2 text-sm text-slate-400">A obra pode ter sido removida, despublicada ou fechada para novas propostas.</p><Link to={`/compositor/${username}`} className="mt-6 inline-flex rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950">Voltar ao catálogo</Link></div></main><Footer /></div>;

  return <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col"><Navbar /><main className="flex-1 px-4 py-10 sm:py-14"><div className="mx-auto max-w-6xl">
    <Link to={backUrl} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar para a música</Link>

    {requestCode ? <section className="mx-auto mt-10 max-w-2xl rounded-3xl border border-emerald-500/30 bg-slate-900 p-8 text-center shadow-2xl"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" /><p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Solicitação registrada</p><h1 className="mt-2 text-3xl font-bold text-white">Seu interesse foi enviado</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400">O compositor recebeu os dados da proposta e poderá entrar em contato pelos canais informados.</p><div className="mx-auto mt-6 max-w-xs rounded-2xl border border-slate-700 bg-slate-950 p-4"><span className="block text-[11px] uppercase tracking-wider text-slate-500">Código da solicitação</span><strong className="mt-1 block font-mono text-xl text-amber-400">{requestCode}</strong></div><p className="mt-3 text-xs text-slate-500">Guarde este código para identificar sua solicitação. Enviamos também um comprovante para o e-mail informado.</p><Link to={backUrl} className="mt-7 inline-flex rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400">Voltar ao catálogo</Link></section> :
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-amber-400">Solicitação de liberação de gravação</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Tenho interesse em gravar esta obra</h1><p className="mt-2 text-sm leading-relaxed text-slate-400">Informe seus dados e os detalhes do projeto. O envio não gera cobrança nem autorização automática.</p>
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
          <strong className="block text-white">Como funciona o pagamento</strong>
          A plataforma não recebe nem intermedeia pagamentos. Valor, forma e prazo são combinados diretamente com o compositor. Depois de receber, ele emite o termo de liberação e você recebe por e-mail o termo, a música completa e a letra.
          <span className="mt-2 block text-slate-500">O prazo de resposta depende do compositor. Você receberá um comprovante com o código da solicitação no e-mail informado.</span>
        </div>
        {error && <div role="alert" className="mt-5 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
        <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-7">
          <input value={website} onChange={event => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-white">Seus dados</legend>
            <div className="grid gap-4 sm:grid-cols-2"><Field id="interest-buyerName" label="Nome completo" required value={form.buyerName} error={fieldErrors.buyerName} onChange={value => set('buyerName', value)} autoComplete="name" placeholder="Ex.: João da Silva" /><Field id="interest-buyerStageName" label="Nome artístico / empresa" value={form.buyerStageName} onChange={value => set('buyerStageName', value)} autoComplete="organization" placeholder="Ex.: Dupla João & Maria" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field id="interest-cpfCnpj" label="CPF ou CNPJ" helper="Usado para identificar com segurança quem solicita a autorização." required value={form.cpfCnpj} error={fieldErrors.cpfCnpj} onChange={value => set('cpfCnpj', maskCpfCnpj(value))} autoComplete="off" placeholder="000.000.000-00" /><Field id="interest-buyerCityState" label="Cidade e estado" required value={form.buyerCityState} error={fieldErrors.buyerCityState} onChange={value => set('buyerCityState', value)} autoComplete="address-level2" placeholder="São Paulo - SP" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field id="interest-buyerEmail" label="E-mail de contato" required type="email" value={form.buyerEmail} error={fieldErrors.buyerEmail} onChange={value => set('buyerEmail', value)} autoComplete="email" placeholder="voce@exemplo.com.br" /><Field id="interest-buyerEmailConfirm" label="Confirme o e-mail" helper="É para este e-mail que vão o comprovante e, depois, o termo e a música." required type="email" value={form.buyerEmailConfirm} error={fieldErrors.buyerEmailConfirm} onChange={value => set('buyerEmailConfirm', value)} autoComplete="off" placeholder="Repita o e-mail" /></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field id="interest-buyerWhatsapp" label="WhatsApp" helper="Canal para o compositor responder sobre valores e disponibilidade." required type="tel" value={form.buyerWhatsapp} error={fieldErrors.buyerWhatsapp} onChange={value => set('buyerWhatsapp', maskPhone(value))} autoComplete="tel" placeholder="(00) 90000-0000" /></div>
          </fieldset>
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-white">Sobre o projeto</legend>
            <label className="block text-xs font-semibold text-slate-300">Finalidade da gravação *<select id="interest-purpose" required value={form.purpose} onChange={event => set('purpose', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-3 text-sm text-white focus:border-amber-500 focus:outline-none">{PURPOSES.map(option => <option key={option}>{option}</option>)}</select></label>
            {form.purpose === OTHER_PURPOSE && <Field id="interest-purposeOther" label="Qual é a finalidade?" required value={form.purposeOther} error={fieldErrors.purposeOther} onChange={value => set('purposeOther', value)} autoComplete="off" placeholder="Ex.: gravação para culto transmitido ao vivo" />}
            <label className="block text-xs font-semibold text-slate-300">Mensagem para o compositor *<textarea id="interest-message" required minLength={20} maxLength={3000} rows={6} value={form.message} onChange={event => set('message', event.target.value)} aria-invalid={Boolean(fieldErrors.message)} aria-describedby={fieldErrors.message ? 'interest-message-error' : undefined} placeholder="Conte sobre seu projeto, prazo desejado e proposta..." className={`mt-1.5 w-full resize-y rounded-xl border bg-slate-950 px-3.5 py-3 text-sm leading-relaxed text-white focus:outline-none ${fieldErrors.message ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-amber-500'}`} /><span className="mt-1 flex justify-between gap-2 text-[11px]"><span id="interest-message-error" className="text-red-300">{fieldErrors.message}</span><span className="text-slate-500">{form.message.length}/3000</span></span></label>
          </fieldset>
          <div>
            <label className={`flex items-start gap-3 rounded-2xl border bg-slate-950 p-4 text-xs leading-relaxed text-slate-400 ${fieldErrors.terms ? 'border-red-500' : 'border-slate-800'}`}><input id="interest-terms" type="checkbox" checked={acceptedTerms} onChange={event => { setAcceptedTerms(event.target.checked); setFieldErrors(current => { const next = { ...current }; delete next.terms; return next; }); }} aria-invalid={Boolean(fieldErrors.terms)} className="mt-0.5" /><span>{REQUEST_CONSENT_STATEMENT} Li a <Link to="/privacidade" target="_blank" className="text-amber-400 hover:underline">Política de Privacidade</Link> (versão {REQUEST_CONSENT_POLICY_VERSION}).</span></label>
            {fieldErrors.terms && <p className="mt-1.5 text-xs text-red-300">{fieldErrors.terms}</p>}
          </div>
          <button disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">{isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isSubmitting ? 'Registrando solicitação...' : 'Enviar solicitação'}</button>
        </form>
      </section>
      <aside className="space-y-4 lg:sticky lg:top-6"><div className="rounded-3xl border border-slate-800 bg-slate-900 p-5"><img src={song.coverUrl} alt={song.title} className="aspect-square w-full rounded-2xl object-cover" /><span className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-amber-400">{song.genre}</span><h2 className="mt-1 text-xl font-bold text-white">{song.title}</h2><p className="mt-1 text-sm text-slate-400">Composição de {song.authors}</p>{song.valueType === 'suggested' && song.suggestedValue ? <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-300">Valor sugerido: {song.suggestedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p> : <p className="mt-4 rounded-xl bg-slate-950 px-3 py-2 text-sm text-slate-300">Valor sob consulta</p>}</div><div className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs leading-relaxed text-slate-400"><LockKeyhole className="h-5 w-5 shrink-0 text-emerald-400" /><span>Seus dados serão disponibilizados somente ao compositor responsável e aos administradores da plataforma.</span></div></aside>
    </div>}
  </div></main><Footer /></div>;
};

const Field = ({ id, label, helper, error, value, onChange, placeholder, autoComplete, required = false, type = 'text' }: { id: string; label: string; helper?: string; error?: string; value: string; onChange: (value: string) => void; placeholder: string; autoComplete: string; required?: boolean; type?: string }) => {
  const describedBy = [error ? `${id}-error` : '', helper ? `${id}-helper` : ''].filter(Boolean).join(' ') || undefined;
  return <label className="block text-xs font-semibold text-slate-300">{label}{required ? ' *' : ''}<input id={id} required={required} type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={describedBy} maxLength={160} className={`mt-1.5 w-full rounded-xl border bg-slate-950 px-3.5 py-3 text-sm text-white focus:outline-none ${error ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-amber-500'}`} />{error && <span id={`${id}-error`} className="mt-1.5 block text-[11px] font-normal text-red-300">{error}</span>}{helper && <span id={`${id}-helper`} className="mt-1.5 block text-[11px] font-normal leading-relaxed text-slate-500">{helper}</span>}</label>;
};
