export const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@');
  if (!domain) return 'E-mail não informado';
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(3, name.length - 1))}@${domain}`;
};

export const normalizeBrazilianPhone = (phone: string) =>
  phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');

export const hasValidWhatsappNumber = (phone: string) => {
  const digits = normalizeBrazilianPhone(phone);
  return digits.length === 10 || digits.length === 11;
};

export const maskPhone = (phone: string) => {
  const digits = normalizeBrazilianPhone(phone);
  return hasValidWhatsappNumber(phone) ? `(**) *****-${digits.slice(-4)}` : 'WhatsApp não cadastrado';
};
