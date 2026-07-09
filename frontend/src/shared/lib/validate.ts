// Helpers de validacion con mensajes de campos faltantes especificos.

export interface FieldSpec { key: string; label: string; }

/**
 * Devuelve los labels de los campos que faltan (empty string, null, undefined,
 * o (para numeros) NaN/<=0). Uso: mostrarSelosAlUsuario en un toast/mensaje.
 */
export function missingFields(
  values: Record<string, unknown>,
  required: FieldSpec[],
): string[] {
  const missing: string[] = [];
  for (const spec of required) {
    const v = values[spec.key];
    if (v === undefined || v === null) { missing.push(spec.label); continue; }
    if (typeof v === 'string' && v.trim() === '') { missing.push(spec.label); continue; }
    if (typeof v === 'number' && (!Number.isFinite(v) || v <= 0)) { missing.push(spec.label); continue; }
  }
  return missing;
}

/**
 * Formatea la lista de campos faltantes en un string amigable.
 * Ejemplo: "Faltan: nombre, capacidad y tarifa por dia".
 */
export function missingFieldsMessage(missing: string[]): string | null {
  if (missing.length === 0) return null;
  if (missing.length === 1) return `Falta: ${missing[0]}`;
  if (missing.length === 2) return `Faltan: ${missing[0]} y ${missing[1]}`;
  return `Faltan: ${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`;
}
