import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(path.resolve('supabase/release_delivery_2026_09_24.sql'), 'utf8');
const edge = fs.readFileSync(path.resolve('supabase/functions/release-delivery/index.ts'), 'utf8');

describe('entrega da obra ao cliente', () => {
  it('guarda só o hash do token e dá 30 dias de validade', () => {
    expect(sql).toMatch(/token_hash text not null unique/);
    expect(sql).toMatch(/encode\(sha256\(convert_to\(v_token, 'UTF8'\)\), 'hex'\)/);
    expect(sql).toMatch(/interval '30 days'/);
    expect(edge).toContain("crypto.subtle.digest('SHA-256'");
  });

  it('exige a faixa completa antes de emitir o termo', () => {
    expect(sql).toMatch(/before insert on public\.releases[\s\S]+require_release_full_audio/);
  });

  it('manda o link de entrega no e-mail do termo e limita reenvios', () => {
    expect(sql).toMatch(/'\/entrega\/' \|\| v_token/);
    expect(sql).toMatch(/interval '10 minutes'/);
  });

  it('distingue entrada na fila de aceite real pelo provedor', () => {
    expect(sql).toContain('email_queued_at timestamptz');
    expect(sql).toContain("email_status in ('pending', 'retry', 'sent', 'failed')");
    expect(sql).toMatch(/last_sent_at = case when new\.status = 'sent'/);
    expect(sql).toContain("case when new.status = 'processing' then 'pending'");
    expect(sql).toContain('sync_release_delivery_email_status');
    const enqueue = sql.split('function public.notify_release_issued()')[1]?.split('return new;')[0] || '';
    expect(enqueue).not.toMatch(/set\s+last_sent_at\s*=\s*now\(\)/i);
  });

  it('entrega o áudio só por link assinado de curta duração', () => {
    expect(edge).toMatch(/createSignedUrl\(audioPath, SIGNED_URL_SECONDS/);
    expect(edge).toMatch(/SIGNED_URL_SECONDS = 300/);
  });
});
