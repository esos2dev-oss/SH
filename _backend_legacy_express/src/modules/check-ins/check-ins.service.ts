import { withTransaction } from '../../shared/config/db.js';
import { Errors } from '../../shared/utils/app-error.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { uploadObject, buildKey, getPresignedGetUrl } from '../../shared/services/r2.service.js';
import { r2Configured } from '../../shared/config/r2.js';
import { logger } from '../../shared/utils/logger.js';
import * as model from './check-ins.model.js';
import type { CheckInRow } from './check-ins.types.js';
import type { CreateCheckInInput, CheckOutInput } from './check-ins.validation.js';

export interface CheckInPublic {
  id: number;
  booking_id: number;
  hora_entrada: string;
  hora_salida: string | null;
  firma_url: string | null;
  documento_url: string | null;
  huespedes_acompaniantes: Array<Record<string, unknown>>;
  observaciones: string | null;
  registered_by: number;
  checked_out_by: number | null;
  created_at: string;
  updated_at: string;
}

function toPublic(c: CheckInRow): CheckInPublic {
  return {
    id: c.id,
    booking_id: c.booking_id,
    hora_entrada: c.hora_entrada.toISOString(),
    hora_salida: c.hora_salida ? c.hora_salida.toISOString() : null,
    firma_url: c.firma_url,
    documento_url: c.documento_url,
    huespedes_acompaniantes: c.huespedes_acompaniantes,
    observaciones: c.observaciones,
    registered_by: c.registered_by,
    checked_out_by: c.checked_out_by,
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  };
}

export async function getByBookingId(bookingId: number): Promise<CheckInPublic | null> {
  const c = await model.findByBookingId(bookingId);
  return c ? toPublic(c) : null;
}

export async function checkIn(
  input: CreateCheckInInput,
  documento: Express.Multer.File | undefined,
  firma: Express.Multer.File | undefined,
  actorId: number,
): Promise<CheckInPublic> {
  return withTransaction(async (client) => {
    // Validar booking
    const { rows: bRows } = await client.query<{ id: number; status: string; room_id: number }>(
      `SELECT id, status, room_id FROM bookings WHERE id = $1`,
      [input.booking_id],
    );
    const booking = bRows[0];
    if (!booking) throw Errors.notFound('Reserva no encontrada');
    if (!['pendiente', 'confirmada'].includes(booking.status)) {
      throw Errors.validation(`No se puede hacer check-in en reserva con status ${booking.status}`);
    }
    const existing = await model.findByBookingId(input.booking_id, client);
    if (existing) throw Errors.conflict('Ya existe check-in para esta reserva');

    // Subir archivos a R2 (best effort si no esta configurado)
    let documento_url: string | null = null;
    let firma_url: string | null = null;
    if (r2Configured) {
      if (documento) {
        const key = buildKey(`check-ins/${input.booking_id}/documento`, documento.originalname);
        await uploadObject({ key, buffer: documento.buffer, contentType: documento.mimetype });
        documento_url = key;
      }
      if (firma) {
        const key = buildKey(`check-ins/${input.booking_id}/firma`, firma.originalname);
        await uploadObject({ key, buffer: firma.buffer, contentType: firma.mimetype });
        firma_url = key;
      }
    } else if (documento || firma) {
      logger.warn('R2 no configurado — archivos de check-in no se almacenaron');
    }

    const checkIn = await model.insert(
      {
        booking_id: input.booking_id,
        documento_url,
        firma_url,
        huespedes_acompaniantes: input.huespedes_acompaniantes,
        observaciones: input.observaciones ?? null,
        registered_by: actorId,
      },
      client,
    );

    // booking → en_curso, room → ocupada
    await client.query(`UPDATE bookings SET status = 'en_curso' WHERE id = $1`, [input.booking_id]);
    await client.query(`UPDATE rooms SET status = 'ocupada' WHERE id = $1`, [booking.room_id]);

    await logAudit(
      {
        userId: actorId,
        action: 'create',
        entity: 'check_ins',
        entityId: checkIn.id,
        after: { booking_id: input.booking_id, room_id: booking.room_id },
      },
      client,
    );

    return toPublic(checkIn);
  });
}

export async function checkOut(bookingId: number, input: CheckOutInput, actorId: number): Promise<CheckInPublic> {
  return withTransaction(async (client) => {
    const { rows: bRows } = await client.query<{ id: number; status: string; room_id: number }>(
      `SELECT id, status, room_id FROM bookings WHERE id = $1`,
      [bookingId],
    );
    const booking = bRows[0];
    if (!booking) throw Errors.notFound('Reserva no encontrada');
    if (booking.status !== 'en_curso') {
      throw Errors.validation('La reserva no esta en curso');
    }
    const updated = await model.checkout(bookingId, { checked_out_by: actorId, observaciones: input.observaciones ?? null }, client);
    if (!updated) throw Errors.notFound('Check-in no encontrado');

    await client.query(`UPDATE bookings SET status = 'finalizada' WHERE id = $1`, [bookingId]);
    await client.query(`UPDATE rooms SET status = 'limpieza' WHERE id = $1`, [booking.room_id]);

    await logAudit(
      {
        userId: actorId,
        action: 'status_change',
        entity: 'check_ins',
        entityId: updated.id,
        after: { booking_id: bookingId, room_id: booking.room_id, status: 'finalizada' },
      },
      client,
    );

    return toPublic(updated);
  });
}

export async function getDocumentoUrl(bookingId: number): Promise<{ url: string }> {
  const c = await model.findByBookingId(bookingId);
  if (!c) throw Errors.notFound('Check-in no encontrado');
  if (!c.documento_url) throw Errors.notFound('No hay documento adjunto');
  return { url: await getPresignedGetUrl(c.documento_url, 900) };
}
