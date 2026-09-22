import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  loadSubscriptionPlans,
  loadTeamRoles,
  submitAccountDeletionRequest,
  loadAccountDeletionRequests,
  loadUserNotifications,
  createUserNotification
} from './database';
import type {
  SubscriptionPlanItem,
  AdminRoleType,
  DeletionRequestStatus,
  AccountDeletionRequest,
  UserNotification
} from '../types';

describe('CRUD de Entidades do Sistema: Planos de Assinatura', () => {
  it('fornece planos padrão com atributos comerciais válidos', async () => {
    const plans = await loadSubscriptionPlans();
    expect(plans.length).toBeGreaterThanOrEqual(2);

    const bronze = plans.find(p => p.name === 'Plano Bronze' || p.id === 'Plano Bronze');
    expect(bronze).toBeDefined();
    expect(bronze?.monthlyPrice).toBeGreaterThan(0);
    expect(bronze?.isActive).toBe(true);

    const ouro = plans.find(p => p.name === 'Plano Ouro' || p.id === 'Plano Ouro');
    expect(ouro).toBeDefined();
    expect(ouro?.maxSongs).toBeNull();
  }, 15000);

  it('valida regras de negócio para criação de novos planos', () => {
    const validatePlan = (plan: Partial<SubscriptionPlanItem>) => {
      const errors: string[] = [];
      if (!plan.name || !plan.name.trim()) errors.push('Nome é obrigatório');
      if (typeof plan.monthlyPrice !== 'number' || plan.monthlyPrice < 0) errors.push('Preço inválido');
      if (plan.maxSongs !== null && plan.maxSongs !== undefined && plan.maxSongs <= 0) {
        errors.push('Limite de músicas deve ser positivo ou nulo');
      }
      return errors;
    };

    expect(validatePlan({ name: '', monthlyPrice: -10 })).toContain('Nome é obrigatório');
    expect(validatePlan({ name: '', monthlyPrice: -10 })).toContain('Preço inválido');
    expect(validatePlan({ name: 'Plano Vip', monthlyPrice: 99.9, maxSongs: 0 })).toContain('Limite de músicas deve ser positivo ou nulo');
    expect(validatePlan({ name: 'Plano Vip', monthlyPrice: 99.9, maxSongs: 100 })).toHaveLength(0);
  });
});

describe('CRUD de Entidades do Sistema: Equipe e Funções Administrativas', () => {
  it('carrega a equipe real sem inventar membros', async () => {
    // `loadTeamRoles` não devolve mais um administrador fictício quando a
    // leitura falha: ou vem a equipe em vigor (possivelmente vazia), ou o erro
    // é propagado. Um membro inexistente na tela esconderia quebra de RLS.
    const team = await loadTeamRoles();
    expect(Array.isArray(team)).toBe(true);
    for (const member of team) {
      expect(['admin', 'moderator', 'financial', 'composer']).toContain(member.role);
      expect(member.userId).toBeTruthy();
    }
  });

  it('valida regras de concessão de papéis administrativos', () => {
    const allowedRoles: AdminRoleType[] = ['admin', 'moderator', 'financial'];

    expect(allowedRoles.includes('admin')).toBe(true);
    expect(allowedRoles.includes('moderator')).toBe(true);
    expect(allowedRoles.includes('financial')).toBe(true);
    // @ts-expect-error testando tipo inválido
    expect(allowedRoles.includes('superuser')).toBe(false);

    const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(validateEmail('colaborador@mercadodocompositor.com.br')).toBe(true);
    expect(validateEmail('email-invalido')).toBe(false);
  });
});

describe('CRUD de Entidades do Sistema: Solicitações de Exclusão LGPD', () => {
  // Um direito LGPD não pode ser dado como exercido sem ter sido gravado: se a
  // persistência falha, o erro precisa subir. Antes a função devolvia um recibo
  // fabricado com status "pendente", e o titular via uma confirmação falsa.
  it('propaga a falha em vez de fabricar uma solicitação não persistida', async () => {
    await expect(submitAccountDeletionRequest({
      userId: 'user-lgpd-test',
      userName: 'Compositor Teste LGPD',
      userEmail: 'lgpd@teste.com',
      reason: 'Desejo encerrar minhas atividades musicais'
    })).rejects.toThrow();
  });

  it('controla a máquina de estados de solicitações LGPD', () => {
    const transitions: Record<DeletionRequestStatus, DeletionRequestStatus[]> = {
      pendente: ['em_analise', 'rejeitada', 'concluida'],
      em_analise: ['concluida', 'rejeitada'],
      concluida: [],
      rejeitada: ['em_analise']
    };

    expect(transitions.pendente).toContain('em_analise');
    expect(transitions.em_analise).toContain('concluida');
    expect(transitions.concluida).toHaveLength(0); // Estado terminal
  });
});

describe('CRUD de Entidades do Sistema: Notificações Internas', () => {
  // Caixa vazia é estado legítimo. A função devolvia uma notificação
  // "Bem-vindo" sintética que não existia em user_notifications: marcá-la como
  // lida atualizava um id inexistente e o badge de não lidas voltava a cada
  // recarga da página.
  it('não inventa notificação quando não há nenhuma gravada', async () => {
    const notifs = await loadUserNotifications('user-notif-test');
    expect(notifs).toEqual([]);
  });

  it('calcula contador de não lidas e marcação como lida corretamente', () => {
    const list: UserNotification[] = [
      { id: '1', userId: 'u1', title: 'Nova Proposta', message: 'Intérprete enviou proposta', type: 'request', read: false, createdAt: new Date().toISOString() },
      { id: '2', userId: 'u1', title: 'Música Aprovada', message: 'Sua obra foi publicada', type: 'moderation', read: false, createdAt: new Date().toISOString() },
      { id: '3', userId: 'u1', title: 'Termo Emitido', message: 'Liberação gerada', type: 'release', read: true, createdAt: new Date().toISOString() }
    ];

    const unreadCount = list.filter(n => !n.read).length;
    expect(unreadCount).toBe(2);

    const markedList = list.map(n => n.id === '1' ? { ...n, read: true } : n);
    const updatedUnread = markedList.filter(n => !n.read).length;
    expect(updatedUnread).toBe(1);
  });
});
