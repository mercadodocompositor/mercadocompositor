import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  AlertCircle, 
  Camera, 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  Plus, 
  Save, 
  X, 
  User, 
  ShieldCheck, 
  Sparkles, 
  MapPin, 
  Award, 
  Disc, 
  Globe, 
  Instagram, 
  Youtube, 
  Music, 
  LoaderCircle,
  Link as LinkIcon
} from 'lucide-react';
import { uploadCurrentUserFile } from '../../lib/database';

const DEFAULT_PHOTO = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80';
const GENRES = ['Sertanejo', 'Sertanejo Universitário', 'Romântico', 'Gospel', 'MPB', 'Forró / Piseiro', 'Pop', 'Samba / Pagode', 'Trap / Rap', 'Rock'];
const SOCIETIES = [
  'UBC - União Brasileira de Compositores',
  'ABRAMUS - Associação Brasileira de Música e Artes',
  'SOCINPRO - Sociedade Brasileira de Administração e Proteção de Direitos',
  'AMAR/SOMBRÁS - Associação de Músicos, Arranjadores e Regentes',
  'SBACEM - Sociedade Brasileira de Autores, Compositores e Escritores de Música',
  'ASSIM - Associação de Intérpretes e Músicos',
  'SICAM - Sociedade Independente de Compositores e Autores Musicais',
  'Compositor Independente / Não filiado a Sociedade'
];
const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

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

const maskCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const sanitizeSlug = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const sanitizeInstagram = (value: string) => {
  const clean = value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  return clean ? `@${clean}` : '';
};

const sanitizeWeb = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

export const ProfileTab: React.FC = () => {
  const { profile, updateProfile, songs } = useApp();
  const [form, setForm] = useState({ ...profile });
  const [customGenre, setCustomGenre] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFiles, setImageFiles] = useState<Partial<Record<'photo'|'coverPhoto', File>>>({});

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
    if (form[kind]?.startsWith('blob:')) URL.revokeObjectURL(form[kind]);
    set(kind, URL.createObjectURL(file));
    setImageFiles(current => ({ ...current, [kind]: file }));
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
    const username = sanitizeSlug(form.username);
    if (!username) {
      setMessage({ type: 'error', text: 'O endereço público não pode estar vazio.' });
      return;
    }
    if (![form.name, form.stageName, form.city, form.state, form.bio].every(value => value.trim())) {
      setMessage({ type: 'error', text: 'Preencha os campos obrigatórios: Nome civil, Nome artístico, Cidade, Estado e Biografia.' });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setMessage({ type: 'error', text: 'Informe um e-mail de contato válido.' });
      return;
    }
    const phoneDigits = form.whatsapp.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setMessage({ type: 'error', text: 'Informe um WhatsApp com DDD válido.' });
      return;
    }
    const cpfDigits = (form.cpf || '').replace(/\D/g, '');
    if (cpfDigits && cpfDigits.length !== 11) {
      setMessage({ type: 'error', text: 'Informe um CPF válido com 11 dígitos para emissão dos termos de liberação.' });
      return;
    }
    if (!form.genres.length) {
      setMessage({ type: 'error', text: 'Selecione pelo menos um gênero musical que represente seu estilo.' });
      return;
    }

    setIsSaving(true);
    try {
      const uploadedPhoto = imageFiles.photo ? await uploadCurrentUserFile('profile-media', imageFiles.photo) : form.photo;
      const uploadedCover = imageFiles.coverPhoto ? await uploadCurrentUserFile('profile-media', imageFiles.coverPhoto) : form.coverPhoto;
      
      const normalized = {
        ...form,
        username,
        name: form.name.trim(),
        stageName: form.stageName.trim(),
        email: form.email.trim().toLowerCase(),
        whatsapp: form.whatsapp.trim(),
        cpf: form.cpf ? form.cpf.trim() : '',
        society: form.society || '',
        city: form.city.trim(),
        state: form.state.trim(),
        bio: form.bio.trim(),
        experienceYears: form.experienceYears.trim(),
        photo: uploadedPhoto,
        coverPhoto: uploadedCover,
        instagram: sanitizeInstagram(form.instagram),
        youtube: sanitizeWeb(form.youtube),
        spotify: sanitizeWeb(form.spotify || ''),
        website: sanitizeWeb(form.website)
      };

      await updateProfile(normalized);
      setForm(normalized);
      setImageFiles({});
      setMessage({ type: 'success', text: 'Perfil artístico e dados cadastrais atualizados com sucesso!' });
      window.setTimeout(() => setMessage(null), 3500);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar as alterações. Tente novamente.' });
    } finally {
      setIsSaving(false);
    }
  };

  const copyLink = async () => {
    if (form.username !== profile.username) {
      setMessage({ type: 'error', text: 'Salve as alterações do perfil antes de copiar o novo link público.' });
      return;
    }
    try {
      const url = `${window.location.origin}/compositor/${form.username}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      setMessage({ type: 'error', text: 'Não foi possível copiar o link.' });
    }
  };

  const inputClass = 'mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition';

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn pb-12">
      
      {/* Top Header */}
      <header className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <User className="w-3.5 h-3.5" />
            <span>Perfil Artístico & Comercial</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Meu Perfil de Compositor
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie sua vitrine pública, bio, mídias e dados para emissão de liberações.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`/compositor/${profile.username}`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
          >
            <span>Ver Vitrine Pública</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* Alert Messages */}
      {message && (
        <div 
          role={message.type === 'error' ? 'alert' : 'status'} 
          className={`p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-3 animate-fadeIn ${
            message.type === 'error' 
              ? 'bg-red-500/10 border border-red-500/30 text-red-200' 
              : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
          }`}
        >
          {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Fechar mensagem" className="p-1 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-8">
        
        {/* SECTION 1: LIVE INTERACTIVE PREVIEW & IMAGES */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-bold text-white text-base">Identidade Visual & Live Preview</h2>
              <p className="text-xs text-slate-400">Prévia em tempo real de como os artistas e produtores verão seu perfil.</p>
            </div>
            <span className="text-[11px] text-amber-400 font-mono font-bold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              Live Preview
            </span>
          </div>

          {/* Banner Live Preview Card */}
          <div className="relative rounded-3xl overflow-hidden h-52 bg-slate-950 border border-slate-800 shadow-xl">
            <img 
              src={form.coverPhoto || DEFAULT_COVER} 
              onError={e => { e.currentTarget.src = DEFAULT_COVER; }} 
              alt="Capa do perfil" 
              className="w-full h-full object-cover opacity-60" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            
            <div className="absolute bottom-4 left-4 right-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <img 
                  src={form.photo || DEFAULT_PHOTO} 
                  onError={e => { e.currentTarget.src = DEFAULT_PHOTO; }} 
                  alt={form.stageName} 
                  className="w-20 h-20 rounded-2xl border-3 border-amber-400 object-cover shadow-2xl bg-slate-900" 
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Compositor Verificado
                    </span>
                    {form.society && (
                      <span className="bg-slate-900/90 text-slate-300 text-[10px] px-2 py-0.5 rounded-full border border-slate-700 hidden sm:inline">
                        {form.society.split(' - ')[0]}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-white text-xl leading-tight">
                    {form.stageName || 'Nome Artístico'}
                  </h3>
                  <p className="text-xs text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>{form.city || 'Sua Cidade'} — {form.state || 'UF'}</span>
                    {form.experienceYears && <span>• {form.experienceYears} de estrada</span>}
                  </p>
                </div>
              </div>

              <div className="hidden md:flex flex-wrap gap-1 max-w-xs justify-end">
                {form.genres.slice(0, 3).map(g => (
                  <span key={g} className="text-[10px] bg-slate-900/90 text-amber-300 px-2 py-0.5 rounded-full border border-slate-700">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Upload Dropzones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <label className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 text-center cursor-pointer text-xs text-slate-300 bg-slate-950/40 hover:bg-slate-950 transition space-y-1 block">
              <Camera className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <strong className="text-white block font-semibold">Alterar Foto de Perfil (Avatar)</strong>
              <span className="block text-[11px] text-slate-500">JPG, PNG ou WebP (Proporção 1:1, até 5 MB)</span>
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/webp" 
                className="sr-only" 
                onChange={e => e.target.files?.[0] && processImage(e.target.files[0], 'photo')} 
              />
            </label>

            <label className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 text-center cursor-pointer text-xs text-slate-300 bg-slate-950/40 hover:bg-slate-950 transition space-y-1 block">
              <Camera className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <strong className="text-white block font-semibold">Alterar Capa de Fundo (Banner)</strong>
              <span className="block text-[11px] text-slate-500">JPG, PNG ou WebP (Proporção 16:9, até 8 MB)</span>
              <input 
                type="file" 
                accept="image/jpeg,image/png,image/webp" 
                className="sr-only" 
                onChange={e => e.target.files?.[0] && processImage(e.target.files[0], 'coverPhoto')} 
              />
            </label>
          </div>
        </section>

        {/* SECTION 2: ARTISTIC PRESENTATION & PUBLIC VITRINE */}
        <section className="space-y-4 border-t border-slate-800 pt-6">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="font-bold text-white text-base">Apresentação Artística & Vitrine Pública</h2>
            <p className="text-xs text-slate-400">Informações visíveis para cantores, empresários e produtoras musicais.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300">
                Nome Artístico / Pseudônimo *
              </label>
              <input 
                required 
                maxLength={100} 
                value={form.stageName} 
                onChange={e => set('stageName', e.target.value)} 
                placeholder="Ex: Rafael Monteiro"
                className={inputClass} 
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">
                Endereço Público (Link da Vitrine) *
              </label>
              <div className="mt-1.5 flex">
                <span className="bg-slate-800 rounded-l-xl px-3 py-2.5 text-xs text-slate-400 border border-r-0 border-slate-800 select-none">
                  /compositor/
                </span>
                <input 
                  required 
                  value={form.username} 
                  onChange={e => set('username', sanitizeSlug(e.target.value))} 
                  placeholder="seu-nome"
                  className="min-w-0 flex-1 bg-slate-950 border border-slate-800 rounded-r-xl px-3 text-sm text-white focus:outline-none focus:border-amber-500 font-mono" 
                />
                <button 
                  type="button" 
                  onClick={copyLink} 
                  aria-label="Copiar link público" 
                  className="ml-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition"
                  title="Copiar link do catálogo público"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {linkCopied ? '✓ Link copiado para a área de transferência!' : 'Use apenas letras minúsculas, números e hífens.'}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">
                Cidade *
              </label>
              <input 
                required 
                maxLength={80} 
                value={form.city} 
                onChange={e => set('city', e.target.value)} 
                placeholder="Ex: Goiânia"
                className={inputClass} 
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">
                Estado (UF) *
              </label>
              <select 
                required 
                value={form.state} 
                onChange={e => set('state', e.target.value)} 
                className={inputClass}
              >
                <option value="">Selecione o estado</option>
                {STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Tempo de Estrada / Experiência Musical
              </label>
              <input 
                maxLength={50} 
                value={form.experienceYears} 
                onChange={e => set('experienceYears', e.target.value)} 
                placeholder="Ex: 10 anos compondo para artistas nacionais" 
                className={inputClass} 
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Biografia Artística / Apresentação *
              </label>
              <span className="text-[11px] text-slate-500">
                {form.bio.length} / 600 caracteres
              </span>
            </div>
            <textarea 
              required 
              rows={4} 
              maxLength={600} 
              value={form.bio} 
              onChange={e => set('bio', e.target.value)} 
              placeholder="Conte sua trajetória, parcerias, influências, gravações de sucesso e diferenciais das suas composições..."
              className={`${inputClass} resize-none leading-relaxed`} 
            />
          </div>

          {/* Genres selection */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-semibold text-slate-300 block">
              Gêneros Musicais de Destaque *
            </span>
            <div className="flex flex-wrap gap-2">
              {GENRES.map(genre => {
                const isSelected = form.genres.includes(genre);
                return (
                  <button 
                    type="button" 
                    key={genre} 
                    onClick={() => toggleGenre(genre)} 
                    aria-pressed={isSelected} 
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      isSelected 
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md font-bold' 
                        : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <input 
                value={customGenre} 
                maxLength={40} 
                onChange={e => setCustomGenre(e.target.value)} 
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGenre(); } }} 
                placeholder="Adicionar outro estilo personalizado..." 
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500" 
              />
              <button 
                type="button" 
                onClick={addGenre} 
                aria-label="Adicionar gênero" 
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs flex items-center gap-1 border border-slate-700 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar</span>
              </button>
            </div>

            {form.genres.filter(genre => !GENRES.includes(genre)).map(genre => (
              <span key={genre} className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-xl text-xs mr-2 mt-2">
                {genre}
                <button type="button" onClick={() => toggleGenre(genre)} className="text-amber-400 hover:text-white ml-1 font-bold">×</button>
              </span>
            ))}
          </div>
        </section>

        {/* SECTION 3: LEGAL DATA & REGISTRATION (ECAD, CPF, CONTRACTS) */}
        <section className="space-y-4 border-t border-slate-800 pt-6">
          <div className="border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="font-bold text-white text-base">Identificação Civil & Jurídica (Termos de Liberação)</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Estes dados são protegidos e utilizados exclusivamente na emissão de termos de autorização e cessão fonográfica.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300">
                Nome Civil Completo (Titular dos Direitos) *
              </label>
              <input 
                required 
                maxLength={120} 
                value={form.name} 
                onChange={e => set('name', e.target.value)} 
                placeholder="Ex: Rafael da Silva Monteiro"
                className={inputClass} 
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">
                CPF do Compositor *
              </label>
              <input 
                required
                type="text"
                value={form.cpf} 
                onChange={e => set('cpf', maskCpf(e.target.value))} 
                placeholder="000.000.000-00"
                className={`${inputClass} font-mono`} 
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Necessário para qualificação jurídica nos termos de liberação.</span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">
                E-mail para Notificações e Negociações *
              </label>
              <input 
                type="email" 
                required 
                value={form.email} 
                onChange={e => set('email', e.target.value)} 
                placeholder="seuemail@exemplo.com.br"
                className={inputClass} 
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">
                WhatsApp de Contato Direto *
              </label>
              <input 
                type="tel" 
                required 
                value={form.whatsapp} 
                onChange={e => set('whatsapp', maskPhone(e.target.value))} 
                placeholder="(00) 00000-0000" 
                className={`${inputClass} font-mono`} 
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Sociedade de Gestão Coletiva / Arrecadação (ECAD)
              </label>
              <select 
                value={form.society || ''} 
                onChange={e => set('society', e.target.value)} 
                className={inputClass}
              >
                <option value="">Selecione sua sociedade de filiação (Opcional)</option>
                {SOCIETIES.map(soc => (
                  <option key={soc} value={soc}>{soc}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* SECTION 4: SOCIAL MEDIA & STREAMING LINKS */}
        <section className="space-y-4 border-t border-slate-800 pt-6">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="font-bold text-white text-base">Redes Sociais & Links Externos</h2>
            <p className="text-xs text-slate-400">Canais para artistas conhecerem mais do seu trabalho e ouvirem suas produções.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Instagram className="w-3.5 h-3.5 text-pink-400" />
                <span>Instagram</span>
              </label>
              <input 
                maxLength={120} 
                value={form.instagram} 
                onChange={e => set('instagram', e.target.value)} 
                placeholder="@seuusuario ou instagram.com/usuario" 
                className={inputClass} 
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Youtube className="w-3.5 h-3.5 text-red-400" />
                <span>Canal no YouTube</span>
              </label>
              <input 
                maxLength={200} 
                value={form.youtube} 
                onChange={e => set('youtube', e.target.value)} 
                placeholder="youtube.com/@seucanal" 
                className={inputClass} 
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-emerald-400" />
                <span>Spotify / Plataforma de Streaming</span>
              </label>
              <input 
                maxLength={200} 
                value={form.spotify || ''} 
                onChange={e => set('spotify', e.target.value)} 
                placeholder="open.spotify.com/artist/..." 
                className={inputClass} 
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-amber-400" />
                <span>Website / Portfólio Oficial</span>
              </label>
              <input 
                maxLength={200} 
                value={form.website} 
                onChange={e => set('website', e.target.value)} 
                placeholder="seusite.com.br" 
                className={inputClass} 
              />
            </div>
          </div>
        </section>

        {/* Submit Bar */}
        <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-slate-400">
            {hasChanges ? '⚠️ Você possui alterações não salvas no perfil.' : '✓ Todas as informações estão salvas e atualizadas.'}
          </span>

          <button 
            type="submit" 
            disabled={!hasChanges || isSaving} 
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-sm shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>Salvando e enviando imagens...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{hasChanges ? 'Salvar Alterações do Perfil' : 'Perfil Atualizado'}</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};
