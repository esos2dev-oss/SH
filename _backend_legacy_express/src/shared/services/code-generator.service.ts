// Generador de codigos legibles tipo "BK-2026-0001", "LG-2026-0001".
// Basado en una secuencia por tipo+año en BD para evitar colisiones.

import type { PoolClient } from 'pg';
import { pool } from '../config/db.js';

export type CodePrefix = 'BK' | 'LG' | 'INV' | 'CC' | 'PM';

/**
 * Genera siguiente codigo para un prefijo y año dados.
 * Usa una tabla `code_sequences (prefix, year, counter)` que se autoinicializa.
 */
export async function nextCode(prefix: CodePrefix, year: number, client?: PoolClient): Promise<string> {
  const exec = client ?? pool;
  const sql = `
    INSERT INTO code_sequences (prefix, year, counter)
    VALUES ($1, $2, 1)
    ON CONFLICT (prefix, year) DO UPDATE SET counter = code_sequences.counter + 1
    RETURNING counter
  `;
  const { rows } = await exec.query<{ counter: number }>(sql, [prefix, year]);
  const counter = rows[0]?.counter ?? 1;
  return `${prefix}-${year}-${counter.toString().padStart(4, '0')}`;
}
