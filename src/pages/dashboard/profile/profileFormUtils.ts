import type { ComposerProfile } from '../../../types';
import { MUSIC_GENRES } from '../../../config/musicGenres';
import { RESERVED_USERNAMES } from '../../../lib/database';
import { isValidCpf } from '../../../lib/brazilianDocuments';

export { isValidCpf } from '../../../lib/brazilianDocuments';

export type ProfileForm = ComposerProfile;
export type FieldErrors = Record<string, string>;
export type SetProfileField = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => void;
export type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'current' | 'invalid';
export type ImageKind = 'photo' | 'coverPhoto';
export type PixKeyType = 'cpf' | 'email' | 'phone' | 'random';

export const GENRES = [
  ...MUSIC_GENRES.filter(g => g !== 'Outro'),
  'Sertanejo Universitário'
];
/** Limite de gêneros: a vitrine destaca os 3 primeiros; mais que isso dilui o posicionamento. */
export const MAX_GENRES = 5;
export const FEATURED_GENRES = 3;

export const SOCIETIES = [
  'UBC - União Brasileira de Compositores',
  'ABRAMUS - Associação Brasileira de Música e Artes',
  'SOCINPRO - Sociedade Brasileira de Administração e Proteção de Direitos',
  'AMAR/SOMBRÁS - Associação de Músicos, Arranjadores e Regentes',
  'SBACEM - Sociedade Brasileira de Autores, Compositores e Escritores de Música',
  'ASSIM - Associação de Intérpretes e Músicos',
  'SICAM - Sociedade Independente de Compositores e Autores Musicais',
  'Compositor Independente / Não filiado a Sociedade'
];
export const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export const BIO_MIN_LENGTH = 50;
export const BIO_MAX_LENGTH = 600;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_TAKEN_MESSAGE = 'Este endereço público já está em uso por outro compositor. Escolha outro.';

// Recorte e compressão no navegador: o arquivo final fica bem abaixo do limite de
// 5 MB do bucket profile-media (validate-media-upload), então a entrada pode ser maior.
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_RULES: Record<ImageKind, { label: string; hint: string; aspect: number; width: number; height: number; cropTitle: string; fieldId: string }> = {
  photo: { label: 'foto de perfil', hint: 'recorte quadrado', aspect: 1, width: 800, height: 800, cropTitle: 'Recortar foto de perfil', fieldId: 'field-avatar' },
  coverPhoto: { label: 'capa', hint: 'recorte 16:9', aspect: 16 / 9, width: 1920, height: 1080, cropTitle: 'Recortar capa do perfil', fieldId: 'field-banner' }
};

// Cadastros antigos podiam guardar fotos genéricas do Unsplash como padrão: não contam como imagem própria.
export const hasCustomImage = (value?: string) => Boolean(value?.trim()) && !/images\.unsplash\.com/i.test(value || '');

export const getInitials = (name: string) =>
  name.split(/\s+/).map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'MC';

export const maskPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};

export const maskCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const sanitizeSlug = (value: string) => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

export const sanitizeInstagram = (value: string) => {
  const clean = value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  return clean ? `@${clean}` : '';
};

export const sanitizeWeb = (value: string) => value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

export const PIX_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  email: 'E-mail',
  phone: 'Celular',
  random: 'Chave aleatória'
};

export const maskPixKey = (type: string, value: string) => {
  if (type === 'cpf') return maskCpf(value);
  if (type === 'phone') return maskPhone(value);
  if (type === 'random') return value.trim().toLowerCase().slice(0, 36);
  return value.trim().slice(0, 140);
};

// Espelha public.validate_private_profile_pix(): chave vazia é permitida (campo opcional).
export const validatePixKey = (type: string, value: string): string | null => {
  const key = value.trim();
  if (!key) return null;
  const digits = key.replace(/\D/g, '');
  switch (type) {
    case 'cpf':
      return isValidCpf(digits) ? null : 'CPF inválido para chave PIX. Verifique os números.';
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key) ? null : 'Informe um e-mail válido como chave PIX.';
    case 'phone': {
      const local = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
      return local.length === 10 || local.length === 11 ? null : 'Informe o celular com DDD (ex: (11) 99999-9999).';
    }
    case 'random':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
        ? null
        : 'A chave aleatória tem 32 caracteres no formato 1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f.';
    default:
      return 'Selecione o tipo da chave PIX.';
  }
};

/**
 * Validação síncrona do formulário. A ordem das chaves segue a ordem visual dos
 * campos: o primeiro erro é o que recebe foco e rolagem.
 */
export const validateProfileForm = (
  form: ProfileForm,
  options: { identityLocked: boolean; usernameStatus: UsernameStatus }
): FieldErrors => {
  const errors: FieldErrors = {};

  const username = sanitizeSlug(form.username || '');
  if (!form.stageName.trim()) {
    errors.stageName = 'Informe seu nome artístico ou pseudônimo.';
  }

  if (!username) {
    errors.username = 'O endereço público não pode estar vazio.';
  } else if (username.length < USERNAME_MIN_LENGTH) {
    errors.username = `O endereço público deve ter pelo menos ${USERNAME_MIN_LENGTH} caracteres.`;
  } else if (!/^[a-z0-9-]+$/.test(username)) {
    errors.username = 'O link deve conter apenas letras minúsculas, números e hífens.';
  } else if (RESERVED_USERNAMES.includes(username)) {
    errors.username = 'Este endereço é reservado pelo sistema. Escolha outro identificador.';
  } else if (options.usernameStatus === 'taken') {
    errors.username = USERNAME_TAKEN_MESSAGE;
  }

  if (!form.city.trim()) {
    errors.city = 'Informe a sua cidade de atuação.';
  }

  if (!form.state.trim()) {
    errors.state = 'Selecione o estado (UF).';
  }

  if (!form.bio.trim()) {
    errors.bio = 'Preencha a biografia artística do seu perfil.';
  } else if (form.bio.trim().length < BIO_MIN_LENGTH) {
    errors.bio = `A biografia deve ter pelo menos ${BIO_MIN_LENGTH} caracteres para apresentar seu trabalho.`;
  }

  if (!form.genres.length) {
    errors.genres = 'Selecione pelo menos um gênero musical de destaque.';
  } else if (form.genres.length > MAX_GENRES) {
    errors.genres = `Escolha no máximo ${MAX_GENRES} gêneros. Remova ${form.genres.length - MAX_GENRES} para salvar.`;
  }

  // Bloqueados (termos já emitidos): o usuário não consegue editá-los, então não
  // podem impedir o salvamento do restante do perfil.
  if (!options.identityLocked) {
    if (!form.name.trim()) {
      errors.name = 'Informe seu nome civil completo (titular dos direitos).';
    } else if (form.name.trim().split(/\s+/).length < 2) {
      errors.name = 'Informe nome e sobrenome completos.';
    }

    const cpfDigits = (form.cpf || '').replace(/\D/g, '');
    if (!cpfDigits) {
      errors.cpf = 'Informe seu CPF para qualificação jurídica nos termos de liberação.';
    } else if (!isValidCpf(cpfDigits)) {
      errors.cpf = 'CPF inválido. Verifique os números informados.';
    }
  }

  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = 'Informe um e-mail de contato válido.';
  }

  const phoneDigits = form.whatsapp.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    errors.whatsapp = 'Informe um WhatsApp com DDD válido (ex: 11 99999-9999).';
  }

  const pixError = validatePixKey(form.pixKeyType || 'cpf', form.pixKey || '');
  if (pixError) {
    errors.pixKey = pixError;
  }

  return errors;
};

export interface ProfileCheck {
  id: string;
  label: string;
  done: boolean;
  target: string;
}

export const buildProfileChecks = (form: ProfileForm): ProfileCheck[] => [
  { id: 'photo', label: 'Foto de perfil (Avatar)', done: hasCustomImage(form.photo), target: 'field-avatar' },
  { id: 'cover', label: 'Capa de fundo (Banner)', done: hasCustomImage(form.coverPhoto), target: 'field-banner' },
  { id: 'stageName', label: 'Nome artístico e endereço', done: Boolean(form.stageName?.trim() && form.username?.trim()), target: 'field-stageName' },
  { id: 'bio', label: `Biografia artística (${BIO_MIN_LENGTH}+ caracteres)`, done: Boolean(form.bio?.trim().length >= BIO_MIN_LENGTH), target: 'field-bio' },
  { id: 'location', label: 'Cidade e Estado (UF)', done: Boolean(form.city?.trim() && form.state?.trim()), target: 'field-city' },
  { id: 'genres', label: 'Gêneros musicais (ao menos 1 estilo)', done: Boolean(form.genres?.length > 0), target: 'field-genres' },
  { id: 'legal', label: 'Dados civis (Nome civil & CPF)', done: Boolean(form.name?.trim().split(/\s+/).length >= 2 && isValidCpf(form.cpf || '')), target: 'field-name' },
  { id: 'pix', label: 'Chave PIX para negociações', done: Boolean(form.pixKey?.trim()), target: 'field-pix' },
  { id: 'social', label: 'Mídias sociais ou streaming', done: Boolean(form.instagram?.trim() || form.youtube?.trim() || form.spotify?.trim() || form.website?.trim()), target: 'field-instagram' }
];

/** Rola até o campo e move o foco para o primeiro controle dentro dele. */
export const focusField = (elementId: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = element.querySelector<HTMLElement>('input, select, textarea, button');
  (focusable || element).focus({ preventScroll: true });
};
