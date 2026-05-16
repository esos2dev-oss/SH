import { api } from '../../../shared/api/client';

export interface CheckIn {
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

export const getCheckIn = (bookingId: number) => api.get<CheckIn | null>(`/api/check-ins/${bookingId}`);

export async function createCheckIn(data: {
  booking_id: number;
  observaciones?: string | null;
  huespedes_acompaniantes?: Array<Record<string, unknown>>;
  documento?: File;
  firma?: File;
}): Promise<CheckIn> {
  const fd = new FormData();
  fd.append('booking_id', String(data.booking_id));
  if (data.observaciones) fd.append('observaciones', data.observaciones);
  fd.append('huespedes_acompaniantes', JSON.stringify(data.huespedes_acompaniantes ?? []));
  if (data.documento) fd.append('documento', data.documento);
  if (data.firma) fd.append('firma', data.firma);
  return api.post<CheckIn>('/api/check-ins', fd, { isFormData: true });
}

export const checkOut = (bookingId: number, observaciones?: string | null) =>
  api.post<CheckIn>(`/api/check-ins/${bookingId}/checkout`, { observaciones });

export const documentoUrl = (bookingId: number) =>
  api.get<{ url: string }>(`/api/check-ins/${bookingId}/documento`);
