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

type FormData = {
  buyerName: string; buyerStageName: string; cpfCnpj: string; buyerEmail: string;
  buyerWhatsapp: string; buyerCityState: string; purpose: string; message: string;
};

const initialForm: FormData = {
  buyerName: '', buyerStageName: '', cpfCnpj: '', buyerEmail: '', buyerWhatsapp: '', buyerCityState: '',
  purpose: 'Gravação de Single / Lançamento Digital', message: ''
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

  const set = (field: keyof FormData, value: string) => setForm(current => ({ ...current, [field]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (website) return;
    if (!song) { setError('Esta música não está disponível para solicitações.'); return; }
    if (!acceptedTerms) { setError('Confirme a declaração de veracidade antes de enviar.'); return; }
    if (![form.buyerName, form.cpfCnpj, form.buyerEmail, form.buyerWhatsapp, form.buyerCityState, form.purpose, form.message].every(value => value.trim())) {
      setError('Preencha todos os campos obrigatórios.'); return;
    }
    const documentDigits = form.cpfCnpj.replace(/\D/g, '');
    if (![11, 14].includes(documentDigits.length)) { setError('Informe um CPF ou CNPJ com quantidade válida de dígitos.'); return; }
    const phoneDigits = form.buyerWhatsapp.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 13) { setError('Informe um WhatsApp válido com DDD.'); return; }
    if (form.message.trim().length < 20) { setError('Escreva uma mensagem com pelo menos 20 caracteres.'); return; }

    setIsSubmitting(true);
    const request = await addInterestRequest({
      songId: song.id, songTitle: song.title, songCover: song.coverUrl,
      buyerName: form.buyerName.trim(), buyerStageName: form.buyerStageName.trim() || form.buyerName.trim(),
      cpfCnpj: form.cpfCnpj.trim(), buyerEmail: form.buyerEmail.trim().toLowerCase(), buyerWhatsapp: form.buyerWhatsapp.trim(),
      buyerCityState: form.buyerCityState.trim(), purpose: form.purpose, message: form.message.trim()
    });
    setIsSubmitting(false);
    if (!request) { setError('Não foi possível registrar a solicitação. Aguarde um momento e tente novamente.'); return; }
    setRequestCode(getRequestCode(request.id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const backUrl = `/compositor/${username}${song ? `?musica=${song.id}` : ''}`;

  if (loading) return <div className="min-h-screen bg-slate-950 text-amber-400 flex items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin" /></div>;

  if (!song) return <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col"><Navbar /><main className="flex-1 px-4 py-20"><div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center"><Music className="mx-auto h-12 w-12 text-slate-600" /><h1 className="mt-4 text-2xl font-bold">Música indisponível</h1><p className="mt-2 text-sm text-slate-400">A obra pode ter sido removida, despublicada ou fechada para novas propostas.</p><Link to={`/compositor/${username}`} className="mt-6 inline-flex rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950">Voltar ao catálogo</Link></div></main><Footer /></div>;

  return <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col"><Navbar /><main className="flex-1 px-4 py-10 sm:py-14"><div className="mx-auto max-w-6xl">
    <Link to={backUrl} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar para a música</Link>

    {requestCode ? <section className="mx-auto mt-10 max-w-2xl rounded-3xl border border-emerald-500/30 bg-slate-900 p-8 text-center shadow-2xl"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" /><p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-emerald-400">Solicitação registrada</p><h1 className="mt-2 text-3xl font-bold text-white">Seu interesse foi enviado</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400">O compositor recebeu os dados da proposta e poderá entrar em contato pelos canais informados.</p><div className="mx-auto mt-6 max-w-xs rounded-2xl border border-slate-700 bg-slate-950 p-4"><span className="block text-[11px] uppercase tracking-wider text-slate-500">Código da solicitação</span><strong className="mt-1 block font-mono text-xl text-amber-400">{requestCode}</strong></div><p className="mt-3 text-xs text-slate-500">Guarde este código para identificar sua solicitação.</p><Link to={backUrl} className="mt-7 inline-flex rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400">Voltar ao catálogo</Link></section> :
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-amber-400">Solicitação de liberação de gravação</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Tenho interesse em gravar esta obra</h1><p className="mt-2 text-sm leading-relaxed text-slate-400">Informe seus dados e os detalhes do projeto. O envio não gera cobrança nem autorização automática.</p>
        {error && <div role="alert" className="mt-5 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <input value={website} onChange={event => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Nome completo" required value={form.buyerName} onChange={value => set('buyerName', value)} autoComplete="name" placeholder="Ex.: João da Silva" /><Field label="Nome artístico / empresa" value={form.buyerStageName} onChange={value => set('buyerStageName', value)} autoComplete="organization" placeholder="Ex.: Dupla João & Maria" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="CPF ou CNPJ" required value={form.cpfCnpj} onChange={value => set('cpfCnpj', maskCpfCnpj(value))} autoComplete="off" placeholder="000.000.000-00" /><Field label="Cidade e estado" required value={form.buyerCityState} onChange={value => set('buyerCityState', value)} autoComplete="address-level2" placeholder="São Paulo - SP" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="E-mail de contato" required type="email" value={form.buyerEmail} onChange={value => set('buyerEmail', value)} autoComplete="email" placeholder="voce@exemplo.com.br" /><Field label="WhatsApp" required type="tel" value={form.buyerWhatsapp} onChange={value => set('buyerWhatsapp', maskPhone(value))} autoComplete="tel" placeholder="(00) 90000-0000" /></div>
          <label className="block text-xs font-semibold text-slate-300">Finalidade da gravação *<select required value={form.purpose} onChange={event => set('purpose', event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-3 text-sm text-white focus:border-amber-500 focus:outline-none"><option>Gravação de Single / Lançamento Digital</option><option>Gravação de Álbum / EP Completo</option><option>Gravação de DVD / Projeto Ao Vivo</option><option>Uso Comercial / Trilha Sonora / Publicidade</option><option>Outra finalidade</option></select></label>
          <label className="block text-xs font-semibold text-slate-300">Mensagem para o compositor *<textarea required minLength={20} maxLength={3000} rows={6} value={form.message} onChange={event => set('message', event.target.value)} placeholder="Conte sobre seu projeto, prazo desejado e proposta..." className="mt-1.5 w-full resize-y rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-3 text-sm leading-relaxed text-white focus:border-amber-500 focus:outline-none" /><span className="mt-1 block text-right text-[11px] text-slate-500">{form.message.length}/3000</span></label>
          <label className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-400"><input type="checkbox" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} className="mt-0.5" /><span>Declaro que os dados são verdadeiros e estou ciente de que valores e autorização serão negociados diretamente com o compositor. Li a <Link to="/privacidade" target="_blank" className="text-amber-400 hover:underline">Política de Privacidade</Link>.</span></label>
          <button disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">{isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isSubmitting ? 'Registrando solicitação...' : 'Enviar solicitação'}</button>
        </form>
      </section>
      <aside className="space-y-4 lg:sticky lg:top-6"><div className="rounded-3xl border border-slate-800 bg-slate-900 p-5"><img src={song.coverUrl} alt={song.title} className="aspect-square w-full rounded-2xl object-cover" /><span className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-amber-400">{song.genre}</span><h2 className="mt-1 text-xl font-bold text-white">{song.title}</h2><p className="mt-1 text-sm text-slate-400">Composição de {song.authors}</p>{song.valueType === 'suggested' && song.suggestedValue ? <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-300">Valor sugerido: {song.suggestedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p> : <p className="mt-4 rounded-xl bg-slate-950 px-3 py-2 text-sm text-slate-300">Valor sob consulta</p>}</div><div className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs leading-relaxed text-slate-400"><LockKeyhole className="h-5 w-5 shrink-0 text-emerald-400" /><span>Seus dados serão disponibilizados somente ao compositor responsável e aos administradores da plataforma.</span></div></aside>
    </div>}
  </div></main><Footer /></div>;
};

const Field = ({ label, value, onChange, placeholder, autoComplete, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; autoComplete: string; required?: boolean; type?: string }) => <label className="block text-xs font-semibold text-slate-300">{label}{required ? ' *' : ''}<input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} maxLength={160} className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-3 text-sm text-white focus:border-amber-500 focus:outline-none" /></label>;
