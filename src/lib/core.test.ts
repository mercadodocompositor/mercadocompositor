import { describe, expect, it } from 'vitest';
import { getRequestCode } from './identifiers';
import { getSongSaveStatus, getSongToggleStatus } from './songWorkflow';
import { getInterestRequestUrl, getSongUrlKey, slugify } from './urls';

describe('URLs públicas', () => {
  const song = { id: 'f01b79cf-ac57-470b-87e7-560dcc2c1d92', title: 'Canção do Coração!' };
  it('remove acentos e caracteres inseguros', () => expect(slugify(' Canção do Coração! ')).toBe('cancao-do-coracao'));
  it('gera uma chave amigável e única', () => expect(getSongUrlKey(song)).toBe('cancao-do-coracao-f01b79cf'));
  it('gera a rota de interesse completa', () => expect(getInterestRequestUrl('mercado', song)).toBe('/compositor/mercado/musica/cancao-do-coracao-f01b79cf/interesse'));
});

describe('Código da solicitação', () => {
  it('usa o primeiro bloco do UUID em maiúsculas', () => expect(getRequestCode('bdada5f8-ac57-470b-87e7-560dcc2c1d92')).toBe('BDADA5F8'));
});

describe('Fluxo de moderação', () => {
  it('envia música nova para aprovação', () => expect(getSongSaveStatus('published', undefined, true, false)).toBe('pending_approval'));
  it('publica diretamente sem moderação', () => expect(getSongSaveStatus('published', undefined, false, false)).toBe('published'));
  it('permite publicação direta pelo administrador', () => expect(getSongSaveStatus('published', undefined, true, true)).toBe('published'));
  it('mantém publicada uma obra já aprovada', () => expect(getSongSaveStatus('published', 'published', true, false)).toBe('published'));
  it('cancela uma análise', () => expect(getSongToggleStatus('pending_approval', true, false)).toBe('draft'));
  it('reenvia uma música rejeitada', () => expect(getSongToggleStatus('rejected', true, false)).toBe('pending_approval'));
});
