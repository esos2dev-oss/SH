// Estado de cuenta del huesped (todas las reservas + pagos sueltos).
// Muestra resumen total arriba, y por cada reserva: cargos + pagos + saldo.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowSquareOut, WhatsappLogo } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import {
  getCustomerStatement,
  type CustomerStatement,
  type StatementSummary,
} from '../api/payments.api';
import { useOnPaymentSaved } from '../hooks/QuickPaymentProvider';
import { METHOD_LABELS, STATUS_COLORS, STATUS_LABELS } from '../lib/labels';
import { cn } from '../../../shared/lib/cn';
import { formatCurrency, formatDate, formatDateTime } from '../../../shared/lib/format';
import { buildWhatsAppLink, summaryToWhatsAppText } from '../lib/whatsapp';

interface Props {
  customerId: number;
}

export function GuestStatement({ customerId }: Props) {
  const [data, setData] = useState<CustomerStatement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getCustomerStatement(customerId);
      setData(r);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cargar el estado de cuenta');
    } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);
  useOnPaymentSaved(useCallback(() => { void load(); }, [load]));

  if (loading) return <div className="text-center py-8 text-sm text-muted-foreground">Cargando estado de cuenta...</div>;
  if (!data) return <div className="text-center py-8 text-sm text-muted-foreground">Sin datos</div>;

  const tel = data.customer.telefono;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Estado de cuenta</h3>
            <SummaryGrid summary={data.totals} />
          </div>
          {tel && (
            <a
              href={buildWhatsAppLink(tel, summaryToWhatsAppText(data))}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-sm shadow-emerald-600/30"
            >
              <WhatsappLogo size={16} weight="fill" /> Enviar por WhatsApp
            </a>
          )}
        </div>
      </div>

      {data.bookings.length === 0 && data.loose_payments.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">El huesped no tiene reservas ni pagos.</div>
      )}

      {data.bookings.map((b) => (
        <div key={b.booking.id} className="bg-card rounded-3xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <Link to={`/reservas/${b.booking.id}`} className="font-semibold text-sm hover:text-primary inline-flex items-center gap-1">
                {b.booking.codigo} <ArrowSquareOut size={12} />
              </Link>
              <p className="text-[11px] text-muted-foreground">{formatDate(b.booking.fecha_entrada)} → {formatDate(b.booking.fecha_salida)} · {b.booking.status}</p>
            </div>
            <SummaryGrid summary={b.summary} compact />
          </div>
          <div className="divide-y divide-border">
            {b.lines.map((line, i) => (
              <div key={`${b.booking.id}-${i}`} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm">{line.descripcion}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDateTime(line.fecha)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {line.kind === 'payment' && line.status && (
                    <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', STATUS_COLORS[line.status])}>{STATUS_LABELS[line.status]}</span>
                  )}
                  {line.kind === 'payment' && line.method && (
                    <span className="text-[10px] text-muted-foreground uppercase">{METHOD_LABELS[line.method]}</span>
                  )}
                  <p className={cn(
                    'tabular-nums font-semibold text-sm',
                    line.kind === 'payment' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                  )}>
                    {line.kind === 'payment' ? '-' : '+'}{formatCurrency(line.monto, line.moneda)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {data.loose_payments.length > 0 && (
        <div className="bg-card rounded-3xl border border-border shadow-sm p-5">
          <h4 className="font-semibold text-sm mb-3">Pagos sueltos (no asociados a reserva)</h4>
          <div className="divide-y divide-border">
            {data.loose_payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm">{METHOD_LABELS[p.method]}{p.referencia ? ` · ref ${p.referencia}` : ''}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDateTime(p.pagado_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', STATUS_COLORS[p.status])}>{STATUS_LABELS[p.status]}</span>
                  <p className="tabular-nums font-semibold text-sm text-emerald-600 dark:text-emerald-400">+{formatCurrency(p.monto, p.moneda)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryGrid({ summary, compact = false }: { summary: StatementSummary; compact?: boolean }) {
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-4 gap-3', compact && 'gap-2')}>
      <Kpi label="Total" value={formatCurrency(summary.total_cargos, summary.moneda)} />
      <Kpi label="Pagado" value={formatCurrency(summary.total_pagado_confirmado, summary.moneda)} positive />
      {summary.total_pagado_pendiente > 0 && (
        <Kpi label="Por confirmar" value={formatCurrency(summary.total_pagado_pendiente, summary.moneda)} amber />
      )}
      <Kpi label="Saldo" value={formatCurrency(summary.saldo, summary.moneda)} strong={summary.saldo > 0} />
    </div>
  );
}

function Kpi({ label, value, positive, amber, strong }: { label: string; value: string; positive?: boolean; amber?: boolean; strong?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        'tabular-nums font-bold',
        positive && 'text-emerald-600 dark:text-emerald-400',
        amber && 'text-amber-600 dark:text-amber-400',
        strong && 'text-red-600 dark:text-red-400',
        !positive && !amber && !strong && 'text-foreground',
      )}>
        {value}
      </p>
    </div>
  );
}
