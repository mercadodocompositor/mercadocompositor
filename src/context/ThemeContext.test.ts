import { describe, expect, it, beforeEach } from 'vitest';
import { resolveTheme, applyThemeToDocument, getStoredTheme, STORAGE_KEY } from './ThemeContext';

describe('ThemeContext - Lógica de Resolução e Aplicação de Tema (Claro / Escuro)', () => {
  const storageMap = new Map<string, string>();
  const classListSet = new Set<string>();
  const attributes = new Map<string, string>();

  const mockElement = {
    classList: {
      add: (c: string) => classListSet.add(c),
      remove: (c: string) => classListSet.delete(c),
      contains: (c: string) => classListSet.has(c),
    },
    setAttribute: (k: string, v: string) => attributes.set(k, v),
    getAttribute: (k: string) => attributes.get(k) ?? null,
    removeAttribute: (k: string) => attributes.delete(k),
    style: {} as Record<string, string>,
  } as unknown as HTMLElement;

  beforeEach(() => {
    storageMap.clear();
    classListSet.clear();
    attributes.clear();
    (mockElement as unknown as { style: Record<string, string> }).style = {};

    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, String(v)),
      removeItem: (k: string) => storageMap.delete(k),
      clear: () => storageMap.clear(),
    };
  });

  describe('resolveTheme', () => {
    it('resolve explicitamente modo light como light independentemente do sistema', () => {
      expect(resolveTheme('light', true)).toBe('light');
      expect(resolveTheme('light', false)).toBe('light');
    });

    it('resolve explicitamente modo dark como dark independentemente do sistema', () => {
      expect(resolveTheme('dark', true)).toBe('dark');
      expect(resolveTheme('dark', false)).toBe('dark');
    });

    it('resolve modo system de acordo com a preferência do sistema', () => {
      expect(resolveTheme('system', true)).toBe('dark');
      expect(resolveTheme('system', false)).toBe('light');
    });
  });

  describe('applyThemeToDocument', () => {
    it('aplica classes e atributos do modo escuro', () => {
      applyThemeToDocument('dark', mockElement);

      expect(mockElement.classList.contains('dark')).toBe(true);
      expect(mockElement.classList.contains('light')).toBe(false);
      expect(mockElement.getAttribute('data-theme')).toBe('dark');
      expect(mockElement.style.colorScheme).toBe('dark');
    });

    it('aplica classes e atributos do modo claro', () => {
      mockElement.classList.add('dark');
      applyThemeToDocument('light', mockElement);

      expect(mockElement.classList.contains('light')).toBe(true);
      expect(mockElement.classList.contains('dark')).toBe(false);
      expect(mockElement.getAttribute('data-theme')).toBe('light');
      expect(mockElement.style.colorScheme).toBe('light');
    });
  });

  describe('getStoredTheme & STORAGE_KEY', () => {
    it('retorna system se não houver tema salvo', () => {
      expect(getStoredTheme()).toBe('system');
    });

    it('recupera tema light salvo', () => {
      globalThis.localStorage.setItem(STORAGE_KEY, 'light');
      expect(getStoredTheme()).toBe('light');
    });

    it('recupera tema dark salvo', () => {
      globalThis.localStorage.setItem(STORAGE_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('ignora valores inválidos no localStorage e retorna system', () => {
      globalThis.localStorage.setItem(STORAGE_KEY, 'invalid_theme');
      expect(getStoredTheme()).toBe('system');
    });
  });
});
