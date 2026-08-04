// Conciliacion bancaria: subir extracto, ver match automatico, conciliar manual.

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../../shared/lib/errors';
import { toast } from 'sonner';
import { Upload, Bank, ArrowsLeftRight, CheckCircle, ArrowLeft, Sparkle } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Label } from '../../../shared/components/ui/label';
import { SelectNative } from '../../../shared/components/ui/select-native';
import { listPayments, type PaymentPublic } from '../api/payments.api';
import {
  uploadStatement, listStatements, listMovements, autoConfirm, getSuggestions, matchMovement,
  type BankKey, type BankStatement, type BankMovement, type MatchSuggestion,
} from '../api/bank.api';
import { useOnPaymentSaved } from '../hooks/QuickPaymentProvider';
import { cn } from '../../../shared/lib/cn';
import { formatCurrency, formatDate } from '../../../shared/lib/format';
import { METHOD_LABELS } from '../lib/labels';

const BANKS: Array<{ value: BankKey; label: string }> = [
  { value: 'banesco', label: 'Banesco' },
  { value: 'mercantil', label: 'Mercantil' },
  { value: 'venezuela', label: 'Banco de Venezuela (BDV)' },
  { value: 'provincial', label: 'Provincial' },
  { value: 'generic', label: 'Otro (detectar automatico)' },
];

export default function BankReconciliationPage() {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatements = useCallback(async () => {
    setLoading(true);
    try {
      const s = await listStatements();
      setStatements(s);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadStatements(); }, [loadStatements]);

  if (selectedId !== null) {
    const stmt = statements.find((s) => s.id === selectedId);
    return (
      <StatementDetail
        statementId={selectedId}
        statement={stmt}
        onBack={() => { setSelectedId(null); void loadStatements(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Conciliacion bancaria" subtitle="Sube tu estado de cuenta y matchea contra pagos por confirmar." />

      <UploadCard onUploaded={() => void loadStatements()} />

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Extractos cargados</h3>
        {loading ? (
          <p className="text-center py-8 text-sm text-muted-foreground">Cargando...</p>
        ) : statements.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">Aun no has subido ningun extracto.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {statements.map((s) => {
              const pct = s.total_movs > 0 ? Math.round((s.matched_movs / s.total_movs) * 100) : 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className="text-left bg-card border border-border rounded-2xl p-4 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Bank size={16} weight="duotone" className="text-primary" />
                    <p className="font-bold text-sm capitalize">{s.banco}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 truncate">{s.original_name}</p>
                  <p className="text-xs">{formatDate(s.fecha_desde)} → {formatDate(s.fecha_hasta)}</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{s.matched_movs}/{s.total_movs} matched</span>
                    <span className={cn('font-bold', pct === 100 ? 'text-emerald-600' : pct > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn('h-full', pct === 100 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================

function UploadCard({ onUploaded }: { onUploaded: () => void }) {
  const [banco, setBanco] = useState<BankKey>('banesco');
  const [moneda, setMoneda] = useState('VES');
  const [cuenta, setCuenta] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const opts: { moneda: string; cuenta?: string } = { moneda };
      if (cuenta) opts.cuenta = cuenta;
      const r = await uploadStatement(banco, file, opts);
      toast.success(`${r.matched} de ${r.total} movimientos matcheados automaticamente.`);
      if (r.warnings.length > 0) {
        toast.warning(r.warnings.join('\n'));
      }
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el extracto');
    } finally { setUploading(false); }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <Label>Banco</Label>
          <SelectNative value={banco} onChange={(e) => setBanco(e.target.value as BankKey)}>
            {BANKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </SelectNative>
        </div>
        <div>
          <Label>Moneda</Label>
          <SelectNative value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="VES">VES (Bs)</option>
            <option value="USD">USD</option>
          </SelectNative>
        </div>
        <div>
          <Label>Cuenta (opcional)</Label>
          <Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="0134-...." />
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full"
          >
            <Upload size={14} weight="bold" className="mr-1.5" />
            {uploading ? 'Subiendo...' : 'Subir extracto'}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Acepta CSV o TXT exportado desde la web del banco. El sistema parsea, persiste y matchea contra pagos en estado <strong>por confirmar</strong>.
      </p>
    </div>
  );
}

// =============================================================================

function StatementDetail({ statementId, statement, onBack }: { statementId: number; statement: BankStatement | undefined; onBack: () => void }) {
  const [movs, setMovs] = useState<BankMovement[]>([]);
  const [onlyUnmatched, setOnlyUnmatched] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await listMovements(statementId, onlyUnmatched);
      setMovs(m);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setLoading(false); }
  }, [statementId, onlyUnmatched]);

  useEffect(() => { void load(); }, [load]);
  useOnPaymentSaved(useCallback(() => { void load(); }, [load]));

  async function handleAutoConfirm() {
    try {
      const r = await autoConfirm(statementId);
      toast.success(`${r.confirmed} pagos confirmados automaticamente.`);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Volver
      </button>

      <PageHeader
        title={statement ? `${statement.banco.toUpperCase()} · ${statement.original_name}` : 'Extracto'}
        subtitle={statement ? `${formatDate(statement.fecha_desde)} → ${formatDate(statement.fecha_hasta)} · ${statement.matched_movs}/${statement.total_movs} matched` : ''}
        actions={
          <Button type="button" onClick={handleAutoConfirm} variant="outline">
            <CheckCircle size={14} weight="bold" className="mr-1.5" /> Confirmar matches exactos
          </Button>
        }
      />

      <div className="flex items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={onlyUnmatched} onChange={(e) => setOnlyUnmatched(e.target.checked)} />
          Solo no conciliados (creditos)
        </label>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-muted-foreground">Cargando movimientos...</p>
      ) : movs.length === 0 ? (
        <p className="text-center py-8 text-sm text-muted-foreground">{onlyUnmatched ? 'Sin movimientos pendientes. Todo conciliado.' : 'Sin movimientos.'}</p>
      ) : (
        <div className="space-y-2">
          {movs.map((m) => <MovementRow key={m.id} movement={m} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}

// =============================================================================

function MovementRow({ movement, onChanged }: { movement: BankMovement; onChanged: () => Promise<void> }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [payments, setPayments] = useState<Record<number, PaymentPublic>>({});

  async function loadSuggestions() {
    try {
      const s = await getSuggestions(movement.id);
      setSuggestions(s);
      // Cargar info de los pagos sugeridos
      const ps: Record<number, PaymentPublic> = {};
      const list = await listPayments({ limit: 100, status: 'pending_confirmation' });
      for (const p of list.data) ps[p.id] = p;
      setPayments(ps);
      setShowSuggestions(true);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function handleMatch(paymentId: number | null) {
    try {
      await matchMovement(movement.id, paymentId);
      toast.success(paymentId ? 'Match registrado' : 'Match removido');
      setShowSuggestions(false);
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
              movement.tipo === 'C' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
            )}>
              {movement.tipo === 'C' ? 'Credito' : 'Debito'}
            </span>
            <p className="font-bold tabular-nums">{formatCurrency(movement.monto, movement.moneda)}</p>
            <span className="text-xs text-muted-foreground">{formatDate(movement.fecha)}</span>
          </div>
          {movement.referencia && <p className="text-xs text-muted-foreground mt-1">Ref: {movement.referencia}</p>}
          {movement.descripcion && <p className="text-xs mt-1 line-clamp-1">{movement.descripcion}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {movement.matched_payment_id !== null ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Match #{movement.matched_payment_id}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void handleMatch(null)}>
                Quitar match
              </Button>
            </>
          ) : movement.tipo === 'C' ? (
            <Button size="sm" variant="outline" onClick={loadSuggestions}>
              <Sparkle size={12} weight="bold" className="mr-1" /> Sugerencias
            </Button>
          ) : null}
        </div>
      </div>

      {showSuggestions && (
        <div className="mt-3 pt-3 border-t border-border space-y-1.5">
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin pagos candidatos.</p>
          ) : suggestions.map((s) => {
            const p = payments[s.payment_id];
            return (
              <div key={s.payment_id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold">{p ? `${METHOD_LABELS[p.method]} · ${formatCurrency(p.monto, p.moneda)}` : `Pago #${s.payment_id}`}</p>
                  {p?.booking && <p className="text-[10px] text-muted-foreground">{p.booking.codigo}</p>}
                  {p?.referencia && <p className="text-[10px] text-muted-foreground">Ref pago: {p.referencia}</p>}
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">Score {s.score} · {s.reason}</p>
                </div>
                <Button size="sm" onClick={() => void handleMatch(s.payment_id)}>
                  <ArrowsLeftRight size={12} weight="bold" className="mr-1" /> Match
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
