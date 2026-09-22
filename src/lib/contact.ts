export const normalizeBrazilianWhatsapp = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (!/^\d{10,11}$/.test(national) || national.startsWith('0')) return null;
  return `55${national}`;
};
