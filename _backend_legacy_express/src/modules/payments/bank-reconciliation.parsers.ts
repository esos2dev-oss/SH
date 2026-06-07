// Parsers de estados de cuenta bancarios venezolanos.
// Estrategia: cada parser recibe el contenido de texto (UTF-8 o latin1) + nombre
// de banco y devuelve filas normalizadas. El usuario indica el banco al subir.
//
// Soporta:
//   - 'banesco' — CSV separado por ; con encabezado
//   - 'mercantil' — CSV separado por , o ;
//   - 'venezuela' — TXT delimitado por tabs (formato del BDV)
//   - 'provincial' — CSV separado por ; o ,
//   - 'generic' — detector autonomo: busca columnas fecha/referencia/monto/cd
//
// Cada banco exporta distinto; estos parsers son tolerantes a variaciones y
// solo extraen los campos que necesitamos: fecha, referencia, descripcion,
// monto, tipo (C=credito, D=debito).

export type BankKey = 'banesco' | 'mercantil' | 'venezuela' | 'provincial' | 'generic';

export interface ParsedMovement {
  fecha: string;        // YYYY-MM-DD
  referencia: string | null;
  descripcion: string | null;
  monto: number;        // siempre positivo, signo via `tipo`
  tipo: 'C' | 'D';
  raw: string;          // linea original
}

export interface ParseResult {
  movements: ParsedMovement[];
  fecha_desde: string | null;
  fecha_hasta: string | null;
  warnings: string[];
}

// =============================================================================
// Helpers comunes
// =============================================================================

function splitLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function detectDelimiter(line: string): ',' | ';' | '\t' {
  const tab = (line.match(/\t/g) ?? []).length;
  const semi = (line.match(/;/g) ?? []).length;
  const comma = (line.match(/,/g) ?? []).length;
  if (tab >= semi && tab >= comma && tab > 0) return '\t';
  if (semi >= comma) return ';';
  return ',';
}

function splitCSVLine(line: string, delim: ',' | ';' | '\t'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Convierte distintos formatos a YYYY-MM-DD. Acepta dd/mm/yyyy, yyyy-mm-dd, etc. */
function parseDate(s: string): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // dd/mm/yyyy
  let m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const dd = m[1]!.padStart(2, '0');
    const mm = m[2]!.padStart(2, '0');
    let yy = m[3]!;
    if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${mm}-${dd}`;
  }
  // dd-mm-yyyy
  m = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m) {
    const dd = m[1]!.padStart(2, '0');
    const mm = m[2]!.padStart(2, '0');
    let yy = m[3]!;
    if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${mm}-${dd}`;
  }
  // yyyymmdd
  m = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Convierte "1.234,56" o "1234.56" o "-1.234,56" en number positivo + signo. */
function parseAmount(s: string): { value: number; negative: boolean } | null {
  if (!s) return null;
  // Quitar simbolos de moneda y espacios, sin tocar el punto/coma decimal
  const trimmed = s
    .replace(/Bs\.?/gi, '')
    .replace(/USD/gi, '')
    .replace(/[$\s]/g, '')
    .trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith('-') || /^\(.*\)$/.test(trimmed);
  let body = trimmed.replace(/^-/, '').replace(/^\(/, '').replace(/\)$/, '');
  // formato venezolano: "1.234,56" — punto miles, coma decimal
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(body)) {
    body = body.replace(/\./g, '').replace(',', '.');
  } else {
    // formato US: "1,234.56" — coma miles, punto decimal
    if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(body)) {
      body = body.replace(/,/g, '');
    } else {
      body = body.replace(/,/g, '.');
    }
  }
  const v = Number(body);
  if (!Number.isFinite(v)) return null;
  return { value: Math.abs(v), negative };
}

/** Encuentra el indice de la columna cuyo encabezado coincide con alguno de los aliases. */
function findCol(header: string[], aliases: string[]): number {
  const lower = header.map((h) => h.toLowerCase());
  for (const a of aliases) {
    const i = lower.findIndex((h) => h === a.toLowerCase() || h.includes(a.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

// =============================================================================
// Parsers por banco
// =============================================================================

/**
 * Banesco — CSV exportado desde portal. Columnas tipicas:
 * "Fecha";"Referencia";"Descripcion";"Monto";"Tipo"
 * O variantes: "Fecha";"Referencia";"Concepto";"Cargo";"Abono";"Saldo"
 */
export function parseBanesco(text: string): ParseResult {
  const lines = splitLines(text);
  if (lines.length === 0) return emptyResult();
  const firstLine = lines[0]!;
  const delim = detectDelimiter(firstLine);
  const header = splitCSVLine(firstLine, delim);

  const colFecha = findCol(header, ['fecha']);
  const colRef = findCol(header, ['referencia', 'numero', 'nro op', 'operacion']);
  const colDesc = findCol(header, ['descripcion', 'concepto']);
  const colMonto = findCol(header, ['monto', 'importe']);
  const colCargo = findCol(header, ['cargo', 'debito']);
  const colAbono = findCol(header, ['abono', 'credito']);
  const colTipo = findCol(header, ['tipo', 'transaccion']);

  const warnings: string[] = [];
  if (colFecha < 0) warnings.push('Banesco: no se detecto columna de fecha. Verifique el formato.');
  const movs: ParsedMovement[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = splitCSVLine(lines[i]!, delim);
    if (row.length < 2) continue;
    const fecha = colFecha >= 0 ? parseDate(row[colFecha] ?? '') : null;
    if (!fecha) continue;
    const referencia = colRef >= 0 ? sanitizeRef(row[colRef] ?? '') : null;
    const descripcion = colDesc >= 0 ? row[colDesc] ?? null : null;

    let monto = 0;
    let tipo: 'C' | 'D' = 'C';
    if (colCargo >= 0 && colAbono >= 0) {
      const cargo = parseAmount(row[colCargo] ?? '');
      const abono = parseAmount(row[colAbono] ?? '');
      if (abono && abono.value > 0) { monto = abono.value; tipo = 'C'; }
      else if (cargo && cargo.value > 0) { monto = cargo.value; tipo = 'D'; }
      else continue;
    } else if (colMonto >= 0) {
      const v = parseAmount(row[colMonto] ?? '');
      if (!v) continue;
      monto = v.value;
      tipo = v.negative ? 'D' : 'C';
      if (colTipo >= 0) {
        const t = (row[colTipo] ?? '').toUpperCase().trim();
        if (t.startsWith('C') || t === 'ABONO' || t === 'CREDITO') tipo = 'C';
        else if (t.startsWith('D') || t === 'CARGO' || t === 'DEBITO') tipo = 'D';
      }
    } else {
      continue;
    }

    movs.push({ fecha, referencia, descripcion, monto, tipo, raw: lines[i]! });
  }

  return { movements: movs, ...rangeFromMovs(movs), warnings };
}

/** Mercantil — formato muy similar a Banesco. Reutilizamos. */
export function parseMercantil(text: string): ParseResult {
  return parseBanesco(text);
}

/** Provincial — idem. */
export function parseProvincial(text: string): ParseResult {
  return parseBanesco(text);
}

/**
 * BDV (Venezuela) — TXT con tabs. Formato:
 * fecha\thora\treferencia\ttipo_op\tmonto\tsaldo\tconcepto
 */
export function parseVenezuela(text: string): ParseResult {
  const lines = splitLines(text);
  if (lines.length === 0) return emptyResult();
  // Detectar si tiene header
  const first = lines[0]!.toLowerCase();
  const hasHeader = first.includes('fecha') && first.includes('referencia');
  const dataStart = hasHeader ? 1 : 0;

  const warnings: string[] = [];
  const movs: ParsedMovement[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const row = lines[i]!.split('\t');
    if (row.length < 5) continue;
    const fecha = parseDate(row[0] ?? '');
    if (!fecha) continue;
    const referencia = sanitizeRef(row[2] ?? '');
    const tipoRaw = (row[3] ?? '').toUpperCase();
    const monto = parseAmount(row[4] ?? '');
    if (!monto) continue;
    const tipo: 'C' | 'D' = tipoRaw.includes('CRED') || tipoRaw.includes('ABON') ? 'C'
      : tipoRaw.includes('DEB') || tipoRaw.includes('CARG') ? 'D'
      : (monto.negative ? 'D' : 'C');
    const descripcion = row[6] ?? null;
    movs.push({ fecha, referencia, descripcion, monto: monto.value, tipo, raw: lines[i]! });
  }

  return { movements: movs, ...rangeFromMovs(movs), warnings };
}

/** Generic — intenta inferir columnas. Fallback cuando no se conoce el banco. */
export function parseGeneric(text: string): ParseResult {
  const lines = splitLines(text);
  if (lines.length === 0) return emptyResult();
  const delim = detectDelimiter(lines[0]!);
  const header = splitCSVLine(lines[0]!, delim);
  const colFecha = findCol(header, ['fecha', 'date']);
  const colRef = findCol(header, ['referencia', 'reference', 'numero', 'nro', 'operacion']);
  const colDesc = findCol(header, ['descripcion', 'concepto', 'description']);
  const colMonto = findCol(header, ['monto', 'importe', 'amount']);
  const colCargo = findCol(header, ['cargo', 'debito', 'debit']);
  const colAbono = findCol(header, ['abono', 'credito', 'credit']);
  return parseBanescoLike(lines.slice(1), delim, { colFecha, colRef, colDesc, colMonto, colCargo, colAbono, colTipo: -1 });
}

function parseBanescoLike(rows: string[], delim: ',' | ';' | '\t', cols: { colFecha: number; colRef: number; colDesc: number; colMonto: number; colCargo: number; colAbono: number; colTipo: number }): ParseResult {
  const movs: ParsedMovement[] = [];
  const warnings: string[] = [];
  for (const line of rows) {
    const row = splitCSVLine(line, delim);
    const fecha = cols.colFecha >= 0 ? parseDate(row[cols.colFecha] ?? '') : null;
    if (!fecha) continue;
    const referencia = cols.colRef >= 0 ? sanitizeRef(row[cols.colRef] ?? '') : null;
    const descripcion = cols.colDesc >= 0 ? row[cols.colDesc] ?? null : null;
    let monto = 0;
    let tipo: 'C' | 'D' = 'C';
    if (cols.colCargo >= 0 && cols.colAbono >= 0) {
      const cargo = parseAmount(row[cols.colCargo] ?? '');
      const abono = parseAmount(row[cols.colAbono] ?? '');
      if (abono && abono.value > 0) { monto = abono.value; tipo = 'C'; }
      else if (cargo && cargo.value > 0) { monto = cargo.value; tipo = 'D'; }
      else continue;
    } else if (cols.colMonto >= 0) {
      const v = parseAmount(row[cols.colMonto] ?? '');
      if (!v) continue;
      monto = v.value;
      tipo = v.negative ? 'D' : 'C';
    } else { continue; }
    movs.push({ fecha, referencia, descripcion, monto, tipo, raw: line });
  }
  return { movements: movs, ...rangeFromMovs(movs), warnings };
}

// =============================================================================

function sanitizeRef(s: string): string | null {
  const trimmed = s.replace(/['"\s]/g, '').trim();
  if (!trimmed) return null;
  // Mantener solo letras y digitos
  return trimmed.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 100) || null;
}

function rangeFromMovs(movs: ParsedMovement[]): { fecha_desde: string | null; fecha_hasta: string | null } {
  if (movs.length === 0) return { fecha_desde: null, fecha_hasta: null };
  const fechas = movs.map((m) => m.fecha).sort();
  return { fecha_desde: fechas[0] ?? null, fecha_hasta: fechas[fechas.length - 1] ?? null };
}

function emptyResult(): ParseResult {
  return { movements: [], fecha_desde: null, fecha_hasta: null, warnings: [] };
}

export function parseByBank(bank: BankKey, text: string): ParseResult {
  switch (bank) {
    case 'banesco': return parseBanesco(text);
    case 'mercantil': return parseMercantil(text);
    case 'venezuela': return parseVenezuela(text);
    case 'provincial': return parseProvincial(text);
    case 'generic':
    default:
      return parseGeneric(text);
  }
}
