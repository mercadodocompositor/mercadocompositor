import type { ReleaseDocument } from '../types';
import { getReleasePdfBlob } from './pdfGenerator';
import { supabase } from './supabase';
import { uploadCurrentUserFile } from './database';

export const RELEASE_TEMPLATE_VERSION = 'release-v2';

const sha256 = async (blob: Blob) => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const archiveReleasePdf = async (userId: string, document: ReleaseDocument): Promise<ReleaseDocument> => {
  if (!supabase || document.documentPath) return document;
  const blob = getReleasePdfBlob(document);
  const documentHash = await sha256(blob);
  const filename = `${document.documentCode}-${RELEASE_TEMPLATE_VERSION}.pdf`;
  const file = new File([blob], filename, { type: 'application/pdf' });
  Object.assign(file, { releaseId: document.id, subfolder: document.id });
  const documentPath = await uploadCurrentUserFile('release-documents', file);
  const { error: registerError } = await supabase.rpc('register_release_document', {
    p_release_id: document.id,
    p_document_path: documentPath,
    p_document_hash: documentHash,
    p_template_version: RELEASE_TEMPLATE_VERSION
  });
  if (registerError) throw registerError;
  return { ...document, documentPath, documentHash, templateVersion: RELEASE_TEMPLATE_VERSION, documentArchivedAt: new Date().toISOString() };
};

export const downloadReleaseDocument = async (document: ReleaseDocument) => {
  if (!document.documentPath || !supabase) {
    const blob = getReleasePdfBlob(document);
    saveBlob(blob, `Termo_Liberacao_${document.documentCode}.pdf`);
    return false;
  }
  const { data, error } = await supabase.storage.from('release-documents').download(document.documentPath);
  if (error) throw error;
  if (document.documentHash && await sha256(data) !== document.documentHash) {
    throw new Error('A integridade do PDF arquivado não pôde ser confirmada.');
  }
  saveBlob(data, `Termo_Liberacao_${document.documentCode}.pdf`);
  return true;
};

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
