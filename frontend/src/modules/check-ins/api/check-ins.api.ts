import { supabase, invokeFunction } from '../../../shared/lib/supabase';

export interface CheckIn {
  id: number;
  booking_id: number;
  hora_entrada: string;
  hora_salida: string | null;
  firma_url: string | null;
  documento_url: string | null;
  huespedes_acompaniantes: Array<Record<string, unknown>>;
  observaciones: string | null;
  registered_by: string;
  checked_out_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getCheckIn(bookingId: number): Promise<CheckIn | null> {
  const { data, error } = await supabase.from('check_ins').select('*').eq('booking_id', bookingId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as CheckIn | null;
}

export async function createCheckIn(data: {
  booking_id: number;
  observaciones?: string | null;
  huespedes_acompaniantes?: Array<Record<string, unknown>>;
  documento?: File;
  firma?: File;
}): Promise<CheckIn> {
  let documento_url: string | null = null;
  let firma_url: string | null = null;
  const folder = `bookings/${data.booking_id}`;

  if (data.documento) {
    const path = `${folder}/documento-${Date.now()}-${data.documento.name}`;
    const { error } = await supabase.storage.from('check-in-docs').upload(path, data.documento, { upsert: false });
    if (error) throw new Error(error.message);
    documento_url = path;
  }
  if (data.firma) {
    const path = `${folder}/firma-${Date.now()}-${data.firma.name}`;
    const { error } = await supabase.storage.from('check-in-docs').upload(path, data.firma, { upsert: false });
    if (error) throw new Error(error.message);
    firma_url = path;
  }

  await invokeFunction('booking-checkin', {
    booking_id: data.booking_id,
    documento_url,
    firma_url,
    huespedes_acompaniantes: data.huespedes_acompaniantes ?? [],
    observaciones: data.observaciones ?? null,
  } as Record<string, unknown>);

  const ci = await getCheckIn(data.booking_id);
  if (!ci) throw new Error('No se pudo crear el check-in');
  return ci;
}

export async function checkOut(bookingId: number, observaciones?: string | null): Promise<CheckIn> {
  if (observaciones !== undefined && observaciones !== null) {
    await supabase.from('check_ins').update({ observaciones }).eq('booking_id', bookingId);
  }
  await invokeFunction('booking-checkout', { booking_id: bookingId } as Record<string, unknown>);
  const ci = await getCheckIn(bookingId);
  if (!ci) throw new Error('Check-in no encontrado');
  return ci;
}

export async function documentoUrl(bookingId: number): Promise<{ url: string }> {
  const ci = await getCheckIn(bookingId);
  if (!ci?.documento_url) throw new Error('Sin documento');
  const { data, error } = await supabase.storage.from('check-in-docs').createSignedUrl(ci.documento_url, 60 * 15);
  if (error) throw new Error(error.message);
  return { url: data.signedUrl };
}
