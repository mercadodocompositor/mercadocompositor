import { describe, expect, it } from 'vitest';
import { generateReleasePdf, getReleasePdfBlob, getReleasePdfDataUrl } from './pdfGenerator';
import { ReleaseDocument } from '../types';
import { PublicReleaseValidation } from './database';

describe('Geração de Termos de Liberação em PDF', () => {
  const mockRelease: ReleaseDocument = {
    id: 'rel-123456',
    requestId: 'req-123456',
    songId: 'song-123456',
    songTitle: 'Coração Sertanejo',
    authors: 'João da Silva e Maria Souza',
    composerName: 'João da Silva',
    composerCpf: '123.456.789-00',
    composerCityState: 'Goiânia - GO',
    buyerName: 'Pedro Intérprete',
    buyerDocument: '987.654.321-99',
    buyerCityState: 'São Paulo - SP',
    agreedValue: 2500,
    authorizedPurpose: 'Gravação de single comercial e veiculação em streaming.',
    releaseType: 'Exclusiva por 24 meses',
    issueDate: '2026-08-31',
    additionalConditions: 'Manter os créditos de autoria em todas as plataformas.',
    digitalSignature: 'SIG-HASH-998877665544332211',
    documentCode: 'LIB-2026-A1B2C',
    isDemonstrative: false,
  };

  const mockPublicValidation: PublicReleaseValidation = {
    songTitle: 'Coração Sertanejo',
    authors: 'João da Silva',
    composerName: 'João da Silva',
    composerDocumentLast4: '8900',
    composerCityState: 'Goiânia - GO',
    buyerName: 'Pedro Intérprete',
    buyerDocumentLast4: '2199',
    buyerCityState: 'São Paulo - SP',
    authorizedPurpose: 'Gravação em DVD ao vivo.',
    releaseType: 'Não-Exclusiva',
    issueDate: '2026-08-31',
    digitalSignature: 'SIG-HASH-112233445566778899',
    documentCode: 'LIB-2026-VALID1',
  };

  it('gera uma instância válida do jsPDF para documento completo', () => {
    const doc = generateReleasePdf(mockRelease);
    expect(doc).toBeDefined();
    expect(doc.internal.pages.length).toBeGreaterThan(0);
  });

  it('gera uma instância válida do jsPDF para validação pública mascarada', () => {
    const doc = generateReleasePdf(mockPublicValidation);
    expect(doc).toBeDefined();
    expect(doc.internal.pages.length).toBeGreaterThan(0);
  });

  it('gera Blob válido de PDF', () => {
    const blob = getReleasePdfBlob(mockRelease);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(100);
    expect(blob.type).toBe('application/pdf');
  });

  it('gera Data URL base64 do PDF', () => {
    const dataUrl = getReleasePdfDataUrl(mockRelease);
    expect(dataUrl).toBeDefined();
    expect(dataUrl).toMatch(/^data:application\/pdf;/);
  });
});
