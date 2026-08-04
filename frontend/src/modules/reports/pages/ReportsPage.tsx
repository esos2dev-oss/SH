import { useEffect, useState } from 'react';
import { errorMessage } from '../../../shared/lib/errors';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Receipt, ChartLineUp, ChartBar, DownloadSimple, CalendarBlank } from '@phosphor-icons/react';
import { cn } from '../../../shared/lib/cn';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import {
  financialReport, financialCsvUrl, customersReport, kpisReport, paymentMethodsReport,
  type FinancialReport, type CustomersReport, type KpisReport, type PaymentMethodsReport,
} from '../api/reports.api';
import { METHOD_LABELS } from '../../payments/lib/labels';
import type { PaymentMethod } from '../../payments/api/payments.api';
import { formatCurrency, formatBase } from '../../../shared/lib/format';

type RangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export default function ReportsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [preset, setPreset] = useState<RangePreset>('month');

  function applyPreset(p: RangePreset) {
    setPreset(p);
    const now = new Date();
    if (p === 'today') {
      const d = isoDate(now);
      setDateFrom(d); setDateTo(d);
      setPeriod('daily');
    } else if (p === 'week') {
      const start = new Date(now);
      const dow = (start.getDay() + 6) % 7; // lunes = 0
      start.setDate(start.getDate() - dow);
      setDateFrom(isoDate(start)); setDateTo(isoDate(now));
      setPeriod('daily');
    } else if (p === 'month') {
      setDateFrom(firstDayOfMonth()); setDateTo(isoDate(now));
      setPeriod('daily');
    } else if (p === 'year') {
      setDateFrom(isoDate(new Date(now.getFullYear(), 0, 1)));
      setDateTo(isoDate(now));
      setPeriod('monthly');
    }
  }
  const [financial, setFinancial] = useState<FinancialReport | null>(null);
  const [customers, setCustomers] = useState<CustomersReport | null>(null);
  const [kpis, setKpis] = useState<KpisReport | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodsReport | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [f, c, k, pm] = await Promise.all([
        financialReport({ period, dateFrom, dateTo }),
        customersReport(),
        kpisReport({ dateFrom, dateTo }),
        paymentMethodsReport({ dateFrom, dateTo }),
      ]);
      setFinancial(f);
      setCustomers(c);
      setKpis(k);
      setPaymentMethods(pm);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [period, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        subtitle="Resumen financiero y de huespedes"
        actions={
          <a
            href={financialCsvUrl({ period, dateFrom, dateTo })}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"
          >
            <DownloadSimple size={12} weight="bold" /> Export CSV
          </a>
        }
      />

      {/* Atajos de rango */}
      <div className="flex flex-wrap gap-1.5 items-center bg-card border border-border rounded-2xl p-1.5">
        <CalendarBlank size={14} className="text-muted-foreground ml-2" />
        <PresetButton active={preset === 'today'} onClick={() => applyPreset('today')}>Hoy</PresetButton>
        <PresetButton active={preset === 'week'} onClick={() => applyPreset('week')}>Esta semana</PresetButton>
        <PresetButton active={preset === 'month'} onClick={() => applyPreset('month')}>Este mes</PresetButton>
        <PresetButton active={preset === 'year'} onClick={() => applyPreset('year')}>Este anio</PresetButton>
        <div className="h-6 w-px bg-border mx-1" />
        <PresetButton active={preset === 'custom'} onClick={() => setPreset('custom')}>Personalizado</PresetButton>
      </div>

      {/* Filtros granulares */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Agrupacion</label>
          <select value={period} onChange={(e) => { setPeriod(e.target.value as typeof period); setPreset('custom'); }} className="h-9 px-3 rounded-lg border border-border bg-card text-sm cursor-pointer outline-none focus:border-primary">
            <option value="daily">Diario</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPreset('custom'); }} className="h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPreset('custom'); }} className="h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary" />
        </div>
      </div>

      {/* KPIs hoteleros */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi color="blue" icon={ChartLineUp} label="Ocupacion" value={`${kpis.occupancyPct.toFixed(1)}%`} />
          <Kpi color="emerald" icon={Receipt} label="ADR" value={kpis.adr.toFixed(2)} />
          <Kpi color="violet" icon={ChartBar} label="RevPAR" value={kpis.revpar.toFixed(2)} />
          <Kpi color="emerald" icon={Receipt} label="Revenue" value={kpis.revenue.toFixed(2)} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>
      ) : financial && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi color="emerald" icon={ArrowDown} label="Ingresos" value={formatCurrency(financial.totals.ingresos, financial.totals.moneda)} />
            <Kpi color="red" icon={ArrowUp} label="Egresos" value={formatCurrency(financial.totals.egresos, financial.totals.moneda)} />
            <Kpi color="blue" icon={Receipt} label="Neto" value={formatCurrency(financial.totals.neto, financial.totals.moneda)} />
            <Kpi color="violet" icon={ChartLineUp} label="Reservas" value={String(financial.bookingsCount)} />
          </div>

          {/* Categorias */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><ChartBar size={18} weight="duotone" /> Por categoria</h3>
              {financial.byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>
              ) : (
                <div className="space-y-2">
                  {financial.byCategory.map((c) => {
                    const max = Math.max(...financial.byCategory.map((x) => x.total));
                    const pct = max > 0 ? (c.total / max) * 100 : 0;
                    return (
                      <div key={`${c.categoryId}-${c.type}`}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium">{c.nombre}</span>
                          <span className={`tabular-nums font-semibold ${c.type === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>{formatBase(c.total)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.type === 'ingreso' ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Serie temporal */}
            <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
              <h3 className="font-semibold mb-4">Evolucion {period === 'daily' ? 'diaria' : period === 'weekly' ? 'semanal' : 'mensual'}</h3>
              {financial.series.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <div className="space-y-1">
                  {financial.series.slice(-15).map((s) => {
                    const max = Math.max(...financial.series.flatMap((x) => [x.ingresos, x.egresos]));
                    const inPct = max > 0 ? (s.ingresos / max) * 50 : 0;
                    const outPct = max > 0 ? (s.egresos / max) * 50 : 0;
                    return (
                      <div key={s.period} className="flex items-center gap-2 text-xs">
                        <span className="w-24 text-muted-foreground tabular-nums">{s.period}</span>
                        <div className="flex-1 h-5 flex">
                          <div className="bg-emerald-500 rounded-l h-full" style={{ width: `${inPct}%` }} title={`Ingresos: ${s.ingresos}`} />
                          <div className="bg-red-500 rounded-r h-full" style={{ width: `${outPct}%` }} title={`Egresos: ${s.egresos}`} />
                        </div>
                        <span className="w-20 text-right tabular-nums font-semibold">{formatBase(s.ingresos - s.egresos)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Ingresos por metodo de pago */}
      {paymentMethods && paymentMethods.by_method.length > 0 && (
        <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <ChartBar size={18} weight="duotone" /> Ingresos por metodo de pago
          </h3>
          <div className="overflow-x-auto -mx-6 sm:mx-0">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="border-b">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Metodo</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Confirmados</th>
                <th className="px-3 py-2 text-right">Por confirmar</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.by_method.map((m) => (
                <tr key={m.method} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{METHOD_LABELS[m.method as PaymentMethod] ?? m.method}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">
                    {Object.entries(m.confirmed).map(([cur, t]) => (
                      <div key={cur}>{formatCurrency(t, cur)}</div>
                    ))}
                    {Object.keys(m.confirmed).length === 0 && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">
                    {Object.entries(m.pending).map(([cur, t]) => (
                      <div key={cur}>{formatCurrency(t, cur)}</div>
                    ))}
                    {Object.keys(m.pending).length === 0 && <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Top room types */}
      {kpis && kpis.topRoomTypes.length > 0 && (
        <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <ChartBar size={18} weight="duotone" /> Top tipos de habitacion
          </h3>
          <div className="space-y-2">
            {kpis.topRoomTypes.map((t) => {
              const max = Math.max(...kpis.topRoomTypes.map((x) => x.revenue));
              const pct = max > 0 ? (t.revenue / max) * 100 : 0;
              return (
                <div key={t.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{t.nombre}</span>
                    <span className="tabular-nums">{t.bookings} reservas · <strong>{formatBase(t.revenue)}</strong></span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Customers report */}
      {customers && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card rounded-3xl border border-border shadow-sm p-6">
            <h3 className="font-semibold mb-4">Top huespedes</h3>
            {customers.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin huespedes con estancias.</p>
            ) : (
              <div className="overflow-x-auto -mx-6 sm:mx-0">
              <table className="w-full text-sm min-w-[420px]">
                <thead className="border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nombre</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estancias</th>
                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gastado</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.top.slice(0, 10).map((c, i) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{c.nombre}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.estancias}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatBase(c.gastado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
          <div className="bg-card rounded-3xl border border-border shadow-sm p-6">
            <h3 className="font-semibold mb-4">Segmentos</h3>
            <div className="space-y-3 text-sm">
              <SegmentRow label="VIP (3+ estancias)" count={customers.segments.vip} cls="text-violet-600" />
              <SegmentRow label="Recientes (30d)" count={customers.segments.recientes} cls="text-emerald-600" />
              <SegmentRow label="Inactivos (90d)" count={customers.segments.inactivos} cls="text-amber-600" />
              <SegmentRow label="Cumple este mes" count={customers.segments.cumple_mes} cls="text-pink-600" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentRow({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-xl font-extrabold tabular-nums ${cls}`}>{count}</span>
    </div>
  );
}

function Kpi({ color, icon: Icon, label, value }: { color: 'emerald' | 'red' | 'blue' | 'violet'; icon: typeof Receipt; label: string; value: string }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400',
  };
  return (
    <div className="bg-card p-6 rounded-3xl border border-border shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colors[color]}`}><Icon size={20} weight="duotone" /></div>
      <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">{label}</p>
      <h3 className="text-3xl font-extrabold mt-1 tracking-tight tabular-nums">{value}</h3>
    </div>
  );
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function firstDayOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function PresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-xl text-xs font-bold transition-all',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
