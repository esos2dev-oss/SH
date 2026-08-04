// Lista global de pagos: filtros + acciones (confirmar/rechazar/ver detalle).

import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../../shared/lib/errors';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, X, CurrencyCircleDollar, Funnel, Receipt } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { Input } from '../../../shared/components/ui/input';
import { SelectNative } from '../../../shared/components/ui/select-native';
import {
  listPayments,
  confirmPayment,
  rejectPayment,
  type PaymentPublic,
  type PaymentStatus,
  type PaymentMethod,
} from '../api/payments.api';
import { useQuickPayment, useOnPaymentSaved } from '../hooks/QuickPaymentProvider';
import { METHOD_LABELS, PAYMENT_METHODS_ORDERED, STATUS_COLORS, STATUS_LABELS } from '../lib/labels';
import { cn } from '../../../shared/lib/cn';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { useDialog } from '../../../shared/components/ui/dialog-system';

export default function PaymentsPage() {
  const quickPay = useQuickPayment();
  const dialog = useDialog();
  const [items, setItems] = useState<PaymentPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{
    status: PaymentStatus | '';
    method: PaymentMethod | '';
    search: string;
  }>({ status: '', method: '', search: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listPayments>[0] = { limit: 100 };
      if (filters.status) params.status = filters.status;
      if (filters.method) params.method = filters.method;
      if (filters.search) params.search = filters.search;
      const r = await listPayments(params);
      setItems(r.data);
      setTotal(r.pagination.total);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);
  useOnPaymentSaved(useCallback(() => { void load(); }, [load]));

  async function handleConfirm(p: PaymentPublic) {
    try {
      await confirmPayment(p.id);
      toast.success('Pago confirmado');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function handleReject(p: PaymentPublic) {
    const reason = await dialog.prompt({
      title: 'Rechazar pago',
      message: 'Indica el motivo del rechazo. Quedara registrado en el audit log.',
      placeholder: 'Ej: referencia no encontrada en el extracto',
      required: true,
      multiline: true,
      maxLength: 500,
    });
    if (!reason) return;
    try {
      await rejectPayment(p.id, reason);
      toast.success('Pago rechazado');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const pendientes = items.filter((p) => p.status === 'pending_confirmation').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        subtitle={loading ? 'Cargando...' : `${total} pagos · ${pendientes} por confirmar`}
        actions={
          <button
            type="button"
            onClick={() => quickPay.open()}
            className="h-10 px-4 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"
          >
            <CurrencyCircleDollar size={16} weight="duotone" /> Registrar pago
            <span className="ml-1 inline-flex items-center justify-center bg-primary-foreground/20 rounded px-1 text-[10px] font-mono">P</span>
          </button>
        }
      />

      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Buscar</label>
          <Input
            placeholder="Codigo reserva, ref, nombre, cedula..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Estado</label>
          <SelectNative
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as PaymentStatus | '' }))}
          >
            <option value="">Todos</option>
            <option value="pending_confirmation">Por confirmar</option>
            <option value="confirmed">Confirmados</option>
            <option value="rejected">Rechazados</option>
          </SelectNative>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Metodo</label>
          <SelectNative
            value={filters.method}
            onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value as PaymentMethod | '' }))}
          >
            <option value="">Todos</option>
            {PAYMENT_METHODS_ORDERED.map((m) => (
              <option key={m} value={m}>{METHOD_LABELS[m]}</option>
            ))}
          </SelectNative>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando pagos...</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Sin pagos"
          description="No hay pagos que coincidan con los filtros. Registra el primero con el atajo P."
          action={
            <button
              type="button"
              onClick={() => quickPay.open()}
              className="h-10 px-4 text-sm font-bold bg-primary text-primary-foreground rounded-lg"
            >
              Registrar pago
            </button>
          }
        />
      ) : (
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Destino</th>
                <th className="px-4 py-2 text-left">Metodo · Ref</th>
                <th className="px-4 py-2 text-right">Monto</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(p.pagado_at)}</td>
                  <td className="px-4 py-2">
                    {p.booking ? (
                      <Link to={`/bookings/${p.booking.id}`} className="text-primary hover:underline font-semibold">{p.booking.codigo}</Link>
                    ) : p.customer ? (
                      <Link to={`/customers/${p.customer.id}`} className="text-primary hover:underline">{p.customer.nombre}</Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {p.customer && p.booking && (
                      <p className="text-[10px] text-muted-foreground">{p.customer.nombre}</p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs font-semibold">{METHOD_LABELS[p.method]}</span>
                    {p.referencia && <p className="text-[10px] text-muted-foreground">ref {p.referencia}</p>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {formatCurrency(p.monto, p.moneda)}
                    {p.monto_base !== null && p.moneda !== 'USD' && (
                      <p className="text-[10px] text-muted-foreground">{p.monto_base.toFixed(2)} USD</p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded', STATUS_COLORS[p.status])}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {p.status === 'pending_confirmation' ? (
                      <div className="inline-flex gap-1">
                        <button type="button" onClick={() => void handleConfirm(p)} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 dark:hover:bg-emerald-950/30" title="Confirmar"><Check size={14} weight="bold" /></button>
                        <button type="button" onClick={() => void handleReject(p)} className="p-1.5 rounded hover:bg-red-50 text-red-600 dark:hover:bg-red-950/30" title="Rechazar"><X size={14} weight="bold" /></button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><Funnel size={10} /> {p.confirmed_at ? 'Confirmado' : p.rejected_at ? 'Rechazado' : ''}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
