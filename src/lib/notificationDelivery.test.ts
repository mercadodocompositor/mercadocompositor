import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/notification_delivery_2026_09_22.sql', 'utf8');
const worker = readFileSync('supabase/functions/process-notification-emails/index.ts', 'utf8');
const settings = readFileSync('src/pages/dashboard/SettingsTab.tsx', 'utf8');
const context = readFileSync('src/context/AppContext.tsx', 'utf8');
const essentials = readFileSync('supabase/essential_notifications_2026_09_22.sql', 'utf8');
const webhook = readFileSync('supabase/functions/mercadopago-webhook/index.ts', 'utf8');
const followUp = readFileSync('supabase/buyer_copy_and_payment_failure_2026_09_22.sql', 'utf8');

describe('entrega de notificações de ponta a ponta', () => {
  it('enfileira e-mails respeitando a preferência de novas propostas', () => {
    expect(migration).toContain('queue_notification_email');
    expect(migration).toContain("prefs->>'emailNewRequest'");
    expect(migration).toContain('on conflict(notification_id) do nothing');
  });

  it('possui claim concorrente, retentativas e limite de falhas', () => {
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("attempts<5");
    expect(worker).toContain("status:terminal?'failed':'retry'");
    expect(worker).toContain("fetch('https://api.resend.com/emails'");
  });

  it('atualiza a central em tempo real e não oferece WhatsApp nas preferências', () => {
    expect(context).toContain("event: 'INSERT', schema: 'public', table: 'user_notifications'");
    expect(settings).not.toContain('whatsappNewRequest');
    expect(settings).not.toContain('Aviso instantâneo no WhatsApp');
  });

  it('envia as comunicações essenciais de pagamento e documento', () => {
    // Quitação: aviso ao confirmar o recebimento, fora do filtro opcional de propostas.
    expect(essentials).toContain("when (new.status = 'pagamento_confirmado' and old.status is distinct from 'pagamento_confirmado')");
    const quitacao = essentials.split('function public.notify_request_payment_confirmed()')[1]?.split('$$;')[0] || '';
    expect(quitacao).toContain("'system'");
    expect(quitacao).not.toContain("'request'");
    // Termo: o e-mail leva à página pública com a cópia em PDF.
    expect(essentials).toContain("'/validar/' || new.document_code");
    expect(worker).toContain("startsWith('/validar/')");
    // Faturas: renovação paga não chega como ativação.
    expect(essentials).toContain("then 'Pagamento confirmado' else 'Assinatura ativada'");
  });

  it('não duplica o aviso de renovação automática em reentregas do webhook', () => {
    expect(webhook).toContain("sub.mp_preapproval_id === pre.id && sub.mp_preapproval_status === 'authorized'");
    expect(webhook).toContain("if (!alreadyNotified) await admin.from('user_notifications').insert(");
  });

  it('envia ao intérprete a cópia do termo uma única vez', () => {
    expect(followUp).toContain('alter column notification_id drop not null');
    expect(followUp).toContain("check (notification_id is not null or release_id is not null)");
    expect(followUp).toMatch(/'buyer',\s+new\.id/);
    expect(followUp).toContain('on conflict (release_id) do nothing');
    expect(worker).toContain("job.audience === 'buyer'");
  });

  it('avisa a cobrança recusada sem repetir a cada tentativa', () => {
    expect(followUp).toContain("if p_status = 'rejected' and v_previous_status is distinct from 'rejected'");
    expect(followUp).toContain("created_at > now() - interval '20 hours'");
    expect(followUp).toContain("v_already_approved := v_previous_status = 'approved';");
  });
});
