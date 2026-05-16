// Tests unitarios de validacion Zod del modulo payments.
// No requieren conexion a BD.

import { describe, it, expect } from 'vitest';
import {
  createPaymentSchema,
  rejectPaymentSchema,
  listPaymentsQuerySchema,
  exchangeRateUpsertSchema,
  VENEZUELAN_BANKS,
} from './payments.validation.js';

describe('createPaymentSchema', () => {
  it('acepta pago_movil completo', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 12,
      monto: 150.5,
      moneda: 'VES',
      method: 'pago_movil',
      method_details: {
        kind: 'pago_movil',
        banco_emisor: '0134',
        titular_doc: 'V12345678',
        titular_telefono: '04141234567',
      },
      referencia: '987654',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza pago_movil sin method_details', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 1,
      monto: 100,
      moneda: 'VES',
      method: 'pago_movil',
    });
    expect(r.success).toBe(false);
  });

  it('rechaza si method_details.kind no coincide con method', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 1,
      monto: 50,
      moneda: 'USD',
      method: 'pago_movil',
      method_details: { kind: 'zelle', email_titular: 'a@b.com' },
    });
    expect(r.success).toBe(false);
  });

  it('rechaza si no hay booking_id ni customer_id', () => {
    const r = createPaymentSchema.safeParse({
      monto: 20,
      moneda: 'USD',
      method: 'efectivo',
    });
    expect(r.success).toBe(false);
  });

  it('acepta pago suelto con customer_id', () => {
    const r = createPaymentSchema.safeParse({
      customer_id: 5,
      monto: 80,
      moneda: 'USD',
      method: 'efectivo',
    });
    expect(r.success).toBe(true);
  });

  it('coerciona moneda a uppercase', () => {
    const r = createPaymentSchema.parse({
      booking_id: 1,
      monto: 10,
      moneda: 'usd',
      method: 'efectivo',
    });
    expect(r.moneda).toBe('USD');
  });

  it('acepta zelle con email valido', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 3,
      monto: 50,
      moneda: 'USD',
      method: 'zelle',
      method_details: { kind: 'zelle', email_titular: 'cliente@example.com' },
    });
    expect(r.success).toBe(true);
  });

  it('rechaza zelle con email invalido', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 3,
      monto: 50,
      moneda: 'USD',
      method: 'zelle',
      method_details: { kind: 'zelle', email_titular: 'no-es-email' },
    });
    expect(r.success).toBe(false);
  });

  it('acepta punto_venta con voucher pero sin ultimos_4', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 7,
      monto: 35.5,
      moneda: 'USD',
      method: 'punto_venta',
      method_details: { kind: 'punto_venta', voucher: 'V-001', banco_pos: 'Banesco' },
    });
    expect(r.success).toBe(true);
  });

  it('rechaza tarjeta sin ultimos_4 obligatorios', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 1,
      monto: 100,
      moneda: 'USD',
      method: 'tarjeta',
      method_details: { kind: 'tarjeta' },
    });
    expect(r.success).toBe(false);
  });

  it('rechaza tarjeta con ultimos_4 no numericos', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 1,
      monto: 100,
      moneda: 'USD',
      method: 'tarjeta',
      method_details: { kind: 'tarjeta', ultimos_4: 'ABCD' },
    });
    expect(r.success).toBe(false);
  });

  it('exige monto positivo', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 1,
      monto: 0,
      moneda: 'USD',
      method: 'efectivo',
    });
    expect(r.success).toBe(false);
  });

  it('acepta efectivo con denominaciones', () => {
    const r = createPaymentSchema.safeParse({
      booking_id: 1,
      monto: 100,
      moneda: 'USD',
      method: 'efectivo_usd',
      method_details: { kind: 'efectivo_usd', denominaciones: { '20': 4, '10': 2 } },
    });
    expect(r.success).toBe(true);
  });

  it('incluye bancos venezolanos comunes', () => {
    expect(VENEZUELAN_BANKS).toContain('0134'); // Banesco
    expect(VENEZUELAN_BANKS).toContain('0102'); // BDV
    expect(VENEZUELAN_BANKS).toContain('0105'); // Mercantil
  });
});

describe('rejectPaymentSchema', () => {
  it('exige reason', () => {
    expect(rejectPaymentSchema.safeParse({}).success).toBe(false);
    expect(rejectPaymentSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(rejectPaymentSchema.safeParse({ reason: 'Referencia duplicada' }).success).toBe(true);
  });
});

describe('listPaymentsQuerySchema', () => {
  it('aplica defaults de page/limit', () => {
    const r = listPaymentsQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
  });

  it('rechaza limit > 100', () => {
    expect(listPaymentsQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it('acepta filtros por status y method', () => {
    const r = listPaymentsQuerySchema.parse({ status: 'pending_confirmation', method: 'pago_movil' });
    expect(r.status).toBe('pending_confirmation');
    expect(r.method).toBe('pago_movil');
  });
});

describe('exchangeRateUpsertSchema', () => {
  it('default source es manual', () => {
    const r = exchangeRateUpsertSchema.parse({ bs_per_usd: 36.5 });
    expect(r.source).toBe('manual');
  });

  it('rechaza tasa <= 0', () => {
    expect(exchangeRateUpsertSchema.safeParse({ bs_per_usd: 0 }).success).toBe(false);
    expect(exchangeRateUpsertSchema.safeParse({ bs_per_usd: -1 }).success).toBe(false);
  });

  it('rechaza fecha mal formada', () => {
    expect(exchangeRateUpsertSchema.safeParse({ bs_per_usd: 30, fecha: '15/03/2026' }).success).toBe(false);
  });

  it('acepta fecha ISO', () => {
    expect(exchangeRateUpsertSchema.safeParse({ bs_per_usd: 30, fecha: '2026-05-16' }).success).toBe(true);
  });
});
