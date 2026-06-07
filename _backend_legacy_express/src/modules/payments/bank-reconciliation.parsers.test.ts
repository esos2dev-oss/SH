// Tests unitarios de los parsers de extractos bancarios.

import { describe, it, expect } from 'vitest';
import { parseBanesco, parseVenezuela, parseGeneric, parseByBank } from './bank-reconciliation.parsers.js';

describe('parseBanesco', () => {
  it('parsea CSV con cargo/abono', () => {
    const csv = `Fecha;Referencia;Descripcion;Cargo;Abono;Saldo
15/05/2026;000123456;PAGO MOVIL RECIBIDO;0,00;1.500,00;15.500,00
16/05/2026;000123457;TRANSFERENCIA ENVIADA;2.000,00;0,00;13.500,00`;
    const r = parseBanesco(csv);
    expect(r.movements).toHaveLength(2);
    const m1 = r.movements[0]!;
    expect(m1.fecha).toBe('2026-05-15');
    expect(m1.referencia).toBe('000123456');
    expect(m1.monto).toBe(1500);
    expect(m1.tipo).toBe('C');
    const m2 = r.movements[1]!;
    expect(m2.monto).toBe(2000);
    expect(m2.tipo).toBe('D');
  });

  it('parsea CSV con columna Monto + Tipo', () => {
    const csv = `Fecha,Referencia,Monto,Tipo
20/05/2026,REF999,1234.56,ABONO
21/05/2026,REF1000,-50.00,DEBITO`;
    const r = parseBanesco(csv);
    expect(r.movements).toHaveLength(2);
    expect(r.movements[0]!.tipo).toBe('C');
    expect(r.movements[0]!.monto).toBe(1234.56);
    expect(r.movements[1]!.tipo).toBe('D');
    expect(r.movements[1]!.monto).toBe(50);
  });

  it('extrae rango de fechas correcto', () => {
    const csv = `Fecha;Referencia;Monto;Tipo
01/05/2026;A;100;C
15/05/2026;B;200;C
03/05/2026;C;50;D`;
    const r = parseBanesco(csv);
    expect(r.fecha_desde).toBe('2026-05-01');
    expect(r.fecha_hasta).toBe('2026-05-15');
  });

  it('ignora lineas sin fecha valida', () => {
    const csv = `Fecha;Referencia;Monto;Tipo
TOTAL GENERAL;-;1000;
15/05/2026;OK;100;C`;
    const r = parseBanesco(csv);
    expect(r.movements).toHaveLength(1);
    expect(r.movements[0]!.referencia).toBe('OK');
  });

  it('tolera valores con punto miles y coma decimal', () => {
    const csv = `Fecha;Referencia;Monto;Tipo
15/05/2026;A;1.234.567,89;C`;
    const r = parseBanesco(csv);
    expect(r.movements[0]!.monto).toBeCloseTo(1234567.89, 2);
  });
});

describe('parseVenezuela (BDV)', () => {
  it('parsea formato TXT con tabs', () => {
    const txt = `15/05/2026\t14:30\t654321\tABONO\t500,00\t10.500,00\tPAGO MOVIL`;
    const r = parseVenezuela(txt);
    expect(r.movements).toHaveLength(1);
    const m = r.movements[0]!;
    expect(m.fecha).toBe('2026-05-15');
    expect(m.referencia).toBe('654321');
    expect(m.tipo).toBe('C');
    expect(m.monto).toBe(500);
  });

  it('respeta header opcional', () => {
    const txt = `Fecha\tHora\tReferencia\tTipo\tMonto\tSaldo\tConcepto
15/05/2026\t14:30\t999\tABONO\t100\t1000\tX`;
    const r = parseVenezuela(txt);
    expect(r.movements).toHaveLength(1);
  });
});

describe('parseGeneric', () => {
  it('infiere columnas por encabezados en ingles', () => {
    const csv = `Date,Reference,Amount
2026-05-15,ABC123,250.00`;
    const r = parseGeneric(csv);
    expect(r.movements).toHaveLength(1);
    expect(r.movements[0]!.referencia).toBe('ABC123');
    expect(r.movements[0]!.monto).toBe(250);
  });
});

describe('parseByBank', () => {
  it('delega segun banco', () => {
    const csv = `Fecha;Referencia;Monto;Tipo
01/01/2026;X;10;C`;
    expect(parseByBank('banesco', csv).movements).toHaveLength(1);
    expect(parseByBank('mercantil', csv).movements).toHaveLength(1);
    expect(parseByBank('generic', csv).movements).toHaveLength(1);
  });
});
