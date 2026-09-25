import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const verification = readFileSync('supabase/verify_workflow_guarantees_2026_09_24.sql', 'utf8');
const readme = readFileSync('README.md', 'utf8');

describe('ordem e garantias finais das migrations', () => {
  it('detecta sobrescrita do fluxo de consentimento', () => {
    expect(verification).toContain("position('consentAccepted' in v_definition)");
    expect(verification).toContain("position('consent_statement' in v_definition)");
    expect(verification).toContain("p.proname = 'preserve_interest_request_identity'");
    expect(verification).toContain("t.tgname = 'preserve_interest_request_identity'");
  });

  it('exige validação documental ativa no banco', () => {
    expect(verification).toContain("to_regprocedure('public.is_valid_cpf_cnpj(text)')");
    expect(verification).toContain("t.tgname = 'require_valid_interest_request_document'");
    expect(verification).toContain("t.tgenabled <> 'D'");
  });

  it('detecta regressão da entrega automática e do status do outbox', () => {
    expect(verification).toContain("p.proname = 'notify_release_issued'");
    expect(verification).toContain("position('issue_release_delivery_token' in v_definition)");
    expect(verification).toContain("t.tgname = 'notify_release_issued'");
    expect(verification).toContain("t.tgname = 'sync_release_delivery_email_status'");
  });

  it('documenta o verificador como última etapa obrigatória', () => {
    const verifierPosition = readme.indexOf('verify_workflow_guarantees_2026_09_24.sql');
    const cpfPosition = readme.indexOf('cpf_cnpj_validation_2026_09_24.sql');
    expect(verifierPosition).toBeGreaterThan(cpfPosition);
    expect(readme).toContain('obrigatoriamente por último');
  });
});
