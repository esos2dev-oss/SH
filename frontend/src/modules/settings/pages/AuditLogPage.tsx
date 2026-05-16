import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowClockwise, Notebook } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { listAudit, type AuditEntry, type AuditAction } from '../api/audit.api';
import { formatDateTime } from '../../../shared/lib/format';

const ACTIONS: AuditAction[] = ['create', 'update', 'delete', 'login', 'logout', 'status_change', 'permission_change', 'export'];

const ACTION_COLORS: Record<AuditAction, string> = {
  create: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  update: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  delete: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  login: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400',
  logout: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  status_change: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  permission_change: 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400',
  export: 'bg-pink-50 text-pink-700 dark:bg-pink-950/30 dark:text-pink-400',
};

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState<AuditAction | ''>('');
  const [entity, setEntity] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params: { limit: number; action?: AuditAction; entity?: string } = { limit: 100 };
      if (action) params.action = action;
      if (entity) params.entity = entity;
      const r = await listAudit(params);
      setItems(r.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [action, entity]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        subtitle="Bitacora de acciones del sistema"
        actions={
          <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
        }
      />

      <div className="flex gap-2 items-end">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Accion</label>
          <select value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')} className="h-9 px-3 rounded-lg border border-border bg-card text-sm cursor-pointer outline-none focus:border-primary">
            <option value="">Todas</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Entidad</label>
          <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="bookings, rooms, users..." className="h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Notebook} title="Sin registros" />
      ) : (
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <div className="divide-y">
            {items.map((e) => (
              <div key={e.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  className="w-full px-5 py-3 hover:bg-muted/30 flex items-center gap-3 text-left text-[13px]"
                >
                  <span className="text-muted-foreground font-mono text-[11px] tabular-nums w-32">{formatDateTime(e.created_at)}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${ACTION_COLORS[e.action]}`}>{e.action}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{e.entity}{e.entity_id ? `#${e.entity_id}` : ''}</span>
                  <span className="flex-1 truncate">{e.user_nombre ?? '— sin usuario —'}</span>
                </button>
                {expanded === e.id && (
                  <div className="px-5 pb-4 bg-muted/20">
                    {e.before !== null && (
                      <div className="mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Antes</p>
                        <pre className="text-[11px] bg-card border border-border rounded p-2 overflow-x-auto">{JSON.stringify(e.before, null, 2)}</pre>
                      </div>
                    )}
                    {e.after !== null && (
                      <div className="mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Despues</p>
                        <pre className="text-[11px] bg-card border border-border rounded p-2 overflow-x-auto">{JSON.stringify(e.after, null, 2)}</pre>
                      </div>
                    )}
                    {(e.ip || e.user_agent) && (
                      <div className="text-[10px] text-muted-foreground">
                        {e.ip && <p>IP: {e.ip}</p>}
                        {e.user_agent && <p className="truncate">UA: {e.user_agent}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
