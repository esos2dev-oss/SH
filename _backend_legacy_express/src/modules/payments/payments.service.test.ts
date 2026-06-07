// Tests unitarios del mapper toPublic y helpers puros.
// No requieren conexion a BD.

import { describe, it, expect } from 'vitest';
import { toPublic } from './payments.service.js';
import type { PaymentWithJoins } from './payments.types.js';

function fakePayment(overrides: Partial<PaymentWithJoins> = {}): PaymentWithJoins {
  return {
    id: 1,
    booking_id: 10,
    customer_id: null,
    monto: '150.00',
    moneda: 'VES',
    monto_base: '4.10',
    tasa_cambio: '36.5000',
    method: 'pago_movil',
    method_details: { kind: 'pago_movil', banco_emisor: '0134' },
    referencia: '987654',
    pagado_at: new Date('2026-05-16T14:30:00Z'),
    status: 'pending_confirmation',
    registered_by: 7,
    confirmed_by: null,
    confirmed_at: null,
    rejected_by: null,
    rejected_at: null,
    rejected_reason: null,
    reversed_by_id: null,
    ledger_entry_id: null,
    bank_match_id: null,
    receipt_url: null,
    receipt_mime: null,
    notas: null,
    created_at: new Date('2026-05-16T14:30:01Z'),
    booking_codigo: 'BK-2026-0010',
    booking_status: 'confirmada',
    customer_nombres: 'Juan',
    customer_apellidos: 'Perez',
    customer_telefono: '04141234567',
    customer_doc_numero: 'V12345678',
    ...overrides,
  };
}

describe('toPublic', () => {
  it('mapea pago con reserva y huesped (desde booking)', () => {
    const r = toPublic(fakePayment());
    expect(r.id).toBe(1);
    expect(r.booking).toEqual({ id: 10, codigo: 'BK-2026-0010', status: 'confirmada' });
    expect(r.customer?.nombre).toBe('Juan Perez');
    expect(r.customer?.telefono).toBe('04141234567');
    expect(r.monto).toBe(150);
    expect(r.monto_base).toBe(4.1);
    expect(r.tasa_cambio).toBe(36.5);
    expect(r.status).toBe('pending_confirmation');
    expect(r.pagado_at).toMatch(/^2026-05-16T14:30:00/);
  });

  it('mapea pago suelto (sin booking)', () => {
    const r = toPublic(fakePayment({
      booking_id: null,
      booking_codigo: null,
      booking_status: null,
      customer_id: 22,
    }));
    expect(r.booking).toBeNull();
    expect(r.customer).not.toBeNull();
  });

  it('convierte monto_base y tasa null a null', () => {
    const r = toPublic(fakePayment({
      monto_base: null,
      tasa_cambio: null,
    }));
    expect(r.monto_base).toBeNull();
    expect(r.tasa_cambio).toBeNull();
  });

  it('preserva referencia y method_details', () => {
    const r = toPublic(fakePayment({
      method: 'zelle',
      method_details: { kind: 'zelle', email_titular: 'a@b.com' },
      referencia: 'ZEL-99',
    }));
    expect(r.method).toBe('zelle');
    expect(r.method_details).toEqual({ kind: 'zelle', email_titular: 'a@b.com' });
    expect(r.referencia).toBe('ZEL-99');
  });

  it('expone confirmed_at e ISO string si confirmado', () => {
    const r = toPublic(fakePayment({
      status: 'confirmed',
      confirmed_at: new Date('2026-05-17T10:00:00Z'),
      confirmed_by: 9,
    }));
    expect(r.status).toBe('confirmed');
    expect(r.confirmed_at).toMatch(/^2026-05-17T10:00:00/);
  });

  it('expone rejected_at y reason si rechazado', () => {
    const r = toPublic(fakePayment({
      status: 'rejected',
      rejected_at: new Date('2026-05-17T11:00:00Z'),
      rejected_by: 3,
      rejected_reason: 'Referencia duplicada',
    }));
    expect(r.status).toBe('rejected');
    expect(r.rejected_reason).toBe('Referencia duplicada');
  });

  it('cuando no hay nombres del huesped, customer queda null', () => {
    const r = toPublic(fakePayment({
      customer_nombres: null,
      customer_apellidos: null,
      customer_telefono: null,
      customer_doc_numero: null,
    }));
    expect(r.customer).toBeNull();
  });
});
