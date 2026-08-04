// Cierre de caja por turno. Resumen del periodo + commit.

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { errorMessage } from '../../../shared/lib/errors';
import { toast } from 'sonner';
import { Coins, Printer, CheckSquare, Receipt, Clock, Hourglass, type IconProps } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Label } from '../../../shared/components/ui/label';
import { Textarea } from '../../../shared/components/ui/textarea';
import {
  previewClosure, closeShift, listClosures, lastClosureForUser,
  type CashClosureTotals, type CashClosure,
} from '../api/cash-closure.api';
import { METHOD_LABELS } from '../lib/labels';
import type { PaymentMethod } from '../api/payments.api';
import { formatCurrency, formatBase, formatDateTime } from '../../../shared/lib/format';
import { cn } from '../../../shared/lib/cn';
import { useDialog } from '../../../shared/components/ui/dialog-system';

type IconType = ComponentType<IconProps>;

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function CashClosurePage() {
  const dialog = useDialog();
  const [openedAt, setOpenedAt] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toLocalDatetimeInput(d);
  });
  const [closedAt, setClosedAt] = useState<string>(() => toLocalDatetimeInput(new Date()));
  const [tickNow, setTickNow] = useState(0);
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
      toast.error(errorMessage(err));
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

  // Tick cada 60s para refrescar duracion del turno en vivo
  useEffect(() => {
    const id = setInterval(() => setTickNow((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

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
        closed_at: new Date(closedAt).toISOString(),
        notas: notas || null,
      });
      toast.success(`Cierre ${closure.codigo} creado`);
      setNotas('');
      await loadPreview();
      await loadHistory();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setSubmitting(false); }
  }

  function handlePrint() { window.print(); }

  // pending_count llega ya calculado por la RPC como un CONTEO de pagos.
  // La version anterior derivaba "confirmados" sumando by_method (que incluye
  // los pendientes) y restaba, con lo que "Por confirmar" salia siempre 0.
  const pendingCount = totals?.pending_count ?? 0;
  const confirmedCount = Math.max(0, (totals?.total_count ?? 0) - pendingCount);

  // Duracion del turno: desde openedAt hasta closedAt (en vivo si esta "ahora")
  const durationMs = (() => {
    const open = new Date(openedAt).getTime();
    const close = new Date(closedAt).getTime();
    return close - open;
  })();
  // Marcador de uso de tickNow para que el efecto recalcule cada minuto
  void tickNow;

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

      <div className="bg-card border border-border rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-3 print:hidden">
        <div>
          <Label htmlFor="cc-from">Desde (apertura turno)</Label>
          <Input
            id="cc-from"
            type="datetime-local"
            value={openedAt}
            onChange={(e) => setOpenedAt(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cc-to">Hasta (cierre)</Label>
          <Input
            id="cc-to"
            type="datetime-local"
            value={closedAt}
            onChange={(e) => setClosedAt(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setClosedAt(toLocalDatetimeInput(new Date()))}
            className="text-[11px] text-primary hover:underline mt-1"
          >
            Usar hora actual
          </button>
        </div>
        <div>
          <Label htmlFor="cc-notas">Notas del turno</Label>
          <Textarea id="cc-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-3 print:hidden">
        <Hourglass size={18} weight="duotone" className="text-primary shrink-0" />
        <p className="text-sm">
          Turno desde <strong>{formatDateTime(openedAt)}</strong> hasta <strong>{formatDateTime(closedAt)}</strong> ·
          {' '}duracion <strong className="tabular-nums">{formatDuration(durationMs)}</strong>
        </p>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-muted-foreground">Cargando resumen...</p>
      ) : !totals ? null : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Coins} label="Pagos confirmados" value={confirmedCount.toString()} />
            <Kpi icon={Receipt} label="Total registros" value={totals.total_count.toString()} />
            <Kpi
              icon={Clock}
              label="Por confirmar"
              value={pendingCount.toString()}
              amber={pendingCount > 0}
            />
            <Kpi icon={Hourglass} label="Duracion turno" value={formatDuration(durationMs)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Los totales del turno van en moneda base. Antes se listaban por
                moneda sin equivalencia y cuadrar caja era imposible. */}
            <Card title="Total del turno (moneda base)">
              <ul className="divide-y divide-border">
                <li className="flex items-center justify-between py-2 text-sm">
                  <span>Confirmado</span>
                  <span className="font-bold tabular-nums">{formatBase(totals.total_confirmado_base_usd)}</span>
                </li>
                <li className="flex items-center justify-between py-2 text-sm">
                  <span>Por confirmar</span>
                  <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {formatBase(totals.total_por_confirmar_base_usd)}
                  </span>
                </li>
              </ul>
            </Card>

            <Card title="Fuera de caja">
              {totals.cancelados?.count ? (
                <div className="text-sm">
                  <p className="font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {formatBase(totals.cancelados.total_base_usd)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {totals.cancelados.count} cobro{totals.cancelados.count > 1 ? 's' : ''} de reservas canceladas.
                    No cuentan en el arqueo: estan pendientes de devolucion al huesped.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Ningun cobro de reservas canceladas en este turno.</p>
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
                    <th className="px-2 py-1.5 text-right">Cobrado</th>
                    <th className="px-2 py-1.5 text-right">En base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(totals.by_method).map(([method, m]) => (
                    <tr key={method}>
                      <td className="px-2 py-1.5">{METHOD_LABELS[method as PaymentMethod] ?? method}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{m.count}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {Object.entries(m.total_moneda ?? {}).map(([cur, t]) => (
                          <span key={cur} className="ml-3">{formatCurrency(Number(t), cur)}</span>
                        ))}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatBase(m.total_base_usd)}</td>
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
                  <span className="text-xs">{c.totals?.total_count ?? 0} registros</span>
                  <div className="text-right">
                    <p className="text-xs tabular-nums font-bold">
                      {formatBase(c.totals?.total_confirmado_base_usd ?? 0)}
                    </p>
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
