import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(path.resolve('supabase/release_delivery_2026_09_24.sql'), 'utf8');
const edge = fs.readFileSync(path.resolve('supabase/functions/release-delivery/index.ts'), 'utf8');
const snapshot = fs.readFileSync(path.resolve('supabase/release_delivery_snapshot_2026_09_28.sql'), 'utf8');
const page = fs.readFileSync(path.resolve('src/pages/ReleaseDeliveryPage.tsx'), 'utf8');

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

  it('entrega ao cliente a via completa do termo, não a cópia mascarada', () => {
    expect(edge).toContain("const ACTIONS = ['info', 'audio', 'stream', 'lyrics', 'document', 'notify_composer']");
    expect(edge).toMatch(/composer_cpf[\s\S]+buyer_document[\s\S]+agreed_value[\s\S]+additional_conditions/);
    expect(edge).toMatch(/from\('release-documents'\)\s*\.createSignedUrl\(term\.document_path, SIGNED_URL_SECONDS\)/);
    expect(page).toContain('requestDeliveryTermDocument');
    expect(page).toContain('downloadDeliveryTerm');
  });

  it('congela o áudio da emissão e impede o compositor de apagá-lo', () => {
    expect(snapshot).toMatch(/add column if not exists audio_path text/);
    expect(snapshot).toMatch(/audio_path = coalesce\(public\.release_deliveries\.audio_path, excluded\.audio_path\)/);
    expect(snapshot).toMatch(/create policy "media owner delete"[\s\S]+release_deliveries d where d\.audio_path = objects\.name/);
    expect(edge).toContain('delivery.audio_path || release?.songs?.original_audio_path');
  });

  it('deixa o cliente avisar o compositor no máximo uma vez a cada 24 horas', () => {
    expect(snapshot).toMatch(/composer_notified_at > now\(\) - interval '24 hours'/);
    expect(snapshot).toContain("grant execute on function public.notify_composer_about_delivery(uuid, text) to service_role");
    expect(edge).toMatch(/action === 'notify_composer'[\s\S]+notify_composer_about_delivery/);
    expect(page).toContain('notifyComposerAboutDelivery');
  });

  it('não expõe o token a buscadores nem a terceiros', () => {
    expect(page).toContain("['robots', 'noindex, nofollow']");
    expect(page).toContain("['referrer', 'no-referrer']");
  });

  it('entrega o áudio só por link assinado de curta duração', () => {
    expect(edge).toMatch(/createSignedUrl\(\s*audioPath,\s*action === 'audio' \? SIGNED_URL_SECONDS : STREAM_URL_SECONDS/);
    expect(edge).toMatch(/SIGNED_URL_SECONDS = 300/);
  });
});
