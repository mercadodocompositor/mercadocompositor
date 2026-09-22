import type { SongStatus } from '../types';

export const MAX_SUGGESTED_VALUE = 10_000_000;

export const getSongSaveStatus = (
  selectedStatus: SongStatus,
  existingStatus: SongStatus | undefined,
  approvalRequired: boolean,
  isAdmin: boolean
): SongStatus => {
  if (selectedStatus === 'draft') return 'draft';
  if (existingStatus === 'published' && approvalRequired && !isAdmin) return 'pending_approval';
  if (existingStatus === 'published') return 'published';
  return approvalRequired && !isAdmin ? 'pending_approval' : 'published';
};

export const getSongToggleStatus = (
  currentStatus: SongStatus,
  approvalRequired: boolean,
  isAdmin: boolean
): SongStatus => {
  if (currentStatus === 'published' || currentStatus === 'pending_approval') return 'draft';
  return approvalRequired && !isAdmin ? 'pending_approval' : 'published';
};

export const getSongStatusAfterAudioReplacement = (
  currentStatus: SongStatus,
  approvalRequired: boolean,
  isAdmin: boolean
): SongStatus => {
  if (currentStatus === 'published' && approvalRequired && !isAdmin) return 'pending_approval';
  return currentStatus;
};

export interface SongDraftValidationInput {
  title?: string | null;
  authors?: string | null;
  lyrics?: string | null;
  dateComposed?: string | null;
  status: SongStatus;
  valueType: 'suggested' | 'consultation';
  suggestedValue?: number | string | null;
  previewAudioUrl?: string | null;
}

export interface SongValidationResult {
  isValid: boolean;
  error?: string;
  field?: 'title' | 'authors' | 'lyrics' | 'dateComposed' | 'suggestedValue' | 'previewAudioUrl';
}

/**
 * Validação unificada de dados de músicas e rascunhos.
 * Espelha as regras aplicadas pela trigger SQL enforce_song_write_rules().
 */
export const validateSongSubmission = (input: SongDraftValidationInput): SongValidationResult => {
  const trimmedTitle = (input.title || '').trim();
  if (!trimmedTitle) {
    return {
      isValid: false,
      error: 'Informe ao menos um título provisório para salvar o rascunho.',
      field: 'title',
    };
  }

  const today = new Date().toISOString().split('T')[0];
  if (input.dateComposed && input.dateComposed > today) {
    return {
      isValid: false,
      error: 'A data da composição não pode estar no futuro.',
      field: 'dateComposed',
    };
  }

  if (input.valueType === 'suggested') {
    const rawVal = input.suggestedValue;
    const numVal =
      rawVal !== undefined && rawVal !== null && rawVal !== ''
        ? Number(rawVal)
        : null;

    // Em publicação ou envio para aprovação, valor é obrigatório
    if (input.status !== 'draft') {
      if (numVal === null || isNaN(numVal) || numVal <= 0) {
        return {
          isValid: false,
          error: 'O valor sugerido deve ser maior que zero.',
          field: 'suggestedValue',
        };
      }
    }

    // Se o valor estiver preenchido (inclusive em rascunho), valida limites
    if (numVal !== null && !isNaN(numVal)) {
      if (numVal <= 0) {
        return {
          isValid: false,
          error: 'O valor sugerido deve ser maior que zero.',
          field: 'suggestedValue',
        };
      }
      if (numVal > MAX_SUGGESTED_VALUE) {
        return {
          isValid: false,
          error: 'O valor sugerido não pode ultrapassar R$ 10.000.000,00.',
          field: 'suggestedValue',
        };
      }
    }
  }

  // Validações obrigatórias para publicação ou aprovação
  if (input.status !== 'draft') {
    const trimmedAuthors = (input.authors || '').trim();
    const trimmedLyrics = (input.lyrics || '').trim();
    const trimmedPreview = (input.previewAudioUrl || '').trim();

    if (!trimmedAuthors || !trimmedLyrics || !trimmedPreview) {
      return {
        isValid: false,
        error:
          'Para publicar ou enviar para aprovação, informe título, autores, letra e uma prévia pública de até 60 segundos.',
        field: !trimmedAuthors
          ? 'authors'
          : !trimmedLyrics
          ? 'lyrics'
          : 'previewAudioUrl',
      };
    }
  }

  return { isValid: true };
};
