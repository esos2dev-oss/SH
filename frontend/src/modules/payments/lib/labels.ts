// Labels y catalogos para el modulo payments.

import type { PaymentMethod, PaymentStatus } from '../api/payments.api';

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  pago_movil: 'Pago Movil',
  transferencia: 'Transferencia',
  efectivo_bs: 'Efectivo Bs',
  efectivo_usd: 'Efectivo USD',
  efectivo: 'Efectivo',
  zelle: 'Zelle',
  punto_venta: 'Punto de Venta',
  tarjeta: 'Tarjeta',
  paypal: 'PayPal',
  otro: 'Otro',
};

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending_confirmation: 'Por confirmar',
  confirmed: 'Confirmado',
  rejected: 'Rechazado',
};

export const STATUS_COLORS: Record<PaymentStatus, string> = {
  pending_confirmation: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
};

/** Bancos venezolanos mas usados (codigo, nombre). */
export const VENEZUELAN_BANKS: Array<{ code: string; name: string }> = [
  { code: '0134', name: 'Banesco' },
  { code: '0102', name: 'Banco de Venezuela' },
  { code: '0105', name: 'Mercantil' },
  { code: '0108', name: 'Provincial' },
  { code: '0172', name: 'Bancamiga' },
  { code: '0191', name: 'Nacional de Credito' },
  { code: '0114', name: 'Bancaribe' },
  { code: '0115', name: 'Exterior' },
  { code: '0128', name: 'Caroni' },
  { code: '0137', name: 'Sofitasa' },
  { code: '0138', name: 'Plaza' },
  { code: '0151', name: 'BFC' },
  { code: '0156', name: '100% Banco' },
  { code: '0157', name: 'DelSur' },
  { code: '0163', name: 'Tesoro' },
  { code: '0166', name: 'Agricola de Venezuela' },
  { code: '0168', name: 'Bancrecer' },
  { code: '0169', name: 'Mi Banco' },
  { code: '0171', name: 'Activo' },
  { code: '0174', name: 'Banplus' },
  { code: '0175', name: 'Bicentenario' },
  { code: '0177', name: 'BANFANES' },
];

export const PAYMENT_METHODS_ORDERED: PaymentMethod[] = [
  'pago_movil',
  'transferencia',
  'efectivo_bs',
  'efectivo_usd',
  'zelle',
  'punto_venta',
  'tarjeta',
  'paypal',
  'efectivo',
  'otro',
];

export function methodCurrency(method: PaymentMethod): 'USD' | 'VES' | null {
  if (method === 'zelle' || method === 'efectivo_usd' || method === 'paypal') return 'USD';
  if (method === 'pago_movil' || method === 'efectivo_bs') return 'VES';
  return null;
}

export function methodStartsAsPending(method: PaymentMethod): boolean {
  return method === 'pago_movil' || method === 'transferencia';
}
