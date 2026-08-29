// Asistencia de empleados: marcar entrada/salida, historial, panel admin.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Clock, SignIn, SignOut, Users, ArrowClockwise } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { useAuth } from '../../../contexts/AuthContext';
import { formatDateTime } from '../../../shared/lib/format';
import {
  marcar, myLastState, myHistory, currentlyIn, hoursReport,
  type AttendanceKind, type AttendanceRow, type StaffCurrentlyIn, type HoursReportRow,
} from '../api/attendance.api';

function firstOfMonth(): string { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function today(): string { return new Date().toISOString().slice(0, 10); }
function fmtMinutes(min: number): string { const h = Math.floor(min / 60); const m = min % 60; return `${h}h ${m}m`; }

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'contabilidad';

  const [myState, setMyState] = useState<AttendanceKind | null>(null);
  const [myLog, setMyLog] = useState<AttendanceRow[]>([]);
  const [currentIn, setCurrentIn] = useState<StaffCurrentlyIn[]>([]);
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [hoursData, setHoursData] = useState<HoursReportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, log] = await Promise.all([myLastState(), myHistory(30)]);
      setMyState(s); setMyLog(log);
      if (isAdmin) {
        const [ci, hr] = await Promise.all([currentlyIn(), hoursReport(dateFrom, dateTo)]);
        setCurrentIn(ci); setHoursData(hr);
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }, [isAdmin, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  async function onMark(kind: AttendanceKind) {
    setBusy(true);
    try {
      await marcar(kind);
      toast.success(kind === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Asistencia" subtitle={`Bienvenido ${user?.nombre ?? ''} · Registro de entradas y salidas`} />

      {/* Mi tarjeta */}
      <div className="bg-card rounded-3xl border border-border p-6 flex flex-col md:flex-row items-center gap-6">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center flex-shrink-0 ${myState === 'entrada' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
          <Clock size={48} weight="duotone" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <p className="text-xs text-muted-foreground">Tu estado actual</p>
          <p className="text-3xl font-extrabold mt-1">
            {myState === 'entrada' ? 'Trabajando' : myState === 'salida' ? 'Fuera' : 'Sin marcar hoy'}
          </p>
          {myLog.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">Ultimo marcado: {formatDateTime(myLog[0]!.marcado_at)}</p>
          )}
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button onClick={() => void onMark('entrada')} disabled={busy || myState === 'entrada'}
            className="h-14 px-6 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20">
            <SignIn size={20} weight="bold" /> Marcar entrada
          </button>
          <button onClick={() => void onMark('salida')} disabled={busy || myState !== 'entrada'}
            className="h-14 px-6 border border-border bg-card rounded-xl font-bold flex items-center gap-2 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
            <SignOut size={20} weight="bold" /> Marcar salida
          </button>
        </div>
      </div>

      {/* Historial personal */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-bold mb-3">Mi historial (30 dias)</h3>
        {loading ? (
          <div className="space-y-2">{Array.from({length: 5}).map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : myLog.length === 0 ? (
          <EmptyState icon={Clock} title="Sin marcados" description="Marca tu entrada para empezar." />
        ) : (
          <div className="divide-y divide-border">
            {myLog.slice(0, 20).map((r) => (
              <div key={r.id} className="py-2 flex items-center gap-3 text-sm">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${r.kind === 'entrada' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                  {r.kind}
                </span>
                <span className="tabular-nums">{formatDateTime(r.marcado_at)}</span>
                {r.notas && <span className="text-xs text-muted-foreground italic ml-auto">{r.notas}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel admin */}
      {isAdmin && (
        <>
          <div className="bg-card rounded-3xl border border-border p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2"><Users size={18} weight="duotone" /> Trabajando ahora ({currentIn.length})</h3>
              <button onClick={() => void load()} className="h-8 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            </div>
            {currentIn.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie con entrada registrada en las ultimas 24h.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentIn.map((e) => (
                  <div key={e.profile_id} className="rounded-xl border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20 p-3">
                    <p className="font-bold">{e.nombre}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{e.role}</p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">Entrada: {formatDateTime(e.ultima_entrada)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card rounded-3xl border border-border p-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <h3 className="font-bold">Horas trabajadas</h3>
              <div className="flex items-center gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-card text-sm" />
                <span className="text-sm text-muted-foreground">→</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-card text-sm" />
              </div>
            </div>
            {hoursData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Empleado</th>
                    <th className="text-left py-2">Rol</th>
                    <th className="text-right py-2">Dias marcados</th>
                    <th className="text-right py-2">Horas totales</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursData.map((r) => (
                    <tr key={r.prof_id} className="border-b last:border-0">
                      <td className="py-2 font-semibold">{r.nombre}</td>
                      <td className="py-2 text-muted-foreground">{r.role}</td>
                      <td className="py-2 text-right tabular-nums">{r.dias_marcados}</td>
                      <td className="py-2 text-right tabular-nums font-bold">{fmtMinutes(r.minutos_totales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
