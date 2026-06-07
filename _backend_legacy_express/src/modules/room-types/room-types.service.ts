import { Errors } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import * as model from './room-types.model.js';
import type {
  CreateRoomTypeInput,
  ListRoomTypesQuery,
  UpdateRoomTypeInput,
} from './room-types.validation.js';
import type { RoomTypeRow } from './room-types.types.js';

export interface RoomTypePublic {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  capacidad: number;
  tarifa_dia: number;
  tarifa_semana: number | null;
  tarifa_mes: number | null;
  moneda: string;
  amenities: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

function toPublic(r: RoomTypeRow): RoomTypePublic {
  return {
    id: r.id,
    nombre: r.nombre,
    slug: r.slug,
    descripcion: r.descripcion,
    capacidad: r.capacidad,
    tarifa_dia: Number(r.tarifa_dia),
    tarifa_semana: r.tarifa_semana === null ? null : Number(r.tarifa_semana),
    tarifa_mes: r.tarifa_mes === null ? null : Number(r.tarifa_mes),
    moneda: r.moneda,
    amenities: r.amenities,
    active: r.active,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

export async function list(filters: ListRoomTypesQuery): Promise<RoomTypePublic[]> {
  const items = await model.list(filters);
  return items.map(toPublic);
}

export async function getById(id: number): Promise<RoomTypePublic> {
  const r = await model.findById(id);
  if (!r) throw Errors.notFound('Tipo de habitacion no encontrado');
  return toPublic(r);
}

export async function create(input: CreateRoomTypeInput, actorId: number): Promise<RoomTypePublic> {
  if (await model.slugExists(input.slug)) {
    throw Errors.conflict('Ya existe un tipo de habitacion con ese slug');
  }
  const created = await model.create(input);
  await logAudit({
    userId: actorId,
    action: 'create',
    entity: 'room_types',
    entityId: created.id,
    after: { nombre: created.nombre, slug: created.slug, tarifa_dia: created.tarifa_dia },
  });
  return toPublic(created);
}

export async function update(id: number, input: UpdateRoomTypeInput, actorId: number): Promise<RoomTypePublic> {
  const before = await model.findById(id);
  if (!before) throw Errors.notFound('Tipo de habitacion no encontrado');
  if (input.slug && (await model.slugExists(input.slug, id))) {
    throw Errors.conflict('Ya existe otro tipo con ese slug');
  }
  const updated = await model.update(id, input);
  if (!updated) throw Errors.notFound('Tipo de habitacion no encontrado');
  await logAudit({
    userId: actorId,
    action: 'update',
    entity: 'room_types',
    entityId: id,
    before: { nombre: before.nombre, tarifa_dia: before.tarifa_dia, active: before.active },
    after: { nombre: updated.nombre, tarifa_dia: updated.tarifa_dia, active: updated.active },
  });
  return toPublic(updated);
}

export async function softDelete(id: number, actorId: number): Promise<void> {
  if (await model.hasRooms(id)) {
    throw Errors.conflict('No se puede desactivar: hay habitaciones asociadas');
  }
  const ok = await model.softDelete(id);
  if (!ok) throw Errors.notFound('Tipo no encontrado o ya inactivo');
  await logAudit({ userId: actorId, action: 'delete', entity: 'room_types', entityId: id });
}
