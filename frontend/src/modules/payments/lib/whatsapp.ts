// Helpers para construir enlaces wa.me y texto preformateado.

import type { CustomerStatement } from '../api/payments.api';

/** Limpia un telefono para wa.me. Acepta +58 414 1234567, 04141234567, etc. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, '');
  if (s.startsWith('+')) return s.slice(1);
  if (s.startsWith('00')) return s.slice(2);
  if (s.startsWith('0') && s.length === 11) {
    // 04141234567 -> 584141234567
    return `58${s.slice(1)}`;
  }
  if (s.length === 10) return `58${s}`;
  return s;
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const cleaned = normalizePhone(phone);
  const encoded = encodeURIComponent(text);
  if (!cleaned) return `https://wa.me/?text=${encoded}`;
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

export function summaryToWhatsAppText(s: CustomerStatement): string {
  const lines: string[] = [];
  lines.push(`Hola ${s.customer.nombre},`);
  lines.push('');
  lines.push(`Resumen de su estado de cuenta:`);
  lines.push(`• Total: ${s.totals.total_cargos.toFixed(2)} ${s.totals.moneda}`);
  lines.push(`• Pagado: ${s.totals.total_pagado_confirmado.toFixed(2)} ${s.totals.moneda}`);
  if (s.totals.total_pagado_pendiente > 0) {
    lines.push(`• Por confirmar: ${s.totals.total_pagado_pendiente.toFixed(2)} ${s.totals.moneda}`);
  }
  lines.push(`• Saldo: ${s.totals.saldo.toFixed(2)} ${s.totals.moneda}`);
  if (s.totals.saldo > 0) {
    lines.push('');
    lines.push('Quedamos atentos a recibir el pago. Gracias.');
  } else {
    lines.push('');
    lines.push('Gracias por su preferencia.');
  }
  return lines.join('\n');
}

