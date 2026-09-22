import { describe, expect, it } from 'vitest';
import {
  BIO_MIN_LENGTH,
  MAX_GENRES,
  buildProfileChecks,
  hasCustomImage,
  maskPixKey,
  validatePixKey,
  validateProfileForm,
  type ProfileForm
} from './profileFormUtils';

const validForm = (): ProfileForm => ({
  username: 'rafael-monteiro',
  name: 'Rafael da Silva Monteiro',
  stageName: 'Rafael Monteiro',
  email: 'rafael@exemplo.com.br',
  whatsapp: '(62) 99999-9999',
  cpf: '529.982.247-25',
  city: 'Goiânia',
  state: 'GO',
  bio: 'x'.repeat(BIO_MIN_LENGTH),
  experienceYears: '10 anos',
  genres: ['Sertanejo'],
  society: '',
  instagram: '',
  youtube: '',
  spotify: '',
  website: '',
  photo: '',
  coverPhoto: '',
  pixKey: '',
  pixKeyType: 'cpf',
  viewsCount: 0
});

const options = { identityLocked: false, usernameStatus: 'current' as const };

describe('validateProfileForm', () => {
  it('aceita um perfil completo e válido', () => {
    expect(validateProfileForm(validForm(), options)).toEqual({});
  });

  it('ordena os erros na ordem visual dos campos (o primeiro recebe o foco)', () => {
    const form = { ...validForm(), stageName: '', city: '', email: 'invalido' };
    expect(Object.keys(validateProfileForm(form, options))).toEqual(['stageName', 'city', 'email']);
  });

  it('exige a biografia mínima também usada no checklist', () => {
    const form = { ...validForm(), bio: 'x'.repeat(BIO_MIN_LENGTH - 1) };
    expect(validateProfileForm(form, options).bio).toContain(String(BIO_MIN_LENGTH));
    expect(buildProfileChecks(form).find(check => check.id === 'bio')?.done).toBe(false);
  });

  it(`limita a ${MAX_GENRES} gêneros`, () => {
    const form = { ...validForm(), genres: ['A', 'B', 'C', 'D', 'E', 'F'] };
    expect(validateProfileForm(form, options).genres).toMatch(/no máximo/);
  });

  it('não valida nome civil e CPF bloqueados por termos já emitidos', () => {
    const form = { ...validForm(), name: 'Rafael', cpf: '111.111.111-11' };
    expect(validateProfileForm(form, options)).toHaveProperty('cpf');
    expect(validateProfileForm(form, { ...options, identityLocked: true })).toEqual({});
  });

  it('recusa endereço já em uso ou reservado', () => {
    expect(validateProfileForm(validForm(), { ...options, usernameStatus: 'taken' })).toHaveProperty('username');
    expect(validateProfileForm({ ...validForm(), username: 'admin' }, options)).toHaveProperty('username');
  });
});

describe('Chave PIX', () => {
  it('valida conforme o tipo e aceita chave vazia (opcional)', () => {
    expect(validatePixKey('cpf', '')).toBeNull();
    expect(validatePixKey('cpf', '529.982.247-25')).toBeNull();
    expect(validatePixKey('cpf', '123.456.789-00')).not.toBeNull();
    expect(validatePixKey('email', 'pix@banco.com')).toBeNull();
    expect(validatePixKey('phone', '+55 (62) 99999-9999')).toBeNull();
    expect(validatePixKey('phone', '9999-9999')).not.toBeNull();
    expect(validatePixKey('random', '1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f')).toBeNull();
    expect(validatePixKey('random', 'chave-qualquer')).not.toBeNull();
  });

  it('aplica a máscara do tipo escolhido', () => {
    expect(maskPixKey('cpf', '52998224725')).toBe('529.982.247-25');
    expect(maskPixKey('phone', '62999999999')).toBe('(62) 99999-9999');
    expect(maskPixKey('random', ' 1A2B ')).toBe('1a2b');
  });
});

describe('Imagens do perfil', () => {
  it('não considera fotos genéricas antigas do Unsplash como imagem própria', () => {
    expect(hasCustomImage('')).toBe(false);
    expect(hasCustomImage('https://images.unsplash.com/photo-1511671782779')).toBe(false);
    expect(hasCustomImage('https://x.supabase.co/storage/v1/object/public/profile-media/u/a.webp')).toBe(true);
  });
});
