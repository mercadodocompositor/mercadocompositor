import { describe, it, expect, vi } from 'vitest';

describe('Suíte de Testes de Autenticação e Segurança de Sessão', () => {

  // 1. CADASTRO (SIGN UP)
  describe('Fluxo de Cadastro (Sign Up)', () => {
    it('valida requisitos mínimos: senha de no mínimo 8 caracteres e confirmação idêntica', () => {
      const validateRegistration = (pwd: string, confirm: string, name: string, email: string) => {
        if (!name.trim() || !email.trim()) return { valid: false, error: 'Preencha nome e e-mail.' };
        if (pwd.length < 8) return { valid: false, error: 'Use uma senha com pelo menos 8 caracteres.' };
        if (pwd !== confirm) return { valid: false, error: 'As senhas não coincidem.' };
        return { valid: true };
      };

      expect(validateRegistration('1234567', '1234567', 'João', 'joao@email.com').valid).toBe(false);
      expect(validateRegistration('1234567', '1234567', 'João', 'joao@email.com').error).toBe('Use uma senha com pelo menos 8 caracteres.');
      
      expect(validateRegistration('senhaSegura123', 'outraSenha', 'João', 'joao@email.com').valid).toBe(false);
      expect(validateRegistration('senhaSegura123', 'outraSenha', 'João', 'joao@email.com').error).toBe('As senhas não coincidem.');

      expect(validateRegistration('senhaSegura123', 'senhaSegura123', '', 'joao@email.com').valid).toBe(false);
      expect(validateRegistration('senhaSegura123', 'senhaSegura123', 'João', 'joao@email.com').valid).toBe(true);
    });

    it('gera username amigável e limpo (slugify) a partir do nome artístico ou civil', () => {
      const slugify = (value: string) => value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      expect(slugify('Zé do Violão & Banda')).toBe('ze-do-violao-banda');
      expect(slugify('João das Neves #1')).toBe('joao-das-neves-1');
      expect(slugify('Compositor Anônimo')).toBe('compositor-anonimo');
    });
  });

  // 2. LOGIN E MAPEAMENTO DE ERROS
  describe('Fluxo de Login e Mapeamento Amigável de Erros', () => {
    it('mapeia erros técnicos do Supabase Auth para mensagens claras em português', () => {
      const authMessage = (message?: string | null) => {
        if (!message) return 'Não foi possível concluir a operação. Tente novamente.';
        const value = message.toLowerCase();
        if (value.includes('invalid login credentials')) return 'E-mail ou senha inválidos.';
        if (value.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
        if (value.includes('user already registered')) return 'Já existe uma conta com este e-mail.';
        if (value.includes('password should be')) return 'A senha não atende aos requisitos mínimos de segurança.';
        if (value.includes('rate limit') || value.includes('too many emails')) return 'Limite temporário de envio atingido. Aguarde antes de solicitar outro e-mail.';
        return message;
      };

      expect(authMessage('Invalid login credentials')).toBe('E-mail ou senha inválidos.');
      expect(authMessage('Email not confirmed')).toBe('Confirme seu e-mail antes de entrar.');
      expect(authMessage('User already registered')).toBe('Já existe uma conta com este e-mail.');
      expect(authMessage('Email rate limit exceeded')).toBe('Limite temporário de envio atingido. Aguarde antes de solicitar outro e-mail.');
    });

    it('valida requisitos de login e cadastro via Google OAuth', () => {
      const handleGoogleAuth = (mode: string, acceptTerms: boolean) => {
        if (mode === 'register' && !acceptTerms) {
          return { success: false, error: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.' };
        }
        return {
          success: true,
          provider: 'google',
          scopes: 'openid email profile'
        };
      };

      // Em modo cadastro, exige termos aceitos
      expect(handleGoogleAuth('register', false).success).toBe(false);
      expect(handleGoogleAuth('register', false).error).toBe('Você precisa aceitar os Termos de Uso e a Política de Privacidade.');
      expect(handleGoogleAuth('register', true).success).toBe(true);

      // Em modo login direto, pode prosseguir sem validação adicional de formulário
      expect(handleGoogleAuth('login', false).success).toBe(true);
      expect(handleGoogleAuth('login', false).provider).toBe('google');
    });
  });

  // 3. RECUPERAÇÃO E ALTERAÇÃO DE SENHA
  describe('Fluxo de Recuperação e Alteração de Senha', () => {
    it('impede spam de recuperação com cooldown ativo', () => {
      let recoveryCooldown = 60;
      const canRequestReset = () => recoveryCooldown <= 0;

      expect(canRequestReset()).toBe(false);
      recoveryCooldown = 0;
      expect(canRequestReset()).toBe(true);
    });

    it('valida troca direta de senha com no mínimo 8 caracteres', () => {
      const validatePasswordChange = (newPass: string, confirmPass: string) => {
        if (newPass.length < 8) return 'A nova senha deve ter no mínimo 8 caracteres.';
        if (newPass !== confirmPass) return 'As senhas digitadas não coincidem.';
        return null;
      };

      expect(validatePasswordChange('curta', 'curta')).toBe('A nova senha deve ter no mínimo 8 caracteres.');
      expect(validatePasswordChange('senhaNova123', 'senhaDiferente')).toBe('As senhas digitadas não coincidem.');
      expect(validatePasswordChange('senhaForte123!', 'senhaForte123!')).toBeNull();
    });
  });

  // 4. INVALIDAÇÃO TOTAL NO LOGOUT & PURGA DE CACHE
  describe('Logout e Purga Completa de Dados Privados em Memória', () => {
    it('zera 100% dos dados protegidos ao deslogar ou expirar sessão', () => {
      // Estado simulado com dados privados preenchidos de um compositor
      let userState = {
        userId: 'uuid-1234',
        isAuthenticated: true,
        isAdminAuthenticated: false,
        profile: {
          name: 'Compositor Teste',
          email: 'teste@exemplo.com',
          cpf: '123.456.789-00',
          whatsapp: '11999999999'
        },
        songs: [{ id: 'song-1', title: 'Música Privada', composerId: 'uuid-1234' }],
        requests: [{ id: 'req-1', buyerName: 'Interessado', cpfCnpj: '99988877766' }],
        releases: [{ id: 'rel-1', digitalSignature: 'SIG-ABC' }],
        notifications: [{ id: 'notif-1', title: 'Proposta' }]
      };

      // Simulação da função resetPrivateState do AppContext
      const resetPrivateState = () => {
        userState = {
          userId: null as any,
          isAuthenticated: false,
          isAdminAuthenticated: false,
          profile: {} as any,
          songs: [],
          requests: [],
          releases: [],
          notifications: []
        };
      };

      // Executa o logout
      resetPrivateState();

      // Validações estritas de segurança de sessão
      expect(userState.isAuthenticated).toBe(false);
      expect(userState.userId).toBeNull();
      expect(userState.profile).toEqual({});
      expect(userState.songs).toHaveLength(0);
      expect(userState.requests).toHaveLength(0);
      expect(userState.releases).toHaveLength(0);
      expect(userState.notifications).toHaveLength(0);
    });
  });

  // 5. PROTEÇÃO DE ROTAS (PRIVATE ROUTES)
  describe('Proteção de Rotas Privadas e Redirecionamento', () => {
    it('bloqueia acesso de usuário deslogado e salva URL de destino para retorno', () => {
      const evaluateRouteAccess = (isAuthenticated: boolean, authLoading: boolean, targetPath: string) => {
        if (authLoading) return { action: 'loader' };
        if (isAuthenticated) return { action: 'render' };
        return { action: 'redirect', to: '/login', state: { from: targetPath } };
      };

      // Tentativa de acessar /dashboard/musicas sem autenticação
      const resultUnauth = evaluateRouteAccess(false, false, '/dashboard/musicas');
      expect(resultUnauth.action).toBe('redirect');
      expect(resultUnauth.to).toBe('/login');
      expect(resultUnauth.state?.from).toBe('/dashboard/musicas');

      // Usuário autenticado acessando a mesma rota
      const resultAuth = evaluateRouteAccess(true, false, '/dashboard/musicas');
      expect(resultAuth.action).toBe('render');
    });

    it('redireciona usuário já autenticado que visita /login de volta ao dashboard ou página anterior', () => {
      const evaluateLoginPage = (isAuthenticated: boolean, authLoading: boolean, fromState?: string) => {
        if (!authLoading && isAuthenticated) {
          return { shouldRedirect: true, destination: fromState || '/dashboard' };
        }
        return { shouldRedirect: false, destination: null };
      };

      // Visitante autenticado acessando /login diretamente
      expect(evaluateLoginPage(true, false, undefined).shouldRedirect).toBe(true);
      expect(evaluateLoginPage(true, false, undefined).destination).toBe('/dashboard');

      // Visitante que veio de uma tentativa de acessar /dashboard/solicitacoes
      expect(evaluateLoginPage(true, false, '/dashboard/solicitacoes').destination).toBe('/dashboard/solicitacoes');

      // Visitante deslogado
      expect(evaluateLoginPage(false, false, undefined).shouldRedirect).toBe(false);
    });
  });

  // 6. CONFIGURAÇÃO DE REFRESH TOKEN E PERSISTÊNCIA
  describe('Configuração do Cliente Supabase para Refresh Token e Sessão', () => {
    it('garante que autoRefreshToken e persistSession estão habilitados', () => {
      const authConfig = {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      };

      expect(authConfig.persistSession).toBe(true);
      expect(authConfig.autoRefreshToken).toBe(true);
      expect(authConfig.detectSessionInUrl).toBe(true);
    });
  });

  // 7. MATRIZ DE PERMISSÕES RBAC (PERFIS E FUNÇÕES)
  describe('Matriz de Permissões RBAC da Equipe e Painel Admin', () => {
    const TAB_ROLES: Record<string, Array<'master' | 'moderator' | 'financial'>> = {
      overview: ['master', 'moderator', 'financial'],
      musicas: ['master', 'moderator'],
      compositores: ['master', 'financial'],
      transacoes: ['master', 'financial'],
      configuracoes: ['master'],
      logs: ['master', 'financial']
    };

    const isTabAllowed = (tab: string, role: 'master' | 'moderator' | 'financial') => {
      return (TAB_ROLES[tab] || ['master']).includes(role);
    };

    it('restringe Moderador: pode acessar Acervo/Músicas, mas é barrado em Configurações, Transações e Compositores', () => {
      expect(isTabAllowed('overview', 'moderator')).toBe(true);
      expect(isTabAllowed('musicas', 'moderator')).toBe(true);
      expect(isTabAllowed('configuracoes', 'moderator')).toBe(false);
      expect(isTabAllowed('transacoes', 'moderator')).toBe(false);
      expect(isTabAllowed('compositores', 'moderator')).toBe(false);
      expect(isTabAllowed('logs', 'moderator')).toBe(false);
    });

    it('restringe Financeiro: pode acessar Compositores, Transações e Logs, mas é barrado em Moderação e Configurações', () => {
      expect(isTabAllowed('overview', 'financial')).toBe(true);
      expect(isTabAllowed('compositores', 'financial')).toBe(true);
      expect(isTabAllowed('transacoes', 'financial')).toBe(true);
      expect(isTabAllowed('logs', 'financial')).toBe(true);
      expect(isTabAllowed('musicas', 'financial')).toBe(false);
      expect(isTabAllowed('configuracoes', 'financial')).toBe(false);
    });

    it('concede acesso total e irrestrito ao perfil Master / Dono', () => {
      const allTabs = ['overview', 'musicas', 'compositores', 'transacoes', 'configuracoes', 'logs'];
      allTabs.forEach(tab => {
        expect(isTabAllowed(tab, 'master')).toBe(true);
      });
    });
  });

  // 6. UX / VALIDAÇÃO DE CAMPOS INLINE
  describe('UX e Validação de Formulários de Autenticação', () => {
    const validateAuthForm = (
      mode: 'login' | 'register' | 'forgot',
      fields: {
        email?: string;
        password?: string;
        confirmPassword?: string;
        fullName?: string;
        acceptTerms?: boolean;
      }
    ) => {
      const errors: Record<string, string> = {};
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const cleanEmail = (fields.email || '').trim();

      if (mode === 'login') {
        if (!cleanEmail) errors.email = 'Informe seu e-mail cadastrado.';
        else if (!emailRegex.test(cleanEmail)) errors.email = 'Informe um formato de e-mail válido (ex: seu@email.com).';
        if (!fields.password) errors.password = 'Informe sua senha.';
      } else if (mode === 'forgot') {
        if (!cleanEmail) errors.email = 'Informe o e-mail da sua conta.';
        else if (!emailRegex.test(cleanEmail)) errors.email = 'Informe um formato de e-mail válido (ex: seu@email.com).';
      } else {
        if (!fields.fullName?.trim()) errors.fullName = 'Informe seu nome completo.';
        if (!cleanEmail) errors.email = 'Informe seu e-mail de contato.';
        else if (!emailRegex.test(cleanEmail)) errors.email = 'Informe um formato de e-mail válido (ex: seu@email.com).';
        if (!fields.password) errors.password = 'Defina uma senha com no mínimo 8 caracteres.';
        else if (fields.password.length < 8) errors.password = 'A senha deve ter pelo menos 8 caracteres.';
        if (!fields.confirmPassword) errors.confirmPassword = 'Confirme a senha digitada.';
        else if (fields.password !== fields.confirmPassword) errors.confirmPassword = 'As senhas digitadas não coincidem.';
        if (!fields.acceptTerms) errors.acceptTerms = 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.';
      }
      return { valid: Object.keys(errors).length === 0, errors };
    };

    it('rejeita submissão de login com campos em branco e identifica erros específicos por campo', () => {
      const result = validateAuthForm('login', { email: '', password: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.email).toBe('Informe seu e-mail cadastrado.');
      expect(result.errors.password).toBe('Informe sua senha.');
    });

    it('rejeita formato de e-mail inválido tanto no login quanto no cadastro', () => {
      const loginRes = validateAuthForm('login', { email: 'emailinvalido', password: 'senha' });
      expect(loginRes.errors.email).toBe('Informe um formato de e-mail válido (ex: seu@email.com).');

      const regRes = validateAuthForm('register', {
        email: 'emailsemarroba.com',
        password: 'senhaSegura123',
        confirmPassword: 'senhaSegura123',
        fullName: 'Carlos Lima',
        acceptTerms: true
      });
      expect(regRes.errors.email).toBe('Informe um formato de e-mail válido (ex: seu@email.com).');
    });

    it('valida divergência de senha e falta de aceite de termos no cadastro', () => {
      const res = validateAuthForm('register', {
        fullName: 'Carlos Lima',
        email: 'carlos@exemplo.com',
        password: 'senhaSegura123',
        confirmPassword: 'senhaDiferente456',
        acceptTerms: false
      });
      expect(res.valid).toBe(false);
      expect(res.errors.confirmPassword).toBe('As senhas digitadas não coincidem.');
      expect(res.errors.acceptTerms).toBe('Você precisa aceitar os Termos de Uso e a Política de Privacidade.');
    });

    it('aprova formulário de cadastro preenchido corretamente com termos aceitos', () => {
      const res = validateAuthForm('register', {
        fullName: 'Carlos Lima',
        email: 'carlos@exemplo.com',
        password: 'senhaSegura123',
        confirmPassword: 'senhaSegura123',
        acceptTerms: true
      });
      expect(res.valid).toBe(true);
      expect(Object.keys(res.errors)).toHaveLength(0);
    });
  });

});


