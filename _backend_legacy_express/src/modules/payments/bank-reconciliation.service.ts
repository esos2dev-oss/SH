// Servicio de conciliacion bancaria.
// Sube extracto -> persiste cabecera + movimientos -> auto-matcher contra pagos
// pending_confirmation con referencia y monto similares (±0.5% para tolerar redondeos).

import { withTransaction, pool } from '../../shared/config/db.js';
import { Errors } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { confirm as confirmPayment } from './payments.service.js';
import { parseByBank, type BankKey, type ParsedMovement } from './bank-reconciliation.parsers.js';

export interface UploadInput {
  banco: BankKey;
  cuenta?: string | null;
  moneda?: string;
  filename: string;
  fileBuffer: Buffer;
}

export interface BankStatementPublic {
  id: number;
  banco: string;
  cuenta: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  moneda: string;
  original_name: string;
  total_movs: number;
  matched_movs: number;
  uploaded_by: number;
  created_at: string;
}

export interface BankMovementPublic {
  id: number;
  statement_id: number;
  fecha: string;
  referencia: string | null;
  descripcion: string | null;
  monto: number;
  tipo: 'C' | 'D';
  moneda: string;
  matched_payment_id: number | null;
  raw_line: string | null;
}

export async function uploadStatement(input: UploadInput, actorId: number): Promise<{
  statement: BankStatementPublic;
  matched: number;
  total: number;
  warnings: string[];
}> {
  // Detectar encoding
  let text: string;
  try {
    text = input.fileBuffer.toString('utf-8');
    if (text.includes('�')) {
      text = input.fileBuffer.toString('latin1');
    }
  } catch {
    text = input.fileBuffer.toString('latin1');
  }

  const parsed = parseByBank(input.banco, text);
  if (parsed.movements.length === 0) {
    throw Errors.validation('No se detectaron movimientos en el archivo. Verifique el formato y el banco seleccionado.');
  }

  const fechaDesde = parsed.fecha_desde ?? new Date().toISOString().slice(0, 10);
  const fechaHasta = parsed.fecha_hasta ?? fechaDesde;
  const moneda = input.moneda ?? 'VES';

  return withTransaction(async (client) => {
    const { rows: stRows } = await client.query<{ id: number; created_at: Date }>(
      `INSERT INTO bank_statements (banco, cuenta, fecha_desde, fecha_hasta, moneda, original_name, total_movs, matched_movs, uploaded_by)
       VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, 0, $8)
       RETURNING id, created_at`,
      [input.banco, input.cuenta ?? null, fechaDesde, fechaHasta, moneda, input.filename, parsed.movements.length, actorId],
    );
    const statementId = stRows[0]!.id;
    const createdAt = stRows[0]!.created_at.toISOString();

    // Insertar movimientos en batch
    const inserted: Array<{ id: number; mov: ParsedMovement }> = [];
    for (const mov of parsed.movements) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO bank_statement_movements (statement_id, fecha, referencia, descripcion, monto, tipo, moneda, raw_line)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [statementId, mov.fecha, mov.referencia, mov.descripcion, mov.monto, mov.tipo, moneda, mov.raw],
      );
      inserted.push({ id: rows[0]!.id, mov });
    }

    // Auto-match: solo creditos del extracto buscan pagos pending_confirmation
    let matched = 0;
    for (const ins of inserted) {
      if (ins.mov.tipo !== 'C') continue;
      if (!ins.mov.referencia) continue;
      const matchedPaymentId = await tryAutoMatch(client, ins.mov, moneda);
      if (matchedPaymentId !== null) {
        await client.query(
          `UPDATE bank_statement_movements SET matched_payment_id = $2 WHERE id = $1`,
          [ins.id, matchedPaymentId],
        );
        await client.query(
          `UPDATE booking_payments SET bank_match_id = $2 WHERE id = $1`,
          [matchedPaymentId, ins.id],
        );
        matched++;
      }
    }

    if (matched > 0) {
      await client.query(`UPDATE bank_statements SET matched_movs = $2 WHERE id = $1`, [statementId, matched]);
    }

    await logAudit({
      userId: actorId,
      action: 'create',
      entity: 'bank_statements',
      entityId: statementId,
      after: { banco: input.banco, total: parsed.movements.length, matched },
    }, client);

    // Confirmar los pagos cuyo match es seguro (referencia exacta + monto coincide)
    // Fuera de la transaccion para que cada confirmacion se haga atomica.
    const statementOut: BankStatementPublic = {
      id: statementId,
      banco: input.banco,
      cuenta: input.cuenta ?? null,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      moneda,
      original_name: input.filename,
      total_movs: parsed.movements.length,
      matched_movs: matched,
      uploaded_by: actorId,
      created_at: createdAt,
    };
    return {
      statement: statementOut,
      matched,
      total: parsed.movements.length,
      warnings: parsed.warnings,
    };
  });
}

/**
 * Auto-confirma los pagos asociados a movimientos donde matching es estricto:
 * misma referencia, monto coincide en ±0.5%, fecha del pago ±2 dias.
 */
export async function autoConfirmExactMatches(statementId: number, actorId: number): Promise<{ confirmed: number }> {
  const { rows } = await pool.query<{ payment_id: number; mov_fecha: Date; mov_monto: string; mov_ref: string | null; p_monto: string; p_ref: string | null; p_fecha: Date }>(
    `SELECT m.matched_payment_id AS payment_id,
            m.fecha AS mov_fecha, m.monto AS mov_monto, m.referencia AS mov_ref,
            p.monto AS p_monto, p.referencia AS p_ref, p.pagado_at AS p_fecha
       FROM bank_statement_movements m
       JOIN booking_payments p ON p.id = m.matched_payment_id
      WHERE m.statement_id = $1
        AND m.matched_payment_id IS NOT NULL
        AND p.status = 'pending_confirmation'`,
    [statementId],
  );
  let confirmed = 0;
  for (const r of rows) {
    if (r.mov_ref !== r.p_ref) continue;
    const diff = Math.abs(Number(r.mov_monto) - Number(r.p_monto));
    if (diff / Math.max(1, Number(r.p_monto)) > 0.005) continue;
    const diffDays = Math.abs(r.mov_fecha.getTime() - r.p_fecha.getTime()) / 86_400_000;
    if (diffDays > 2) continue;
    await confirmPayment(r.payment_id, actorId);
    confirmed++;
  }
  return { confirmed };
}

export async function manualMatch(movementId: number, paymentId: number | null, actorId: number): Promise<void> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ statement_id: number; matched_payment_id: number | null }>(
      `SELECT statement_id, matched_payment_id FROM bank_statement_movements WHERE id = $1`,
      [movementId],
    );
    const mov = rows[0];
    if (!mov) throw Errors.notFound('Movimiento no encontrado');

    // Liberar payment previamente matcheado
    if (mov.matched_payment_id !== null) {
      await client.query(`UPDATE booking_payments SET bank_match_id = NULL WHERE id = $1`, [mov.matched_payment_id]);
    }

    if (paymentId !== null) {
      const { rowCount } = await client.query(`SELECT 1 FROM booking_payments WHERE id = $1`, [paymentId]);
      if (!rowCount) throw Errors.notFound('Pago no encontrado');
      await client.query(`UPDATE bank_statement_movements SET matched_payment_id = $2 WHERE id = $1`, [movementId, paymentId]);
      await client.query(`UPDATE booking_payments SET bank_match_id = $2 WHERE id = $1`, [paymentId, movementId]);
    } else {
      await client.query(`UPDATE bank_statement_movements SET matched_payment_id = NULL WHERE id = $1`, [movementId]);
    }

    // Recalcular matched_movs
    await client.query(
      `UPDATE bank_statements
          SET matched_movs = (SELECT COUNT(*) FROM bank_statement_movements WHERE statement_id = $1 AND matched_payment_id IS NOT NULL)
        WHERE id = $1`,
      [mov.statement_id],
    );

    await logAudit({
      userId: actorId,
      action: 'update',
      entity: 'bank_statement_movements',
      entityId: movementId,
      after: { matched_payment_id: paymentId },
    }, client);
  });
}

export async function listStatements(): Promise<BankStatementPublic[]> {
  const { rows } = await pool.query<{
    id: number; banco: string; cuenta: string | null; fecha_desde: Date; fecha_hasta: Date;
    moneda: string; original_name: string; total_movs: number; matched_movs: number;
    uploaded_by: number; created_at: Date;
  }>(
    `SELECT * FROM bank_statements ORDER BY created_at DESC LIMIT 100`,
  );
  return rows.map((s) => ({
    id: s.id,
    banco: s.banco,
    cuenta: s.cuenta,
    fecha_desde: s.fecha_desde.toISOString().slice(0, 10),
    fecha_hasta: s.fecha_hasta.toISOString().slice(0, 10),
    moneda: s.moneda,
    original_name: s.original_name,
    total_movs: s.total_movs,
    matched_movs: s.matched_movs,
    uploaded_by: s.uploaded_by,
    created_at: s.created_at.toISOString(),
  }));
}

export async function listMovements(statementId: number, onlyUnmatched = false): Promise<BankMovementPublic[]> {
  const params: unknown[] = [statementId];
  let where = `WHERE statement_id = $1`;
  if (onlyUnmatched) where += ` AND matched_payment_id IS NULL AND tipo = 'C'`;
  const { rows } = await pool.query<{
    id: number; statement_id: number; fecha: Date; referencia: string | null; descripcion: string | null;
    monto: string; tipo: 'C' | 'D'; moneda: string; matched_payment_id: number | null; raw_line: string | null;
  }>(
    `SELECT * FROM bank_statement_movements ${where} ORDER BY fecha DESC, id DESC LIMIT 500`,
    params,
  );
  return rows.map((m) => ({
    id: m.id,
    statement_id: m.statement_id,
    fecha: m.fecha.toISOString().slice(0, 10),
    referencia: m.referencia,
    descripcion: m.descripcion,
    monto: Number(m.monto),
    tipo: m.tipo,
    moneda: m.moneda,
    matched_payment_id: m.matched_payment_id,
    raw_line: m.raw_line,
  }));
}

/**
 * Para un movimiento sin match, sugiere pagos pending_confirmation que podrian
 * corresponderle por referencia parcial, monto similar, o fecha cercana.
 */
export async function suggestMatches(movementId: number): Promise<Array<{ payment_id: number; score: number; reason: string }>> {
  const { rows: movRows } = await pool.query<{ fecha: Date; referencia: string | null; monto: string; moneda: string }>(
    `SELECT fecha, referencia, monto, moneda FROM bank_statement_movements WHERE id = $1`,
    [movementId],
  );
  const mov = movRows[0];
  if (!mov) return [];
  const movMonto = Number(mov.monto);

  const { rows } = await pool.query<{ id: number; pagado_at: Date; referencia: string | null; monto: string; moneda: string }>(
    `SELECT id, pagado_at, referencia, monto, moneda
       FROM booking_payments
      WHERE status = 'pending_confirmation'
        AND bank_match_id IS NULL
        AND moneda = $1
        AND pagado_at BETWEEN $2::date - INTERVAL '7 days' AND $2::date + INTERVAL '1 day'
      ORDER BY pagado_at DESC
      LIMIT 50`,
    [mov.moneda, mov.fecha],
  );

  return rows
    .map((p) => {
      let score = 0;
      const reasons: string[] = [];
      if (mov.referencia && p.referencia && p.referencia === mov.referencia) {
        score += 60;
        reasons.push('referencia exacta');
      } else if (mov.referencia && p.referencia && (mov.referencia.endsWith(p.referencia) || p.referencia.endsWith(mov.referencia))) {
        score += 35;
        reasons.push('referencia parcial');
      }
      const pMonto = Number(p.monto);
      const diff = Math.abs(movMonto - pMonto) / Math.max(1, pMonto);
      if (diff < 0.001) { score += 30; reasons.push('monto exacto'); }
      else if (diff < 0.01) { score += 15; reasons.push('monto cercano'); }

      const diffDays = Math.abs(mov.fecha.getTime() - p.pagado_at.getTime()) / 86_400_000;
      if (diffDays < 1) { score += 10; reasons.push('mismo dia'); }
      else if (diffDays < 3) { score += 5; reasons.push('dias cercanos'); }

      return { payment_id: p.id, score, reason: reasons.join(' + ') };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// =============================================================================
// internals
// =============================================================================

async function tryAutoMatch(client: import('pg').PoolClient, mov: ParsedMovement, moneda: string): Promise<number | null> {
  if (!mov.referencia) return null;
  // Buscar pago con misma referencia exacta + monto similar + moneda + fecha cercana
  const { rows } = await client.query<{ id: number; monto: string; pagado_at: Date }>(
    `SELECT id, monto, pagado_at
       FROM booking_payments
      WHERE status = 'pending_confirmation'
        AND bank_match_id IS NULL
        AND referencia = $1
        AND moneda = $2
        AND pagado_at BETWEEN $3::date - INTERVAL '3 days' AND $3::date + INTERVAL '2 days'
      ORDER BY pagado_at DESC
      LIMIT 1`,
    [mov.referencia, moneda, mov.fecha],
  );
  const cand = rows[0];
  if (!cand) {
    // Intento 2: ultimos 6 digitos coinciden con la referencia
    if (mov.referencia.length >= 6) {
      const last6 = mov.referencia.slice(-6);
      const { rows: rows2 } = await client.query<{ id: number; monto: string; pagado_at: Date }>(
        `SELECT id, monto, pagado_at
           FROM booking_payments
          WHERE status = 'pending_confirmation'
            AND bank_match_id IS NULL
            AND moneda = $2
            AND referencia IS NOT NULL
            AND RIGHT(referencia, 6) = $1
            AND pagado_at BETWEEN $3::date - INTERVAL '3 days' AND $3::date + INTERVAL '2 days'
          ORDER BY pagado_at DESC
          LIMIT 1`,
        [last6, moneda, mov.fecha],
      );
      const cand2 = rows2[0];
      if (!cand2) return null;
      const diff = Math.abs(mov.monto - Number(cand2.monto));
      if (diff / Math.max(1, Number(cand2.monto)) > 0.01) return null;
      return cand2.id;
    }
    return null;
  }
  // Validar monto en margen
  const diff = Math.abs(mov.monto - Number(cand.monto));
  if (diff / Math.max(1, Number(cand.monto)) > 0.01) return null;
  return cand.id;
}
