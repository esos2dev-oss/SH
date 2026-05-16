import { Errors } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import * as model from './customers.model.js';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customers.validation.js';
import type { CustomerWithStats } from './customers.types.js';

export interface CustomerPublic {
  id: number;
  nombres: string;
  apellidos: string;
  doc_kind: string;
  doc_numero: string;
  email: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  nacionalidad: string | null;
  direccion: string | null;
  preferencias: Record<string, unknown>;
  notas: string | null;
  accepts_marketing: boolean;
  active: boolean;
  total_estancias: number;
  total_gastado: number;
  created_at: string;
  updated_at: string;
}

function toPublic(c: CustomerWithStats): CustomerPublic {
  return {
    id: c.id,
    nombres: c.nombres,
    apellidos: c.apellidos,
    doc_kind: c.doc_kind,
    doc_numero: c.doc_numero,
    email: c.email,
    telefono: c.telefono,
    fecha_nacimiento: c.fecha_nacimiento ? c.fecha_nacimiento.toISOString().slice(0, 10) : null,
    nacionalidad: c.nacionalidad,
    direccion: c.direccion,
    preferencias: c.preferencias,
    notas: c.notas,
    accepts_marketing: c.accepts_marketing,
    active: c.active,
    total_estancias: Number(c.total_estancias ?? 0),
    total_gastado: Number(c.total_gastado ?? 0),
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  };
}

export async function list(filters: ListCustomersQuery): Promise<{ items: CustomerPublic[]; total: number }> {
  const result = await model.list(filters);
  return { items: result.items.map(toPublic), total: result.total };
}

export async function getById(id: number): Promise<CustomerPublic> {
  const c = await model.findById(id);
  if (!c) throw Errors.notFound('Huesped no encontrado');
  return toPublic(c);
}

export async function create(input: CreateCustomerInput, actorId: number): Promise<CustomerPublic> {
  if (await model.docExists(input.doc_kind, input.doc_numero)) {
    throw Errors.conflict('Ya existe un huesped con ese documento');
  }
  const created = await model.create(input);
  const full = await model.findById(created.id);
  if (!full) throw Errors.internal();
  await logAudit({
    userId: actorId,
    action: 'create',
    entity: 'customers',
    entityId: created.id,
    after: { nombres: created.nombres, apellidos: created.apellidos, email: created.email },
  });
  return toPublic(full);
}

export async function update(id: number, input: UpdateCustomerInput, actorId: number): Promise<CustomerPublic> {
  const before = await model.findById(id);
  if (!before) throw Errors.notFound('Huesped no encontrado');
  if (input.doc_kind && input.doc_numero && (await model.docExists(input.doc_kind, input.doc_numero, id))) {
    throw Errors.conflict('Ya existe otro huesped con ese documento');
  }
  await model.update(id, input);
  const full = await model.findById(id);
  if (!full) throw Errors.internal();
  await logAudit({
    userId: actorId,
    action: 'update',
    entity: 'customers',
    entityId: id,
    before: { nombres: before.nombres, email: before.email, active: before.active },
    after: { nombres: full.nombres, email: full.email, active: full.active },
  });
  return toPublic(full);
}

export async function softDelete(id: number, actorId: number): Promise<void> {
  if (await model.hasActiveBookings(id)) {
    throw Errors.conflict('No se puede desactivar: tiene reservas activas');
  }
  const ok = await model.softDelete(id);
  if (!ok) throw Errors.notFound();
  await logAudit({ userId: actorId, action: 'delete', entity: 'customers', entityId: id });
}

export async function timeline(id: number) {
  const exists = await model.findById(id);
  if (!exists) throw Errors.notFound('Huesped no encontrado');
  return model.timeline(id);
}
