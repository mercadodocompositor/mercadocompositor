const digitsOnly = (value: string) => value.replace(/\D/g, '');

const hasRepeatedDigits = (digits: string) => /^(\d)\1+$/.test(digits);

export const isValidCpf = (value: string): boolean => {
  const digits = digitsOnly(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (length: number) => {
    const sum = digits
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(digits[9])
    && calculateDigit(10) === Number(digits[10]);
};

export const isValidCnpj = (value: string): boolean => {
  const digits = digitsOnly(value);
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (length: 12 | 13) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12])
    && calculateDigit(13) === Number(digits[13]);
};

export const isValidCpfCnpj = (value: string): boolean => {
  const digits = digitsOnly(value);
  return digits.length === 11 ? isValidCpf(digits) : isValidCnpj(digits);
};
