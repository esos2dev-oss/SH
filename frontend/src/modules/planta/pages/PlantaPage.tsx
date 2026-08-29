// Panel de la planta electrica (generador): encendido/apagado con horas.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Lightning, LightningSlash, ArrowClockwise, GasPump, Clock } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { formatDateTime } from '../../../shared/lib/format';
import { listEvents, summary, marcar, type PlantaEvent, type PlantaSummary } from '../api/planta.api';

function firstOfMonth(): string { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function today(): string { return new Date().toISOString().slice(0, 10); }

export default function PlantaPage() {
  const [events, setEvents] = useState<PlantaEvent[]>([]);
  const [sum, setSum] = useState<PlantaSummary | null>(null);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState<null | 'encendido' | 'apagado'>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ev, s] = await Promise.all([listEvents(from, to), summary(from, to)]);
      setEvents(ev); setSum(s);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planta electrica"
        subtitle="Control de encendidos/apagados del generador"
        actions={
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-card text-sm" />
            <span className="text-sm text-muted-foreground">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 px-3 rounded-lg border border-border bg-card text-sm" />
            <button onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
          </>
        }
      />

      {/* Estado actual + acciones */}
      <div className="bg-card rounded-3xl border border-border p-6 flex flex-col md:flex-row items-center gap-6">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center flex-shrink-0 ${sum?.estado_actual === 'encendido' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
          {sum?.estado_actual === 'encendido' ? <Lightning size={48} weight="fill" /> : <LightningSlash size={48} weight="duotone" />}
        </div>
        <div className="flex-1 text-center md:text-left">
          <p className="text-xs text-muted-foreground">Estado actual de la planta</p>
          <p className={`text-3xl font-extrabold mt-1 ${sum?.estado_actual === 'encendido' ? 'text-amber-600 dark:text-amber-400' : ''}`}>
            {sum?.estado_actual === 'encendido' ? 'ENCENDIDA' : 'APAGADA'}
          </p>
          {sum?.ultimo_evento_at && <p className="text-xs text-muted-foreground mt-1">Ultimo evento: {formatDateTime(sum.ultimo_evento_at)}</p>}
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button onClick={() => setShowForm('encendido')} disabled={busy || sum?.estado_actual === 'encendido'}
            className="h-14 px-6 bg-amber-500 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20">
            <Lightning size={20} weight="bold" /> Encender
          </button>
          <button onClick={() => setShowForm('apagado')} disabled={busy || sum?.estado_actual !== 'encendido'}
            className="h-14 px-6 border border-border bg-card rounded-xl font-bold flex items-center gap-2 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
            <LightningSlash size={20} weight="bold" /> Apagar
          </button>
        </div>
      </div>

      {/* KPIs del rango */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi color="amber" icon={Clock} label="Horas encendida" value={sum ? `${sum.horas_encendida}h` : '—'} />
        <Kpi color="blue" icon={Lightning} label="Ciclos" value={sum?.ciclos ?? 0} />
        <Kpi color="violet" icon={GasPump} label="Combustible cargado" value={sum ? `${sum.combustible_litros} L` : '—'} />
        <Kpi color="emerald" icon={ArrowClockwise} label="Eventos totales" value={events.length} />
      </div>

      {/* Historial */}
      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-bold mb-3">Historial ({from} → {to})</h3>
        {loading ? (
          <div className="space-y-2">{Array.from({length: 5}).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : events.length === 0 ? (
          <EmptyState icon={Lightning} title="Sin eventos" description="No hay encendidos/apagados registrados en este rango." />
        ) : (
          <div className="divide-y divide-border">
            {events.map((e) => (
              <div key={e.id} className="py-3 flex items-center gap-3 text-sm">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${e.kind === 'encendido' ? 'bg-amber-500/15 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                  {e.kind === 'encendido' ? <Lightning size={20} weight="fill" /> : <LightningSlash size={20} weight="duotone" />}
                </div>
                <div className="flex-1">
                  <p className="font-bold uppercase">{e.kind}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{formatDateTime(e.marcado_at)} · {e.operador_nombre ?? '—'}</p>
                  {e.motivo && <p className="text-[11px] mt-1">Motivo: {e.motivo}</p>}
                  {e.notas && <p className="text-[11px] italic text-muted-foreground">{e.notas}</p>}
                </div>
                {e.combustible_litros != null && (
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase">Combustible</p>
                    <p className="font-bold tabular-nums">{e.combustible_litros} L</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <MarcarDialog kind={showForm} onClose={() => setShowForm(null)}
          onDone={async () => { setShowForm(null); await load(); }}
          busy={busy} setBusy={setBusy}
        />
      )}
    </div>
  );
}

function Kpi({ color, icon: Icon, label, value }: { color: 'amber' | 'blue' | 'violet' | 'emerald'; icon: typeof Lightning; label: string; value: React.ReactNode }) {
  const bg: Record<typeof color, string> = {
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg[color]}`}><Icon size={18} weight="duotone" /></div>
      <p className="text-[11px] text-muted-foreground mt-2">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function MarcarDialog({ kind, onClose, onDone, busy, setBusy }: { kind: 'encendido' | 'apagado'; onClose: () => void; onDone: () => Promise<void>; busy: boolean; setBusy: (b: boolean) => void }) {
  const [motivo, setMotivo] = useState('');
  const [combustible, setCombustible] = useState<number | ''>('');
  const [notas, setNotas] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await marcar({
        kind,
        motivo: motivo.trim() || null,
        combustible_litros: combustible === '' ? null : Number(combustible),
        notas: notas.trim() || null,
      });
      toast.success(kind === 'encendido' ? 'Planta encendida registrada' : 'Planta apagada registrada');
      await onDone();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={onSubmit} className="bg-card rounded-3xl border border-border shadow-xl max-w-md w-full p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold flex items-center gap-2">
          {kind === 'encendido' ? <Lightning weight="fill" className="text-amber-500" size={22} /> : <LightningSlash size={22} />}
          Registrar {kind}
        </h2>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Motivo (opcional)</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={kind === 'encendido' ? 'Corte de luz, mantenimiento, prueba…' : 'Regreso de luz, fin de prueba…'}
            className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" />
        </div>
        {kind === 'encendido' && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Combustible cargado (litros, opcional)</label>
            <input type="number" min={0} step="0.1" value={combustible} onChange={(e) => setCombustible(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm" placeholder="0" />
          </div>
        )}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={busy} className={`h-11 px-6 rounded-xl font-semibold text-sm text-white disabled:opacity-60 ${kind === 'encendido' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-700 hover:bg-slate-800'}`}>
            {busy ? 'Guardando...' : `Confirmar ${kind}`}
          </button>
          <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
        </div>
      </form>
    </div>
  );
}
