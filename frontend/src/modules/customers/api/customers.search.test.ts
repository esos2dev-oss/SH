import { describe, it, expect } from 'vitest';
import { normalizeSearch } from './customers.api';

describe('normalizeSearch', () => {
  // Bug 7: buscar "Maria" no encontraba a "María" porque ilike es sensible a
  // tildes, y "TEST Maria" no encontraba nada porque el filtro comparaba campo
  // por campo y ninguna columna sola contiene el nombre completo.
  it('quita las tildes', () => {
    expect(normalizeSearch('María')).toBe('maria');
    expect(normalizeSearch('González')).toBe('gonzalez');
    expect(normalizeSearch('Muñoz')).toBe('munoz');
  });

  it('pasa a minusculas', () => {
    expect(normalizeSearch('TEST Maria')).toBe('test maria');
  });

  it('conserva digitos y guiones de los documentos', () => {
    expect(normalizeSearch('V-12345678')).toBe('v-12345678');
  });

  it('colapsa espacios y recorta', () => {
    expect(normalizeSearch('  Maria   Gonzalez  ')).toBe('maria gonzalez');
  });

  it('un nombre acentuado y otro sin acentuar normalizan igual', () => {
    expect(normalizeSearch('María González')).toBe(normalizeSearch('Maria Gonzalez'));
  });

  it('las palabras sueltas permiten buscar en cualquier orden', () => {
    const a = normalizeSearch('Maria Gonzalez').split(' ').sort();
    const b = normalizeSearch('Gonzalez Maria').split(' ').sort();
    expect(a).toEqual(b);
  });
});
