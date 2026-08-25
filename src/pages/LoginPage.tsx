import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, Lock, Mail, Mic2, ShieldCheck, User } from 'lucide-react';
import { useApp } from '../context/AppContext';

type AuthMode = 'login' | 'register' | 'forgot' | 'new-password' | 'admin';
type Notice = { type: 'success' | 'error'; text: string } | null;

const validModes: AuthMode[] = ['login', 'register', 'forgot', 'new-password', 'admin'];
const cleanMessage = (value: string) => value
  .replace(/&#x20;|&#32;|&nbsp;/gi, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
  .replace(/\s+/g, ' ').trim();
const authMessage = (message?: string | null) => {
  if (!message) return 'Não foi possível concluir a operação. Tente novamente.';
  const cleaned = cleanMessage(message);
  const value = cleaned.toLowerCase();
  if (value.includes('invalid login credentials')) return 'E-mail ou senha inválidos.';
  if (value.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (value.includes('user already registered')) return 'Já existe uma conta com este e-mail.';
  if (value.includes('password should be')) return 'A senha não atende aos requisitos mínimos de segurança.';
  if (value.includes('rate limit') || value.includes('too many emails')) return 'Limite temporário de envio atingido. Aguarde antes de solicitar outro e-mail.';
  return cleaned;
};

const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const LoginPage: React.FC = () => {
  const { login, register, resetPassword, resendConfirmation, updatePassword, adminLogin, authError, isAuthenticated, authLoading } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get('modo') as AuthMode | null;
  const mode: AuthMode = requestedMode && validModes.includes(requestedMode) ? requestedMode : 'login';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [stageName, setStageName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [recoveryCooldown, setRecoveryCooldown] = useState(0);
  const destination = (location.state as { from?: string } | null)?.from || '/dashboard';

  const title = useMemo(() => ({
    login: 'Acesse sua conta', register: 'Crie sua conta de compositor', forgot: 'Recupere sua senha',
    'new-password': 'Defina uma nova senha', admin: 'Acesso administrativo'
  }[mode]), [mode]);

  useEffect(() => {
    const callbackError = searchParams.get('error_description');
    if (callbackError) setNotice({ type: 'error', text: cleanMessage(decodeURIComponent(callbackError.replace(/\+/g, ' '))) });
    else if (searchParams.get('confirmado') === '1') setNotice({type:'success',text:'E-mail confirmado. Sua conta está pronta para entrar.'});
  }, [searchParams]);

  useEffect(() => {
    if (authError) setNotice({ type: 'error', text: authMessage(authError) });
  }, [authError]);

  useEffect(() => {
    if (recoveryCooldown <= 0) return;
    const timer=window.setTimeout(()=>setRecoveryCooldown(value=>value-1),1000);
    return()=>window.clearTimeout(timer);
  },[recoveryCooldown]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && mode !== 'new-password' && mode !== 'admin') navigate(destination, { replace: true });
  }, [authLoading, destination, isAuthenticated, mode, navigate]);

  const changeMode = (next: AuthMode) => {
    setNotice(null); setPassword(''); setConfirmPassword('');
    setSearchParams(next === 'login' ? {} : { modo: next });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setNotice(null); setLoading(true);
    try {
      if (mode === 'login') {
        if (await login(email.trim(), password)) navigate(destination, { replace: true });
        else setNotice({type:'error',text:'Não foi possível entrar. Verifique suas credenciais e a confirmação do e-mail.'});
      } else if (mode === 'admin') {
        if (await adminLogin(email.trim(), password)) navigate('/admin', { replace: true });
        else setNotice({type:'error',text:'Credenciais inválidas ou conta sem função administrativa.'});
      } else if (mode === 'forgot') {
        if (recoveryCooldown > 0) throw new Error(`Aguarde ${recoveryCooldown} segundos antes de solicitar outro link.`);
        const sent = await resetPassword(email.trim());
        setRecoveryCooldown(60);
        if (sent) setNotice({ type: 'success', text: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' });
        else setNotice({type:'error',text:'Não foi possível solicitar a recuperação agora.'});
      } else if (mode === 'new-password') {
        if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
        if (password !== confirmPassword) throw new Error('As senhas não coincidem.');
        if (await updatePassword(password)) {
          setNotice({ type: 'success', text: 'Senha atualizada com sucesso.' });
          window.setTimeout(() => navigate('/dashboard', { replace: true }), 700);
        } else setNotice({type:'error',text:'O link pode ter expirado. Solicite uma nova recuperação de senha.'});
      } else {
        if (!fullName.trim() || !email.trim()) throw new Error('Preencha nome e e-mail.');
        if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
        if (password !== confirmPassword) throw new Error('As senhas não coincidem.');
        if (!acceptTerms) throw new Error('Você precisa aceitar os Termos de Uso e a Política de Privacidade.');
        const result = await register(email.trim(), password, {
          username: slugify(stageName || fullName), name: fullName.trim(), stageName: (stageName || fullName).trim(),
          email: email.trim(), whatsapp: whatsapp.trim()
        });
        if (result.success) {
          if (result.needsEmailConfirmation) {
            setNotice({ type: 'success', text: 'Conta criada. Abra o link enviado ao seu e-mail para confirmar o cadastro.' });
            setPassword(''); setConfirmPassword('');
          } else navigate('/dashboard', { replace: true });
        } else setNotice({type:'error',text:'Não foi possível criar a conta. Verifique se o e-mail já está cadastrado.'});
      }
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' });
    } finally { setLoading(false); }
  };

  const resend = async () => {
    if (!email.trim()) { setNotice({type:'error',text:'Informe o e-mail da conta para reenviar a confirmação.'}); return; }
    setLoading(true); setNotice(null);
    const sent=await resendConfirmation(email.trim());
    setLoading(false);
    setNotice(sent?{type:'success',text:'Se a conta estiver aguardando confirmação, um novo link será enviado.'}:{type:'error',text:'Não foi possível reenviar agora. Aguarde alguns minutos.'});
  };

  if (authLoading) return <div className="min-h-screen bg-[#060B18] flex items-center justify-center"><LoaderCircle className="w-7 h-7 animate-spin text-amber-400" /></div>;

  return <div className="min-h-screen bg-[#060B18] text-white grid lg:grid-cols-2">
    <aside className="hidden lg:flex relative overflow-hidden bg-[#0A1128] border-r border-amber-500/20 p-14 flex-col justify-between">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(245,158,11,.18),transparent_42%)]" />
      <Link to="/" className="relative flex items-center gap-3"><img src="/logo.webp" className="w-12 h-12 object-contain" alt="Mercado do Compositor" /><span className="font-serif text-xl font-bold">Mercado do Compositor</span></Link>
      <div className="relative max-w-xl space-y-5"><span className="text-amber-400 text-xs font-bold uppercase tracking-[.2em] flex items-center gap-2"><Mic2 className="w-4 h-4" />Portal de autores</span><h2 className="font-serif text-5xl leading-tight">Seu catálogo protegido e pronto para encontrar a voz certa.</h2><p className="text-slate-300 leading-relaxed">Gerencie composições, propostas e autorizações em uma conta individual protegida pelo Supabase Auth.</p></div>
      <div className="relative flex items-center gap-3 text-sm text-slate-300"><ShieldCheck className="w-6 h-6 text-emerald-400" />Sessão persistente, confirmação de e-mail e recuperação segura de senha.</div>
    </aside>

    <main className="flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-between items-center"><Link to="/" className="text-xs text-slate-400 hover:text-white flex items-center gap-1"><ArrowLeft className="w-4 h-4" />Voltar</Link>{mode !== 'admin' && <button type="button" onClick={() => changeMode('admin')} className="text-xs text-slate-500 hover:text-amber-400">Área administrativa</button>}</div>
        <header><p className="text-xs uppercase tracking-[.2em] font-bold text-amber-400">Autenticação segura</p><h1 className="mt-2 text-3xl font-serif font-bold">{title}</h1><p className="mt-2 text-sm text-slate-400">{mode === 'register' ? 'Crie a conta primeiro; seu perfil completo poderá ser preenchido no painel.' : mode === 'forgot' ? 'Enviaremos um link seguro para o seu e-mail.' : mode === 'new-password' ? 'Escolha uma senha nova para sua conta.' : 'Use as credenciais cadastradas no Supabase.'}</p></header>

        {notice && <div role={notice.type === 'error' ? 'alert' : 'status'} className={`p-4 rounded-2xl border text-sm flex gap-3 ${notice.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>{notice.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}<span>{notice.text}</span></div>}

        {(mode === 'login' || mode === 'register') && <div className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-2xl"><button onClick={() => changeMode('login')} className={`py-2.5 rounded-xl text-xs font-bold ${mode === 'login' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>Entrar</button><button onClick={() => changeMode('register')} className={`py-2.5 rounded-xl text-xs font-bold ${mode === 'register' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>Criar conta</button></div>}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && <><Field icon={<User />} label="Nome completo" value={fullName} onChange={setFullName} autoComplete="name" /><Field icon={<Mic2 />} label="Nome artístico (opcional)" value={stageName} onChange={setStageName} autoComplete="nickname" /><Field icon={<User />} label="WhatsApp (opcional)" value={whatsapp} onChange={setWhatsapp} autoComplete="tel" /></>}
          {mode !== 'new-password' && <Field icon={<Mail />} label="E-mail" value={email} onChange={setEmail} type="email" autoComplete="email" />}
          {mode !== 'forgot' && <PasswordField label={mode === 'new-password' ? 'Nova senha' : 'Senha'} value={password} onChange={setPassword} visible={showPassword} setVisible={setShowPassword} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />}
          {(mode === 'register' || mode === 'new-password') && <PasswordField label="Confirmar senha" value={confirmPassword} onChange={setConfirmPassword} visible={showPassword} setVisible={setShowPassword} autoComplete="new-password" />}
          {mode === 'register' && <label className="flex gap-3 text-xs text-slate-400"><input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} className="mt-0.5" /><span>Li e aceito os <Link to="/termos" className="text-amber-400">Termos de Uso</Link> e a <Link to="/privacidade" className="text-amber-400">Política de Privacidade</Link>.</span></label>}
          <button disabled={loading || (mode === 'forgot' && recoveryCooldown > 0)} className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-sm flex justify-center items-center gap-2">{loading ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <>{mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : mode === 'forgot' ? (recoveryCooldown > 0 ? `Aguarde ${recoveryCooldown}s` : 'Enviar link') : mode === 'admin' ? 'Entrar como administrador' : 'Salvar nova senha'}<ArrowRight className="w-4 h-4" /></>}</button>
        </form>
        {mode === 'login' && <div className="flex justify-center gap-5 text-xs"><button onClick={() => changeMode('forgot')} className="text-amber-400 hover:text-amber-300">Esqueci minha senha</button><button onClick={resend} disabled={loading} className="text-slate-400 hover:text-white">Reenviar confirmação</button></div>}
        {(mode === 'forgot' || mode === 'new-password' || mode === 'admin') && <button onClick={() => changeMode('login')} className="w-full text-center text-xs text-slate-400 hover:text-white">Voltar para o login</button>}
      </div>
    </main>
  </div>;
};

const Field = ({icon,label,value,onChange,type='text',autoComplete}:{icon:React.ReactElement;label:string;value:string;onChange:(v:string)=>void;type?:string;autoComplete:string}) => <label className="block text-xs font-semibold text-slate-300">{label}<div className="relative mt-1.5">{React.cloneElement(icon,{className:'w-4 h-4 absolute left-3.5 top-3.5 text-slate-500'} as any)}<input required={label.includes('Nome completo')||type==='email'} type={type} value={value} onChange={e=>onChange(e.target.value)} autoComplete={autoComplete} className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-3 text-sm text-white focus:outline-none focus:border-amber-500" /></div></label>;
const PasswordField = ({label,value,onChange,visible,setVisible,autoComplete}:{label:string;value:string;onChange:(v:string)=>void;visible:boolean;setVisible:(v:boolean)=>void;autoComplete:string}) => <label className="block text-xs font-semibold text-slate-300">{label}<div className="relative mt-1.5"><Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" /><input required minLength={8} type={visible?'text':'password'} value={value} onChange={e=>onChange(e.target.value)} autoComplete={autoComplete} className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-11 py-3 text-sm text-white focus:outline-none focus:border-amber-500" /><button type="button" onClick={()=>setVisible(!visible)} aria-label={visible?'Ocultar senha':'Mostrar senha'} className="absolute right-3 top-3 text-slate-500">{visible?<EyeOff className="w-5 h-5"/>:<Eye className="w-5 h-5"/>}</button></div></label>;
