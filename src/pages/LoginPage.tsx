import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, Lock, Mail, Mic2, ShieldCheck, Sparkles, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GOOGLE_AUTH_ENABLED } from '../config/appConfig';
import { authErrorMessage } from '../lib/apiErrors';
import { formatMoneyBR, matchPlanParam } from '../lib/plans';
import { RESERVED_USERNAMES } from '../lib/database';

type AuthMode = 'login' | 'register' | 'forgot' | 'new-password' | 'admin';
type Notice = { type: 'success' | 'error'; text: string } | null;

const validModes: AuthMode[] = ['login', 'register', 'forgot', 'new-password', 'admin'];
const authMessage = authErrorMessage;

const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const LoginPage: React.FC = () => {
  const { login, loginWithGoogle, register, resetPassword, resendConfirmation, updatePassword, adminLogin, authError, isAuthenticated, authLoading, subscriptionPlans } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get('modo') as string | null;
  const mode: AuthMode = requestedMode === 'cadastro' || requestedMode === 'register'
    ? 'register'
    : requestedMode && validModes.includes(requestedMode as AuthMode)
      ? requestedMode as AuthMode
      : location.pathname === '/cadastro'
        ? 'register'
        : location.pathname === '/recuperar-senha'
          ? 'forgot'
          : 'login';

  const rawPlanParam = searchParams.get('plano') || searchParams.get('plan');
  // Resolve contra subscription_plans: o preço exibido aqui tem de ser o mesmo
  // que o checkout vai cobrar.
  const matchedPlan = useMemo(
    () => matchPlanParam(subscriptionPlans, rawPlanParam),
    [rawPlanParam, subscriptionPlans]
  );
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [recoveryCooldown, setRecoveryCooldown] = useState(0);
  const destination = (location.state as { from?: string } | null)?.from || '/dashboard';

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (notice?.type === 'error') {
      setNotice(null);
    }
  };

  const title = useMemo(() => ({
    login: 'Acesse sua conta', register: 'Crie sua conta de compositor', forgot: 'Recupere sua senha',
    'new-password': 'Defina uma nova senha', admin: 'Acesso administrativo'
  }[mode]), [mode]);

  useEffect(() => {
    const callbackError = searchParams.get('error_description');
    if (callbackError) setNotice({ type: 'error', text: authErrorMessage(decodeURIComponent(callbackError.replace(/\+/g, ' '))) });
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
    setNotice(null);
    setFieldErrors({});
    setPassword('');
    setConfirmPassword('');
    if (next === 'login') {
      if (location.pathname === '/cadastro') {
        navigate('/login', { replace: true });
        return;
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('modo');
      setSearchParams(nextParams);
      return;
    }
    if (next === 'register') {
      const planParam = searchParams.get('plano') || searchParams.get('plan');
      navigate(planParam ? `/cadastro?plano=${encodeURIComponent(planParam)}` : '/cadastro', { replace: true });
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('modo', next);
    setSearchParams(nextParams);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const errors: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = email.trim();

    if (mode === 'login' || mode === 'admin') {
      if (!cleanEmail) {
        errors.email = 'Informe seu e-mail cadastrado.';
      } else if (!emailRegex.test(cleanEmail)) {
        errors.email = 'Informe um formato de e-mail válido (ex: seu@email.com).';
      }
      if (!password) {
        errors.password = 'Informe sua senha.';
      }
    } else if (mode === 'forgot') {
      if (!cleanEmail) {
        errors.email = 'Informe o e-mail da sua conta.';
      } else if (!emailRegex.test(cleanEmail)) {
        errors.email = 'Informe um formato de e-mail válido (ex: seu@email.com).';
      }
    } else if (mode === 'new-password') {
      if (!password) {
        errors.password = 'Informe sua nova senha.';
      } else if (password.length < 8) {
        errors.password = 'A nova senha deve ter no mínimo 8 caracteres.';
      }
      if (!confirmPassword) {
        errors.confirmPassword = 'Confirme sua nova senha.';
      } else if (password !== confirmPassword) {
        errors.confirmPassword = 'As senhas digitadas não coincidem.';
      }
    } else {
      // register
      if (!fullName.trim()) {
        errors.fullName = 'Informe seu nome completo.';
      }
      if (!cleanEmail) {
        errors.email = 'Informe seu e-mail de contato.';
      } else if (!emailRegex.test(cleanEmail)) {
        errors.email = 'Informe um formato de e-mail válido (ex: seu@email.com).';
      }
      if (!password) {
        errors.password = 'Defina uma senha com no mínimo 8 caracteres.';
      } else if (password.length < 8) {
        errors.password = 'A senha deve ter pelo menos 8 caracteres.';
      }
      if (!confirmPassword) {
        errors.confirmPassword = 'Confirme a senha digitada.';
      } else if (password !== confirmPassword) {
        errors.confirmPassword = 'As senhas digitadas não coincidem.';
      }
      if (!acceptTerms) {
        errors.acceptTerms = 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setNotice({ type: 'error', text: Object.values(errors)[0] });
      return;
    }

    setFieldErrors({});
    setNotice(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        if (await login(cleanEmail, password)) navigate(destination, { replace: true });
        else setNotice({type:'error',text:'Não foi possível entrar. Verifique suas credenciais e a confirmação do e-mail.'});
      } else if (mode === 'admin') {
        if (await adminLogin(cleanEmail, password)) navigate('/admin', { replace: true });
        else setNotice({type:'error',text:'Credenciais inválidas ou conta sem função administrativa.'});
      } else if (mode === 'forgot') {
        if (recoveryCooldown > 0) throw new Error(`Aguarde ${recoveryCooldown} segundos antes de solicitar outro link.`);
        const sent = await resetPassword(cleanEmail);
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
        if (!fullName.trim() || !cleanEmail) throw new Error('Preencha nome e e-mail.');
        if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
        if (password !== confirmPassword) throw new Error('As senhas não coincidem.');
        if (!acceptTerms) throw new Error('Você precisa aceitar os Termos de Uso e a Política de Privacidade.');
        // Um nome como "Admin" gerava o slug `admin`, reservado às rotas da
        // plataforma: nesse caso deixamos a trigger do banco atribuir um
        // username neutro em vez de sequestrar /compositor/admin.
        const desiredUsername = slugify(stageName || fullName);
        const safeUsername = RESERVED_USERNAMES.includes(desiredUsername) ? '' : desiredUsername;
        const result = await register(cleanEmail, password, {
          username: safeUsername, name: fullName.trim(), stageName: (stageName || fullName).trim(),
          email: cleanEmail, whatsapp: whatsapp.trim()
        }, matchedPlan?.name);
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
    if (loading) return;
    if (!email.trim()) { setNotice({type:'error',text:'Informe o e-mail da conta para reenviar a confirmação.'}); return; }
    setLoading(true); setNotice(null);
    const sent=await resendConfirmation(email.trim());
    setLoading(false);
    setNotice(sent?{type:'success',text:'Se a conta estiver aguardando confirmação, um novo link será enviado.'}:{type:'error',text:'Não foi possível reenviar agora. Aguarde alguns minutos.'});
  };

  const googleLogin = async () => {
    if (loading) return;
    if (mode === 'register' && !acceptTerms) {
      setFieldErrors({ acceptTerms: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.' });
      setNotice({ type: 'error', text: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.' });
      return;
    }
    setLoading(true); setNotice(null);
    const started = await loginWithGoogle();
    if (!started) {
      setLoading(false);
      setNotice({ type: 'error', text: 'Não foi possível iniciar o acesso com Google.' });
    }
  };

  if (authLoading) return <div className="min-h-screen bg-[#060B18] flex items-center justify-center"><LoaderCircle className="w-7 h-7 animate-spin text-amber-400" /></div>;

  return <div className="min-h-screen bg-[#060B18] text-white grid lg:grid-cols-2">
    <aside className="hidden lg:flex relative overflow-hidden bg-[#0A1128] border-r border-amber-500/20 p-14 flex-col justify-between">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(245,158,11,.18),transparent_42%)]" />
      <Link to="/" className="relative flex items-center gap-3"><img src="/logo.webp" className="w-12 h-12 object-contain" alt="Mercado do Compositor" /><span className="font-serif text-xl font-bold">Mercado do Compositor</span></Link>
      <div className="relative max-w-xl space-y-5"><span className="text-amber-400 text-xs font-bold uppercase tracking-[.2em] flex items-center gap-2"><Mic2 className="w-4 h-4" />Portal de autores</span><h2 className="font-serif text-5xl leading-tight">Seu catálogo protegido e pronto para encontrar a voz certa.</h2><p className="text-slate-300 leading-relaxed">Gerencie composições, propostas e autorizações em uma conta individual com autenticação criptografada e proteção avançada de dados.</p></div>
      <div className="relative flex items-center gap-3 text-sm text-slate-300"><ShieldCheck className="w-6 h-6 text-emerald-400" />Sessão persistente, confirmação de e-mail e recuperação segura de senha.</div>
    </aside>

    <main className="flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-between items-center"><Link to="/" className="text-xs text-slate-400 hover:text-white flex items-center gap-1"><ArrowLeft className="w-4 h-4" />Voltar</Link>{mode !== 'admin' && <button type="button" onClick={() => changeMode('admin')} className="text-xs text-slate-500 hover:text-amber-400">Área administrativa</button>}</div>

        <header>
          <p className="text-xs uppercase tracking-[.2em] font-bold text-amber-400">Autenticação segura</p>
          <h1 className="mt-2 text-3xl font-serif font-bold">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {mode === 'register'
              ? 'Crie sua conta e experimente seu plano por 7 dias grátis. A cobrança começa somente após o período de teste.'
              : mode === 'forgot'
                ? 'Enviaremos um link seguro para o seu e-mail.'
                : mode === 'new-password'
                  ? 'Escolha uma senha nova para sua conta.'
                  : mode === 'admin'
                    ? 'Informe as credenciais de acesso administrativo.'
                    : 'Informe seu e-mail e senha cadastrados no Mercado do Compositor.'}
          </p>
          {mode === 'register' && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Sem taxa de adesão • Pagamentos 100% diretos ao autor • Proteção autoral</span>
            </div>
          )}

          {mode === 'register' && matchedPlan && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200 shadow-sm animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Plano Selecionado</div>
                  <div className="font-bold text-white text-xs sm:text-sm">
                    {matchedPlan.name} <span className="text-amber-300 font-normal">• 7 dias grátis, depois R$ {formatMoneyBR(matchedPlan.monthlyPrice)}/mês</span>
                  </div>
                </div>
              </div>
              <Link to="/#planos" className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-2 transition shrink-0 ml-2">
                Trocar plano
              </Link>
            </div>
          )}
        </header>

        {notice && <div role={notice.type === 'error' ? 'alert' : 'status'} className={`p-4 rounded-2xl border text-sm flex gap-3 ${notice.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>{notice.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}<span>{notice.text}</span></div>}

        {(mode === 'login' || mode === 'register') && <div className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-2xl"><button onClick={() => changeMode('login')} className={`py-2.5 rounded-xl text-xs font-bold ${mode === 'login' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>Entrar</button><button onClick={() => changeMode('register')} className={`py-2.5 rounded-xl text-xs font-bold ${mode === 'register' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>Criar conta</button></div>}

        {GOOGLE_AUTH_ENABLED && (mode === 'login' || mode === 'register') && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={googleLogin}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60 text-slate-900 font-semibold text-sm flex items-center justify-center gap-3 transition shadow-sm border border-slate-200 cursor-pointer"
            >
              {loading ? (
                <LoaderCircle className="w-5 h-5 animate-spin text-slate-700" />
              ) : (
                <GoogleIcon />
              )}
              <span>{mode === 'login' ? 'Entrar com o Google' : 'Cadastrar com o Google'}</span>
            </button>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-500">
              <span className="h-px flex-1 bg-slate-800" />
              <span>ou use seu e-mail</span>
              <span className="h-px flex-1 bg-slate-800" />
            </div>
          </div>
        )}

        <form onSubmit={submit} noValidate className="space-y-4">
          {mode === 'register' && (
            <>
              <Field
                icon={<User />}
                label="Nome completo"
                value={fullName}
                onChange={v => { setFullName(v); clearFieldError('fullName'); }}
                autoComplete="name"
                error={fieldErrors.fullName}
                required
              />
              <Field
                icon={<Mic2 />}
                label="Nome artístico (opcional)"
                value={stageName}
                onChange={v => { setStageName(v); clearFieldError('stageName'); }}
                autoComplete="nickname"
                error={fieldErrors.stageName}
              />
              <Field
                icon={<User />}
                label="WhatsApp (opcional)"
                value={whatsapp}
                onChange={v => { setWhatsapp(v); clearFieldError('whatsapp'); }}
                autoComplete="tel"
                error={fieldErrors.whatsapp}
              />
            </>
          )}
          {mode !== 'new-password' && (
            <Field
              icon={<Mail />}
              label="E-mail"
              value={email}
              onChange={v => { setEmail(v); clearFieldError('email'); }}
              type="email"
              autoComplete="email"
              error={fieldErrors.email}
              required
            />
          )}
          {mode !== 'forgot' && (
            <PasswordField
              label={mode === 'new-password' ? 'Nova senha' : 'Senha'}
              value={password}
              onChange={v => { setPassword(v); clearFieldError('password'); }}
              visible={showPassword}
              setVisible={setShowPassword}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              error={fieldErrors.password}
              required
            />
          )}
          {(mode === 'register' || mode === 'new-password') && (
            <PasswordField
              label="Confirmar senha"
              value={confirmPassword}
              onChange={v => { setConfirmPassword(v); clearFieldError('confirmPassword'); }}
              visible={showPassword}
              setVisible={setShowPassword}
              autoComplete="new-password"
              error={fieldErrors.confirmPassword}
              required
            />
          )}
          {mode === 'register' && (
            <div>
              <label className="flex items-start gap-3 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={event => {
                    setAcceptTerms(event.target.checked);
                    clearFieldError('acceptTerms');
                  }}
                  aria-invalid={!!fieldErrors.acceptTerms}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span>
                  Li e aceito os <Link to="/termos" className="text-amber-400 hover:underline">Termos de Uso</Link> e a <Link to="/privacidade" className="text-amber-400 hover:underline">Política de Privacidade</Link>.
                </span>
              </label>
              {fieldErrors.acceptTerms && (
                <p role="alert" className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{fieldErrors.acceptTerms}</span>
                </p>
              )}
            </div>
          )}
          <button disabled={loading || (mode === 'forgot' && recoveryCooldown > 0)} className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-sm flex justify-center items-center gap-2 transition cursor-pointer">{loading ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <>{mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : mode === 'forgot' ? (recoveryCooldown > 0 ? `Aguarde ${recoveryCooldown}s` : 'Enviar link') : mode === 'admin' ? 'Entrar como administrador' : 'Salvar nova senha'}<ArrowRight className="w-4 h-4" /></>}</button>
        </form>
        {mode === 'login' && <div className="flex justify-center gap-5 text-xs"><button onClick={() => changeMode('forgot')} className="text-amber-400 hover:text-amber-300">Esqueci minha senha</button><button onClick={resend} disabled={loading} className="text-slate-400 hover:text-white">Reenviar confirmação</button></div>}
        {(mode === 'forgot' || mode === 'new-password' || mode === 'admin') && <button onClick={() => changeMode('login')} className="w-full text-center text-xs text-slate-400 hover:text-white">Voltar para o login</button>}
      </div>
    </main>
  </div>;
};

interface FieldProps {
  icon: React.ReactElement;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete: string;
  error?: string;
  required?: boolean;
}

const Field: React.FC<FieldProps> = ({ icon, label, value, onChange, type = 'text', autoComplete, error, required }) => (
  <div className="block text-xs font-semibold text-slate-300">
    <label htmlFor={`field-${autoComplete}`} className="flex items-center justify-between">
      <span>{label}{required && <span className="text-amber-400 ml-0.5">*</span>}</span>
    </label>
    <div className="relative mt-1.5">
      {React.cloneElement(icon, {
        className: `w-4 h-4 absolute left-3.5 top-3.5 transition-colors ${error ? 'text-red-400' : 'text-slate-500'}`
      } as any)}
      <input
        id={`field-${autoComplete}`}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `err-${autoComplete}` : undefined}
        className={`w-full bg-slate-900 border rounded-xl pl-10 pr-3.5 py-3 text-sm text-white focus:outline-none transition ${
          error
            ? 'border-red-500 focus:border-red-400 bg-red-500/5 ring-1 ring-red-500/30'
            : 'border-slate-800 focus:border-amber-500'
        }`}
      />
    </div>
    {error && (
      <p id={`err-${autoComplete}`} role="alert" className="mt-1.5 text-xs text-red-400 flex items-center gap-1 animate-fadeIn">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{error}</span>
      </p>
    )}
  </div>
);

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  setVisible: (v: boolean) => void;
  autoComplete: string;
  error?: string;
  required?: boolean;
}

const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  value,
  onChange,
  visible,
  setVisible,
  autoComplete,
  error,
  required
}) => (
  <div className="block text-xs font-semibold text-slate-300">
    <label htmlFor={`field-${autoComplete}`} className="flex items-center justify-between">
      <span>{label}{required && <span className="text-amber-400 ml-0.5">*</span>}</span>
    </label>
    <div className="relative mt-1.5">
      <Lock className={`w-4 h-4 absolute left-3.5 top-3.5 transition-colors ${error ? 'text-red-400' : 'text-slate-500'}`} />
      <input
        id={`field-${autoComplete}`}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `err-${autoComplete}` : undefined}
        className={`w-full bg-slate-900 border rounded-xl pl-10 pr-11 py-3 text-sm text-white focus:outline-none transition ${
          error
            ? 'border-red-500 focus:border-red-400 bg-red-500/5 ring-1 ring-red-500/30'
            : 'border-slate-800 focus:border-amber-500'
        }`}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition"
      >
        {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
    {error && (
      <p id={`err-${autoComplete}`} role="alert" className="mt-1.5 text-xs text-red-400 flex items-center gap-1 animate-fadeIn">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{error}</span>
      </p>
    )}
  </div>
);

const GoogleIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.01v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.91A6.02 6.02 0 0 1 6.08 12c0-.66.11-1.3.31-1.91V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.62C7.18 7.72 9.39 5.96 12 5.96Z"/></svg>;
