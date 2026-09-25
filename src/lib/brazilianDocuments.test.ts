import { describe, expect, it } from 'vitest';
import { isValidCnpj, isValidCpf, isValidCpfCnpj } from './brazilianDocuments';

describe('documentos brasileiros', () => {
  it.each(['529.982.247-25', '168.995.350-09'])('aceita CPF válido: %s', cpf => {
    expect(isValidCpf(cpf)).toBe(true);
    expect(isValidCpfCnpj(cpf)).toBe(true);
  });

  it.each(['123.456.789-00', '111.111.111-11', '529.982.247-24', '123'])('rejeita CPF inválido: %s', cpf => {
    expect(isValidCpf(cpf)).toBe(false);
    expect(isValidCpfCnpj(cpf)).toBe(false);
  });

  it.each(['41.099.784/0001-34', '11.222.333/0001-81'])('aceita CNPJ válido: %s', cnpj => {
    expect(isValidCnpj(cnpj)).toBe(true);
    expect(isValidCpfCnpj(cnpj)).toBe(true);
  });

  it.each(['12.345.678/0001-00', '11.111.111/1111-11', '41.099.784/0001-35', '1234567890123'])('rejeita CNPJ inválido: %s', cnpj => {
    expect(isValidCnpj(cnpj)).toBe(false);
    expect(isValidCpfCnpj(cnpj)).toBe(false);
  });
});
