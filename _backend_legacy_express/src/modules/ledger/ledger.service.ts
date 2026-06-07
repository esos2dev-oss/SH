import { withTransaction } from '../../shared/config/db.js';
import { Errors } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { nextCode } from '../../shared/services/code-generator.service.js';
import * as model from './ledger.model.js';
import type { CreateLedgerInput, ListLedgerQuery, SummaryQuery } from './ledger.validation.js';
import type { LedgerEntryWithJoins } from './ledger.types.js';

export interface LedgerPublic {
  id: number;
  codigo: string;
  type: string;
  category: { id: number; nombre: string; slug: string };
  fecha: string;
  descripcion: string;
  monto: number;
  moneda: string;
  method: string | null;
  booking: { id: number; codigo: string } | null;
  customer: { id: number; nombre: string } | null;
  reverses_id: number | null;
  status: string;
  registered_by: number;
  receipts_count: number;
  created_at: string;
}

function toPublic(l: LedgerEntryWithJoins): LedgerPublic {
  return {
    id: l.id,
    codigo: l.codigo,
    type: l.type,
    category: { id: l.category_id, nombre: l.category_nombre, slug: l.category_slug },
    fecha: l.fecha.toISOString().slice(0, 10),
    descripcion: l.descripcion,
    monto: Number(l.monto),
    moneda: l.moneda,
    method: l.method,
    booking: l.booking_id !== null && l.booking_codigo !== null ? { id: l.booking_id, codigo: l.booking_codigo } : null,
    customer: l.customer_id !== null && l.customer_nombre !== null ? { id: l.customer_id, nombre: l.customer_nombre } : null,
    reverses_id: l.reverses_id,
    status: l.status,
    registered_by: l.registered_by,
    receipts_count: Number(l.receipts_count ?? 0),
    created_at: l.created_at.toISOString(),
  };
}

export async function list(filters: ListLedgerQuery): Promise<{ items: LedgerPublic[]; total: number }> {
  const r = await model.list(filters);
  return { items: r.items.map(toPublic), total: r.total };
}

export async function getById(id: number): Promise<LedgerPublic> {
  const l = await model.findById(id);
  if (!l) throw Errors.notFound('Asiento no encontrado');
  return toPublic(l);
}

export async function create(input: CreateLedgerInput, actorId: number): Promise<LedgerPublic> {
  return withTransaction(async (client) => {
    // Verificar categoria
    const { rows: catRows } = await client.query<{ type: string; active: boolean }>(
      `SELECT type, active FROM ledger_categories WHERE id = $1`,
      [input.category_id],
    );
    const cat = catRows[0];
    if (!cat) throw Errors.notFound('Categoria no encontrada');
    if (!cat.active) throw Errors.validation('Categoria inactiva');
    if (cat.type !== input.type) throw Errors.validation(`La categoria es de tipo ${cat.type}, no ${input.type}`);

    const codigo = await nextCode('LG', new Date(input.fecha).getFullYear(), client);
    const inserted = await model.insert({ codigo, input, registered_by: actorId }, client);
    await logAudit(
      {
        userId: actorId,
        action: 'create',
        entity: 'ledger_entries',
        entityId: inserted.id,
        after: { codigo, type: input.type, monto: input.monto, category_id: input.category_id },
      },
      client,
    );
    const full = await model.findById(inserted.id, client);
    if (!full) throw Errors.internal();
    return toPublic(full);
  });
}

export async function conciliar(id: number, actorId: number): Promise<LedgerPublic> {
  const before = await model.findById(id);
  if (!before) throw Errors.notFound();
  if (before.status === 'conciliado') throw Errors.validation('Ya esta conciliado');
  await model.setStatus(id, 'conciliado');
  const full = await model.findById(id);
  if (!full) throw Errors.internal();
  await logAudit({ userId: actorId, action: 'update', entity: 'ledger_entries', entityId: id, after: { status: 'conciliado' } });
  return toPublic(full);
}

export async function summary(q: SummaryQuery) {
  return model.summary(q);
}
