import { describe, expect, it } from 'vitest';
import { sanitizeMonitoringValue } from './monitoring';

describe('telemetria segura', () => {
  it('remove chaves sensíveis e dados pessoais em texto', () => {
    const result=sanitizeMonitoringValue({
      email:'pessoa@example.com',
      authorization:'Bearer segredo',
      message:'Falha para pessoa@example.com no documento 12345678901',
      safe:'dashboard'
    });
    expect(result).toEqual({email:'[redacted]',authorization:'[redacted]',message:'Falha para [email] no documento [document]',safe:'dashboard'});
  });

  it('limita profundidade e tamanho de textos', () => {
    const result=sanitizeMonitoringValue({a:{b:{c:{d:'segredo'}}},long:'x'.repeat(700)}) as Record<string,unknown>;
    expect(JSON.stringify(result)).not.toContain('segredo');
    expect(String(result.long)).toHaveLength(500);
  });
});
