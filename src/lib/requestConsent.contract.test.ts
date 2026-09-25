import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/request_consent_evidence_2026_09_24.sql', 'utf8');
const page = readFileSync('src/pages/InterestRequestPage.tsx', 'utf8');
const config = readFileSync('src/config/requestConsent.ts', 'utf8');

describe('evidência de consentimento da solicitação', () => {
  it('exige o aceite e a versão vigente também no servidor', () => {
    expect(sql).toContain("p_data->>'consentAccepted'");
    expect(sql).toContain("p_data->>'consentPolicyVersion'");
    expect(sql).toContain("consent_version constant text := '2026-09-24'");
    expect(sql).toContain('Confirme a declaração de veracidade');
  });

  it('registra data do servidor, versão, declaração e origem', () => {
    expect(sql).toContain('consent_accepted_at');
    expect(sql).toContain('clock_timestamp()');
    expect(sql).toContain('consent_policy_version');
    expect(sql).toContain('consent_statement');
    expect(sql).toContain("'public_interest_request_form'");
  });

  it('protege a evidência contra alteração posterior', () => {
    const immutable = sql.split('function public.preserve_interest_request_identity()')[1]?.split('end $$;')[0] || '';
    expect(immutable).toContain('new.consent_accepted_at');
    expect(immutable).toContain('new.consent_policy_version');
    expect(immutable).toContain('new.consent_statement');
  });

  it('mantém declaração e versão únicas entre interface e payload', () => {
    expect(page).toContain('REQUEST_CONSENT_STATEMENT');
    expect(page).toContain('consentAccepted: true');
    expect(page).toContain('consentPolicyVersion: REQUEST_CONSENT_POLICY_VERSION');
    expect(config).toContain("REQUEST_CONSENT_POLICY_VERSION = '2026-09-24'");
  });
});
