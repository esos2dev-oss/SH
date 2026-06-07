import { Errors } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import type { Role } from '../../shared/types/auth.js';
import * as model from './rooms.model.js';
import type {
  CreateRoomInput,
  ListRoomsQuery,
  UpdateRoomInput,
  UpdateStatusInput,
} from './rooms.validation.js';
import type { RoomStatus, RoomWithType, OccupancySummary } from './rooms.types.js';

export interface RoomPublic {
  id: number;
  numero: string;
  planta: string | null;
  status: RoomStatus;
  notas: string | null;
  photo_url: string | null;
  active: boolean;
  room_type: {
    id: number;
    nombre: string;
    slug: string;
    tarifa_dia: number;
    capacidad: number;
  };
  created_at: string;
  updated_at: string;
}

function toPublic(r: RoomWithType): RoomPublic {
  return {
    id: r.id,
    numero: r.numero,
    planta: r.planta,
    status: r.status,
    notas: r.notas,
    photo_url: r.photo_url,
    active: r.active,
    room_type: {
      id: r.room_type_id,
      nombre: r.room_type_nombre,
      slug: r.room_type_slug,
      tarifa_dia: Number(r.tarifa_dia),
      capacidad: r.capacidad,
    },
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

export async function list(filters: ListRoomsQuery): Promise<RoomPublic[]> {
  const items = await model.list(filters);
  return items.map(toPublic);
}

export async function getById(id: number): Promise<RoomPublic> {
  const r = await model.findById(id);
  if (!r) throw Errors.notFound('Habitacion no encontrada');
  return toPublic(r);
}

export async function create(input: CreateRoomInput, actorId: number): Promise<RoomPublic> {
  if (await model.numeroExists(input.numero)) {
    throw Errors.conflict('Ya existe una habitacion con ese numero');
  }
  const created = await model.create(input);
  await logAudit({ userId: actorId, action: 'create', entity: 'rooms', entityId: created.id, after: { numero: created.numero } });
  const full = await model.findById(created.id);
  if (!full) throw Errors.internal();
  return toPublic(full);
}

export async function update(id: number, input: UpdateRoomInput, actorId: number): Promise<RoomPublic> {
  const before = await model.findById(id);
  if (!before) throw Errors.notFound('Habitacion no encontrada');
  if (input.numero && (await model.numeroExists(input.numero, id))) {
    throw Errors.conflict('Ya existe otra habitacion con ese numero');
  }
  const updated = await model.update(id, input);
  if (!updated) throw Errors.notFound();
  const full = await model.findById(id);
  if (!full) throw Errors.internal();
  await logAudit({
    userId: actorId,
    action: 'update',
    entity: 'rooms',
    entityId: id,
    before: { numero: before.numero, status: before.status, active: before.active },
    after: { numero: updated.numero, status: updated.status, active: updated.active },
  });
  return toPublic(full);
}

const ALLOWED_TRANSITIONS: Record<Role, RoomStatus[]> = {
  superadmin: ['disponible', 'ocupada', 'limpieza', 'mantenimiento', 'fuera_servicio'],
  admin: ['disponible', 'ocupada', 'limpieza', 'mantenimiento', 'fuera_servicio'],
  recepcion: ['disponible', 'ocupada', 'limpieza', 'mantenimiento'],
  limpieza: ['disponible', 'limpieza'],
  contabilidad: [],
};

export async function updateStatus(
  id: number,
  input: UpdateStatusInput,
  actor: { id: number; role: Role },
): Promise<RoomPublic> {
  const allowed = ALLOWED_TRANSITIONS[actor.role];
  if (!allowed.includes(input.status)) {
    throw Errors.forbidden(`Tu rol (${actor.role}) no puede cambiar a status '${input.status}'`);
  }
  const before = await model.findById(id);
  if (!before) throw Errors.notFound('Habitacion no encontrada');

  // Limpieza solo puede cambiar de 'limpieza' a 'disponible'
  if (actor.role === 'limpieza' && before.status !== 'limpieza') {
    throw Errors.forbidden('Solo puedes marcar como disponible habitaciones que estan en limpieza');
  }
  if (actor.role === 'limpieza' && input.status !== 'disponible') {
    throw Errors.forbidden('Solo puedes marcar como disponible');
  }

  const updated = await model.updateStatus(id, input.status, input.notas ?? null);
  if (!updated) throw Errors.internal();
  await logAudit({
    userId: actor.id,
    action: 'status_change',
    entity: 'rooms',
    entityId: id,
    before: { status: before.status },
    after: { status: input.status },
  });
  const full = await model.findById(id);
  if (!full) throw Errors.internal();
  return toPublic(full);
}

export async function softDelete(id: number, actorId: number): Promise<void> {
  if (await model.hasActiveBookings(id)) {
    throw Errors.conflict('No se puede desactivar: tiene reservas activas');
  }
  const ok = await model.softDelete(id);
  if (!ok) throw Errors.notFound('Habitacion no encontrada o ya inactiva');
  await logAudit({ userId: actorId, action: 'delete', entity: 'rooms', entityId: id });
}

export async function getOccupancy(): Promise<OccupancySummary> {
  return model.occupancySummary();
}
