import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReleaseDocument } from '../types';
import { archiveReleasePdf, RELEASE_TEMPLATE_VERSION } from './releaseArchive';

const mockRpc = vi.fn();
const mockUploadCurrentUserFile = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock('./database', () => ({
  uploadCurrentUserFile: (...args: any[]) => mockUploadCurrentUserFile(...args),
}));

vi.mock('./pdfGenerator', () => ({
  getReleasePdfBlob: vi.fn(() => new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' })),
}));

const sampleDoc: ReleaseDocument = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  requestId: 'req-123',
  songId: 'song-123',
  songTitle: 'Amor de Sertão',
  authors: 'Compositor Silva',
  composerName: 'Compositor Silva',
  composerCpf: '111.222.333-44',
  composerCityState: 'Goiânia / GO',
  buyerName: 'Cantor Fictício',
  buyerDocument: '555.666.777-88',
  buyerCityState: 'Uberlândia / MG',
  releaseType: 'Autorização Exclusiva de Gravação e Fixação (12 meses)',
  authorizedPurpose: 'Gravação de single comercial',
  agreedValue: 3500,
  issueDate: '2026-09-14',
  additionalConditions: 'Cláusula de exclusividade de 12 meses.',
  documentCode: 'REL-2026-0001',
  digitalSignature: 'SIG-ABC-123',
  isDemonstrative: false,
};

describe('Arquivamento de PDF de Liberação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
    mockUploadCurrentUserFile.mockImplementation(async (_bucket: string, file: File) => {
      const subfolder = (file as any).subfolder || (file as any).releaseId;
      return `user-456/${subfolder}/${file.name}`;
    });
  });

  it('anexa o ID da liberação para que o caminho respeite a regra do banco auth.uid()/release_id/%.pdf', async () => {
    let capturedFile: any = null;
    mockUploadCurrentUserFile.mockImplementation(async (_bucket: string, file: File) => {
      capturedFile = file;
      return `user-456/${(file as any).subfolder}/${file.name}`;
    });

    const result = await archiveReleasePdf('user-456', sampleDoc);

    expect(capturedFile).not.toBeNull();
    expect(capturedFile.subfolder).toBe(sampleDoc.id);
    expect(capturedFile.releaseId).toBe(sampleDoc.id);

    // O caminho gerado deve começar com userId/releaseId/
    const expectedPrefix = `user-456/${sampleDoc.id}/`;
    expect(result.documentPath).toMatch(new RegExp(`^${expectedPrefix}.+\\.pdf$`));

    // Valida chamada ao RPC do banco
    expect(mockRpc).toHaveBeenCalledWith('register_release_document', {
      p_release_id: sampleDoc.id,
      p_document_path: result.documentPath,
      p_document_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_template_version: RELEASE_TEMPLATE_VERSION,
    });
  });

  it('não re-arquiva documento que já possui documentPath registrado', async () => {
    const alreadyArchived: ReleaseDocument = {
      ...sampleDoc,
      documentPath: 'user-456/3fa85f64-5717-4562-b3fc-2c963f66afa6/REL-2026-0001-release-v1.pdf',
      documentHash: 'a'.repeat(64),
      templateVersion: RELEASE_TEMPLATE_VERSION,
    };

    const result = await archiveReleasePdf('user-456', alreadyArchived);

    expect(mockUploadCurrentUserFile).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(result).toBe(alreadyArchived);
  });
});
