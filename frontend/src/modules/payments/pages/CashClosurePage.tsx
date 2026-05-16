// Cierre de caja por turno. Resumen del periodo + commit.

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { toast } from 'sonner';
import { Coins, Printer, CheckSquare, Receipt, Clock, type IconProps } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Label } from '../../../shared/components/ui/label';
import { Textarea } from '../../../shared/components/ui/textarea';
import { ApiError } from '../../../shared/api/client';
import {
  previewClosure, closeShift, listClosures, lastClosureForUser,
  type CashClosureTotals, type CashClosure,
} from '../api/cash-closure.api';
import { METHOD_LABELS } from '../lib/labels';
import type { PaymentMethod } from '../api/payments.api';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { cn } from '../../../shared/lib/cn';
import { useDialog } from '../../../shared/components/ui/dialog-system';

type IconType = ComponentType<IconProps>;

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CashClosurePage() {
  const dialog = useDialog();
  const [openedAt, setOpenedAt] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toLocalDatetimeInput(d);
  });
  const [notas, setNotas] = useState('');
  const [totals, setTotals] = useState<CashClosureTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<CashClosure[]>([]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const r = await previewClosure({ opened_at: new Date(openedAt).toISOString() });
      setTotals(r);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
      setTotals(null);
    } finally { setLoading(false); }
  }, [openedAt]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await listClosures({ limit: 10 });
      setHistory(r);
    } catch { /* silencio */ }
  }, []);

  useEffect(() => { void loadPreview(); }, [loadPreview]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Precargar opened_at con el ultimo cierre del usuario
  useEffect(() => {
    (async () => {
      try {
        const r = await lastClosureForUser();
        if (r && r.last_closed_at) {
          setOpenedAt(toLocalDatetimeInput(new Date(r.last_closed_at)));
        }
      } catch { /* ok */ }
    })();
  }, []);

  async function handleCommit() {
    if (!totals || totals.total_count === 0) {
      toast.error('No hay pagos en el periodo');
      return;
    }
    if (!(await dialog.confirm({
      title: 'Cerrar turno?',
      message: `Se registrara un cierre con ${totals.total_count} pagos. Una vez cerrado no se puede deshacer.`,
      confirmLabel: 'Cerrar turno',
    }))) return;
    setSubmitting(true);
    try {
      const closure = await closeShift({
        opened_at: new Date(openedAt).toISOString(),
        closed_at: new Date().toISOString(),
        notas: notas || null,
      });
      toast.success(`Cierre ${closure.codigo} creado`);
      setNotas('');
      await loadPreview();
      await loadHistory();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  function handlePrint() { window.print(); }

  const confirmedCount = totals
    ? Object.values(totals.by_method).reduce((acc, m) => acc + m.count, 0)
    : 0;
  const pendingCount = totals ? totals.total_count - confirmedCount : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cierre de caja"
        subtitle="Resumen del turno: pagos confirmados, por confirmar y totales por metodo/moneda."
        actions={
          <>
            <Button type="button" variant="outline" onClick={handlePrint} disabled={!totals || totals.total_count === 0}>
              <Printer size={14} weight="bold" className="mr-1.5" /> Imprimir
            </Button>
            <Button type="button" onClick={() => void handleCommit()} disabled={submitting || !totals || totals.total_count === 0}>
              <CheckSquare size={14} weight="bold" className="mr-1.5" />
              {submitting ? 'Cerrando...' : 'Cerrar turno'}
            </Button>
          </>
        }
      />

      <div className="bg-card border border-border rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-3 print:hidden">
        <div>
          <Label htmlFor="cc-from">Desde (apertura turno)</Label>
          <Input
            id="cc-from"
            type="datetime-local"
            value={openedAt}
            onChange={(e) => setOpenedAt(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground mt-1">El "hasta" es ahora.</p>
        </div>
        <div>
          <Label htmlFor="cc-notas">Notas del turno</Label>
          <Textarea id="cc-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-muted-foreground">Cargando resumen...</p>
      ) : !totals ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Kpi icon={Coins} label="Pagos confirmados" value={confirmedCount.toString()} />
            <Kpi icon={Receipt} label="Total registros" value={totals.total_count.toString()} />
            <Kpi
              icon={Clock}
              label="Por confirmar"
              value={pendingCount.toString()}
              amber={pendingCount > 0}
            />
            <Kpi label="Apertura" value={formatDateTime(openedAt)} small />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Confirmados por moneda">
              {Object.keys(totals.total_confirmados).length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin pagos confirmados</p>
              ) : (
                <ul className="divide-y divide-border">
                  {Object.entries(totals.total_confirmados).map(([currency, total]) => (
                    <li key={currency} className="flex items-center justify-between py-2 text-sm">
                      <span>{currency}</span>
                      <span className="font-bold tabular-nums">{formatCurrency(total, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Por confirmar por moneda">
              {Object.keys(totals.total_por_confirmar).length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin pagos pendientes — todo conciliado.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {Object.entries(totals.total_por_confirmar).map(([currency, total]) => (
                    <li key={currency} className="flex items-center justify-between py-2 text-sm">
                      <span>{currency}</span>
                      <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(total, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Detalle por metodo">
            {Object.keys(totals.by_method).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin movimientos</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Metodo</th>
                    <th className="px-2 py-1.5 text-right">Cantidad</th>
                    <th className="px-2 py-1.5 text-right">Totales por moneda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(totals.by_method).map(([method, m]) => (
                    <tr key={method}>
                      <td className="px-2 py-1.5">{METHOD_LABELS[method as PaymentMethod] ?? method}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{m.count}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {Object.entries(m.total_moneda).map(([cur, t]) => (
                          <span key={cur} className="ml-3">{formatCurrency(t, cur)}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {history.length > 0 && (
        <div className="print:hidden">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Cierres anteriores</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {history.map((c) => (
              <div key={c.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-sm">{c.codigo}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDateTime(c.closed_at)}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">{c.user_name ?? '—'}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs">{c.totals.total_count} registros</span>
                  <div className="text-right">
                    {Object.entries(c.totals.total_confirmados).slice(0, 2).map(([cur, t]) => (
                      <p key={cur} className="text-xs tabular-nums font-bold">{formatCurrency(t, cur)}</p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, amber, small }: { icon?: IconType; label: string; value: string; sub?: string; amber?: boolean; small?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={14} weight="duotone" />}
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={cn(small ? 'text-sm font-bold' : 'text-2xl font-extrabold tabular-nums', amber && 'text-amber-600 dark:text-amber-400')}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{title}</h4>
      {children}
    </div>
  );
}
