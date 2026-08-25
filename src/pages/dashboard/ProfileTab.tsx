import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertCircle, Camera, CheckCircle2, Copy, ExternalLink, Plus, Save, X } from 'lucide-react';
import { uploadCurrentUserFile } from '../../lib/database';

const DEFAULT_PHOTO = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80';
const GENRES = ['Sertanejo', 'Romântico', 'Gospel', 'MPB', 'Forró', 'Pop', 'Samba / Pagode', 'Rock'];
const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const instagramValue = (value: string) => {
  const user = value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  return user ? `@${user}` : '';
};
const webValue = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

export const ProfileTab: React.FC = () => {
  const { profile, updateProfile } = useApp();
  const [form, setForm] = useState({ ...profile });
  const [customGenre, setCustomGenre] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [imageFiles, setImageFiles] = useState<Partial<Record<'photo'|'coverPhoto',File>>>({});

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) => setForm(current => ({ ...current, [key]: value }));
  const snapshot = useMemo(() => JSON.stringify(form), [form]);
  const hasChanges = snapshot !== JSON.stringify(profile);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  const processImage = (file: File, kind: 'photo' | 'coverPhoto') => {
    const maxSize = kind === 'photo' ? 5 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > maxSize) {
      setMessage({ type: 'error', text: `Use uma imagem JPG, PNG ou WebP com no máximo ${kind === 'photo' ? 5 : 8} MB.` });
      return;
    }
    if (form[kind].startsWith('blob:')) URL.revokeObjectURL(form[kind]);
    set(kind, URL.createObjectURL(file));
    setImageFiles(current=>({...current,[kind]:file}));
    setMessage(null);
  };

  const toggleGenre = (genre: string) => set('genres', form.genres.includes(genre)
    ? form.genres.filter(item => item !== genre)
    : [...form.genres, genre]);

  const addGenre = () => {
    const genre = customGenre.trim();
    if (!genre || form.genres.some(item => item.toLowerCase() === genre.toLowerCase())) return;
    set('genres', [...form.genres, genre]);
    setCustomGenre('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const username = form.username.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(username)) return setMessage({ type: 'error', text: 'O endereço público deve usar apenas letras minúsculas, números e hífens.' });
    if (![form.name, form.stageName, form.city, form.state, form.bio].every(value => value.trim())) return setMessage({ type: 'error', text: 'Preencha nome, nome artístico, cidade, estado e biografia.' });
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setMessage({ type: 'error', text: 'Informe um e-mail válido.' });
    if (form.whatsapp.replace(/\D/g, '').length < 10) return setMessage({ type: 'error', text: 'Informe um WhatsApp com DDD.' });
    if (!form.genres.length) return setMessage({ type: 'error', text: 'Selecione pelo menos um gênero musical.' });
    try {
    const uploadedPhoto=imageFiles.photo?await uploadCurrentUserFile('profile-media',imageFiles.photo):form.photo;
    const uploadedCover=imageFiles.coverPhoto?await uploadCurrentUserFile('profile-media',imageFiles.coverPhoto):form.coverPhoto;
    const normalized = {
      ...form, username, name: form.name.trim(), stageName: form.stageName.trim(),
      email: form.email.trim(), whatsapp: form.whatsapp.trim(), city: form.city.trim(),
      bio: form.bio.trim(), photo: uploadedPhoto, coverPhoto: uploadedCover,
      instagram: instagramValue(form.instagram), youtube: webValue(form.youtube), website: webValue(form.website)
    };
    updateProfile(normalized);
    setForm(normalized);
    setMessage({ type: 'success', text: 'Perfil atualizado com sucesso.' });
    window.setTimeout(() => setMessage(null), 3000);
    } catch(error) { setMessage({type:'error',text:error instanceof Error?error.message:'Não foi possível enviar as imagens.'}); }
  };

  const copyLink = async () => {
    if (form.username !== profile.username) {
      setMessage({ type: 'error', text: 'Salve o novo endereço público antes de copiá-lo.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/compositor/${form.username}`);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch { setMessage({ type: 'error', text: 'Não foi possível copiar o link.' }); }
  };

  const inputClass = 'mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500';
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      <header className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-extrabold text-white">Meu Perfil Artístico</h1><p className="text-xs text-slate-400 mt-1">Gerencie sua apresentação pública e seus dados privados de contato.</p></div>
        <a href={`/compositor/${profile.username}`} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-slate-800 text-amber-400 font-bold text-xs flex items-center gap-2">Ver perfil público <ExternalLink className="w-4 h-4" /></a>
      </header>

      {message && <div role={message.type === 'error' ? 'alert' : 'status'} className={`p-4 rounded-2xl text-sm flex items-center gap-3 ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/30 text-red-200' : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'}`}>{message.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}<span className="flex-1">{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Fechar mensagem"><X className="w-4 h-4" /></button></div>}

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-8">
        <section className="space-y-4">
          <div><h2 className="font-bold text-white">Imagens do perfil</h2><p className="text-xs text-slate-400">Arquivos locais são temporários até a integração do armazenamento.</p></div>
          <div className="relative rounded-2xl overflow-hidden h-44 bg-slate-950 border border-slate-800">
            <img src={form.coverPhoto || DEFAULT_COVER} onError={e => { e.currentTarget.src = DEFAULT_COVER; }} alt="Capa do perfil" className="w-full h-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 flex items-center gap-3"><img src={form.photo || DEFAULT_PHOTO} onError={e => { e.currentTarget.src = DEFAULT_PHOTO; }} alt={form.stageName} className="w-16 h-16 rounded-2xl border-2 border-amber-400 object-cover" /><div><h3 className="font-bold text-white">{form.stageName || 'Nome artístico'}</h3><p className="text-xs text-amber-300">{form.city || 'Cidade'} - {form.state || 'UF'}</p></div></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{([['photo','Foto de perfil','5'],['coverPhoto','Imagem de capa','8']] as const).map(([kind,label,limit]) => <label key={kind} className="border-2 border-dashed border-slate-800 hover:border-amber-500/40 rounded-2xl p-4 text-center cursor-pointer text-xs text-slate-300"><Camera className="w-5 h-5 text-amber-400 mx-auto mb-2" />{label}<span className="block text-[11px] text-slate-500">JPG, PNG ou WebP, até {limit} MB</span><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => e.target.files?.[0] && processImage(e.target.files[0], kind)} /></label>)}</div>
        </section>

        <section className="space-y-4 border-t border-slate-800 pt-6">
          <div><h2 className="font-bold text-white">Informações públicas</h2><p className="text-xs text-slate-400">Estes dados aparecem para visitantes do catálogo.</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs text-slate-300">Nome artístico *<input required maxLength={100} value={form.stageName} onChange={e => set('stageName', e.target.value)} className={inputClass} /></label>
            <label className="text-xs text-slate-300">Endereço público *<div className="mt-1 flex"><span className="bg-slate-800 rounded-l-xl px-3 py-2.5 text-xs text-slate-400">/compositor/</span><input required value={form.username} onChange={e => set('username', e.target.value.toLowerCase().replace(/\s+/g, '-'))} className="min-w-0 flex-1 bg-slate-950 border border-slate-800 rounded-r-xl px-3 text-sm text-white" /><button type="button" onClick={copyLink} aria-label="Copiar link público" className="ml-2 px-3 rounded-xl bg-slate-800 text-amber-400"><Copy className="w-4 h-4" /></button></div><span className="text-[11px] text-slate-500">{linkCopied ? 'Link copiado.' : 'Letras, números e hífens.'}</span></label>
            <label className="text-xs text-slate-300">Cidade *<input required maxLength={80} value={form.city} onChange={e => set('city', e.target.value)} className={inputClass} /></label>
            <label className="text-xs text-slate-300">Estado *<select required value={form.state} onChange={e => set('state', e.target.value)} className={inputClass}><option value="">Selecione</option>{STATES.map(uf => <option key={uf}>{uf}</option>)}</select></label>
            <label className="text-xs text-slate-300 sm:col-span-2">Experiência<input maxLength={40} value={form.experienceYears} onChange={e => set('experienceYears', e.target.value)} placeholder="Ex: 12 anos" className={inputClass} /></label>
          </div>
          <label className="text-xs text-slate-300 block">Biografia *<textarea required rows={5} maxLength={600} value={form.bio} onChange={e => set('bio', e.target.value)} className={`${inputClass} resize-none`} /><span className="block text-right text-[11px] text-slate-500">{form.bio.length} / 600</span></label>
          <div className="space-y-2"><span className="text-xs text-slate-300">Gêneros musicais *</span><div className="flex flex-wrap gap-2">{GENRES.map(genre => <button type="button" key={genre} onClick={() => toggleGenre(genre)} aria-pressed={form.genres.includes(genre)} className={`px-3 py-1.5 rounded-full text-xs border ${form.genres.includes(genre) ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-950 text-slate-400 border-slate-800'}`}>{genre}</button>)}</div><div className="flex gap-2"><input value={customGenre} maxLength={40} onChange={e => setCustomGenre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGenre(); } }} placeholder="Outro gênero" className={`${inputClass} mt-0`} /><button type="button" onClick={addGenre} aria-label="Adicionar gênero" className="px-3 rounded-xl bg-slate-800 text-amber-400"><Plus className="w-4 h-4" /></button></div>{form.genres.filter(genre => !GENRES.includes(genre)).map(genre => <button type="button" key={genre} onClick={() => toggleGenre(genre)} className="mr-2 text-xs text-amber-300">{genre} ×</button>)}</div>
        </section>

        <section className="space-y-4 border-t border-slate-800 pt-6"><div><h2 className="font-bold text-white">Dados privados de contato</h2><p className="text-xs text-slate-400">Usados na conta e nas negociações; não aparecem no perfil público.</p></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="text-xs text-slate-300">Nome civil *<input required maxLength={120} value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} /></label><label className="text-xs text-slate-300">E-mail *<input type="email" required value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} /></label><label className="text-xs text-slate-300">WhatsApp *<input type="tel" required value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="(00) 00000-0000" className={inputClass} /></label></div></section>

        <section className="space-y-4 border-t border-slate-800 pt-6"><div><h2 className="font-bold text-white">Redes e site</h2><p className="text-xs text-slate-400">Informe o usuário ou cole o endereço completo.</p></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><label className="text-xs text-slate-300">Instagram<input maxLength={120} value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@seuusuario" className={inputClass} /></label><label className="text-xs text-slate-300">YouTube<input maxLength={200} value={form.youtube} onChange={e => set('youtube', e.target.value)} placeholder="youtube.com/@canal" className={inputClass} /></label><label className="text-xs text-slate-300">Website<input maxLength={200} value={form.website} onChange={e => set('website', e.target.value)} placeholder="seusite.com.br" className={inputClass} /></label></div></section>

        <button type="submit" disabled={!hasChanges} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-extrabold text-sm shadow-xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Save className="w-4 h-4" />{hasChanges ? 'Salvar alterações do perfil' : 'Perfil atualizado'}</button>
      </form>
    </div>
  );
};
