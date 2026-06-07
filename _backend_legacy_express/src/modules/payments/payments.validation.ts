// Validacion Zod de pagos.
// Estrategia: discriminated union por method para enforce metadatos especificos
// (banco emisor en pago movil, email en zelle, voucher en POS, etc).

import { z } from 'zod';

export const PAYMENT_METHODS = [
  'efectivo',
  'tarjeta',
  'transferencia',
  'paypal',
  'otro',
  'pago_movil',
  'zelle',
  'punto_venta',
  'efectivo_usd',
  'efectivo_bs',
] as const;

export const PAYMENT_CONFIRMATION_STATUSES = ['pending_confirmation', 'confirmed', 'rejected'] as const;

export const VENEZUELAN_BANKS = [
  '0102', // Banco de Venezuela
  '0105', // Mercantil
  '0108', // Provincial
  '0114', // Bancaribe
  '0115', // Exterior
  '0128', // Caroni
  '0134', // Banesco
  '0137', // Sofitasa
  '0138', // Plaza
  '0151', // BFC
  '0156', // 100% Banco
  '0157', // DelSur
  '0163', // Tesoro
  '0166', // Agricola
  '0168', // Bancrecer
  '0169', // Mi Banco
  '0171', // Activo
  '0172', // Bancamiga
  '0174', // Banplus
  '0175', // Bicentenario
  '0177', // BANFANES
  '0191', // Nacional de Credito
] as const;

// =============================================================================
// Detalles por metodo (discriminated union)
// =============================================================================

const trimmedString = (max: number) => z.string().trim().min(1).max(max);

const pagoMovilDetails = z.object({
  kind: z.literal('pago_movil'),
  banco_emisor: z.enum(VENEZUELAN_BANKS).or(trimmedString(80)),
  titular_doc: trimmedString(20),
  titular_telefono: trimmedString(20),
});

const transferenciaDetails = z.object({
  kind: z.literal('transferencia'),
  banco_origen: trimmedString(80),
  banco_destino: trimmedString(80).optional(),
  titular_doc: trimmedString(20).optional(),
});

const zelleDetails = z.object({
  kind: z.literal('zelle'),
  email_titular: z.string().trim().email().max(150),
  titular_nombre: trimmedString(150).optional(),
});

const tarjetaDetails = z.object({
  kind: z.literal('tarjeta'),
  ultimos_4: z.string().regex(/^\d{4}$/),
  marca: trimmedString(30).optional(),
});

const puntoVentaDetails = z.object({
  kind: z.literal('punto_venta'),
  ultimos_4: z.string().regex(/^\d{4}$/).optional(),
  lote: trimmedString(20).optional(),
  voucher: trimmedString(50).optional(),
  banco_pos: trimmedString(80).optional(),
});

const efectivoDetails = z.object({
  kind: z.enum(['efectivo', 'efectivo_usd', 'efectivo_bs']),
  denominaciones: z.record(z.string(), z.coerce.number().int().nonnegative()).optional(),
});

const paypalDetails = z.object({
  kind: z.literal('paypal'),
  transaction_id: trimmedString(60).optional(),
  email_titular: z.string().trim().email().max(150).optional(),
});

const otroDetails = z.object({
  kind: z.literal('otro'),
  descripcion: trimmedString(200),
});

const methodDetailsSchema = z.discriminatedUnion('kind', [
  pagoMovilDetails,
  transferenciaDetails,
  zelleDetails,
  tarjetaDetails,
  puntoVentaDetails,
  efectivoDetails,
  paypalDetails,
  otroDetails,
]);

export type MethodDetails = z.infer<typeof methodDetailsSchema>;

// =============================================================================
// Schemas publicos
// =============================================================================

const isoDateTime = z.string().datetime({ offset: true });

export const createPaymentSchema = z
  .object({
    booking_id: z.coerce.number().int().positive().optional().nullable(),
    customer_id: z.coerce.number().int().positive().optional().nullable(),
    monto: z.coerce.number().positive(),
    moneda: z.string().trim().length(3).toUpperCase(),
    tasa_cambio: z.coerce.number().positive().optional().nullable(),
    method: z.enum(PAYMENT_METHODS),
    method_details: methodDetailsSchema.optional(),
    referencia: z.string().trim().max(100).optional().nullable(),
    pagado_at: isoDateTime.optional(),
    notas: z.string().trim().max(500).optional().nullable(),
    receipt_url: z.string().trim().url().optional().nullable(),
    receipt_mime: z.string().trim().max(100).optional().nullable(),
    force_status: z.enum(PAYMENT_CONFIRMATION_STATUSES).optional(),
  })
  .refine(
    (d) => d.booking_id !== null && d.booking_id !== undefined || (d.customer_id !== null && d.customer_id !== undefined),
    { message: 'Debe asociarse a una reserva o a un huesped', path: ['booking_id'] },
  )
  .refine(
    (d) => {
      if (!d.method_details) return true;
      // method_details.kind debe ser consistente con method
      const m = d.method;
      const k = d.method_details.kind;
      if (m === 'pago_movil') return k === 'pago_movil';
      if (m === 'transferencia') return k === 'transferencia';
      if (m === 'zelle') return k === 'zelle';
      if (m === 'tarjeta') return k === 'tarjeta';
      if (m === 'punto_venta') return k === 'punto_venta';
      if (m === 'efectivo' || m === 'efectivo_usd' || m === 'efectivo_bs') return k === 'efectivo' || k === 'efectivo_usd' || k === 'efectivo_bs';
      if (m === 'paypal') return k === 'paypal';
      if (m === 'otro') return k === 'otro';
      return false;
    },
    { message: 'method_details.kind no coincide con method', path: ['method_details', 'kind'] },
  )
  .refine(
    (d) => {
      // Pago movil exige method_details
      if (d.method === 'pago_movil' && !d.method_details) return false;
      return true;
    },
    { message: 'Pago movil requiere banco emisor, cedula y telefono del titular', path: ['method_details'] },
  );

export const updatePaymentSchema = z.object({
  notas: z.string().trim().max(500).optional().nullable(),
  referencia: z.string().trim().max(100).optional().nullable(),
});

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const listPaymentsQuerySchema = z.object({
  status: z.enum(PAYMENT_CONFIRMATION_STATUSES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  booking_id: z.coerce.number().int().positive().optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const lookupQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});

export const exchangeRateUpsertSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bs_per_usd: z.coerce.number().positive(),
  source: z.enum(['manual', 'bcv']).default('manual'),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type LookupQuery = z.infer<typeof lookupQuerySchema>;
export type ExchangeRateUpsertInput = z.infer<typeof exchangeRateUpsertSchema>;
