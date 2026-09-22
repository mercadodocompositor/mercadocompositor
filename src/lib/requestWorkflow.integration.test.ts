import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(path.resolve('supabase/request_workflow_hardening.sql'), 'utf8');

describe('request workflow database integration contract', () => {
  it('locks the request, rejects stale tabs and records audit data atomically', () => {
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/p_expected_updated_at/i);
    expect(sql).toMatch(/errcode = '40001'/i);
    expect(sql).toMatch(/insert into public\.interest_request_history/i);
  });

  it('keeps history read-only for application roles', () => {
    expect(sql).toMatch(/revoke insert, update, delete[^;]+authenticated/is);
    expect(sql).toMatch(/create policy "request history owner read"/i);
  });

  it('serializes release exclusivity checks by locking the song row', () => {
    expect(sql).toMatch(/function public\.enforce_release_exclusivity\(\)/i);
    expect(sql).toMatch(/from public\.songs[\s\S]+where id = new\.song_id[\s\S]+for update/i);
    expect(sql).toMatch(/before insert or update of song_id, release_type on public\.releases/i);
    expect(sql).toMatch(/public\.is_exclusive_release\(new\.release_type\)/i);
  });

  it('requires the reviewed version and audits release issuance atomically', () => {
    const versionedRelease = sql.slice(sql.indexOf('p_expected_updated_at timestamptz\n) returns jsonb'));
    expect(versionedRelease).toMatch(/current_request\.updated_at is distinct from p_expected_updated_at/i);
    expect(versionedRelease).toMatch(/insert into public\.interest_request_history/i);
    expect(versionedRelease).toMatch(/updated_at = changed_at_value/i);
    expect(versionedRelease).toMatch(/requestUpdatedAt/i);
    const database = fs.readFileSync(path.resolve('src/lib/database.ts'), 'utf8');
    expect(database).toContain('p_expected_updated_at:expectedUpdatedAt');
    expect(database).not.toContain('legacyFiveParams');
  });

  it('freezes the agreed value once a release has been issued', () => {
    expect(sql).toMatch(/function public\.preserve_issued_request_value\(\)/i);
    expect(sql).toMatch(/before update of agreed_value on public\.interest_requests/i);
    expect(sql).toMatch(/old\.agreed_value is distinct from new\.agreed_value/i);
    expect(sql).toMatch(/select 1 from public\.releases where request_id = old\.id/i);
    const page = fs.readFileSync(path.resolve('src/pages/dashboard/RequestsTab.tsx'), 'utf8');
    expect(page).toContain('existingRelease.agreedValue.toLocaleString');
    expect(page).toContain("activeRequest.status === 'liberacao_enviada' || Boolean(existingRelease)");
  });

  it('supports clearing pre-payment values and server-side request pagination', () => {
    expect(sql).toMatch(/case when p_agreed_value = 0 then null/i);
    expect(sql).toMatch(/function public\.list_interest_requests/i);
    expect(sql).toMatch(/where r\.composer_id = auth\.uid\(\)/i);
    const database = fs.readFileSync(path.resolve('src/lib/database.ts'), 'utf8');
    expect(database).toContain("supabase.rpc('list_interest_requests'");
  });

  it('leaves release issuance and storage archival as retryable separate outcomes', () => {
    const context = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');
    expect(context).toContain('newDoc = await issueReleaseRequest');
    expect(context).toContain('const retryReleaseArchive = async');
    expect(context.indexOf('newDoc = await issueReleaseRequest')).toBeLessThan(context.indexOf('const retryReleaseArchive = async'));
    const page = fs.readFileSync(path.resolve('src/pages/dashboard/RequestsTab.tsx'), 'utf8');
    expect(page).toContain('retryReleaseArchive(newDoc)');
    expect(page).toContain('handleRetryArchive(existingRelease)');
  });

  it('defines an explicit clear operation and returns the updated request record', () => {
    expect(sql).toMatch(/p_clear_agreed_value boolean default false/i);
    expect(sql).toMatch(/when p_clear_agreed_value then null/i);
    expect(sql).toMatch(/returns jsonb/i);

    const database = fs.readFileSync(path.resolve('src/lib/database.ts'), 'utf8');
    expect(database).toContain('p_clear_agreed_value: isExplicitClear');
    expect(database).toContain('clearRequestAgreedValue');
    expect(database).toContain('Promise<InterestRequest | null>');

    const context = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');
    expect(context).toContain('clearRequestAgreedValue');
    expect(context).toContain('setRequests(prev => prev.map(req => req.id === requestId ? updated : req))');
  });

  it('blocks only incompatible transitions when exclusive release exists, keeping archiving enabled', () => {
    expect(sql).toMatch(/current_request\.status = 'pagamento_confirmado' and p_status = 'arquivada'/i);

    const page = fs.readFileSync(path.resolve('src/pages/dashboard/RequestsTab.tsx'), 'utf8');
    expect(page).toContain("disabled={isMutating || activeRequest.status === 'liberacao_enviada'}");
    expect(page).toContain("hasExclusiveReleaseForSong && (status === 'pagamento_pendente' || status === 'pagamento_confirmado')");
  });

  it('preserves agreed value and status drafts and guards internal React Router navigation against unsaved loss', () => {
    const page = fs.readFileSync(path.resolve('src/pages/dashboard/RequestsTab.tsx'), 'utf8');
    expect(page).toContain('req_draft_value_');
    expect(page).toContain('req_draft_status_');
    expect(page).toContain('clearRequestDrafts');
    expect(page).toContain('handleAgreedValueChange');
    expect(page).toContain('handleDraftStatusChange');
    expect(page).toContain('UNSAFE_NavigationContext');
    expect(page).toContain('nav.push = function');
    expect(page).toContain('nav.replace = function');
    expect(page).toContain('isNavigatingConfirmedRef');
    expect(page).toContain('Há alterações não salvas nesta solicitação. Deseja sair e descartá-las?');
  });
});
