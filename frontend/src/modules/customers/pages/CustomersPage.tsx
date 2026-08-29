import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, MagnifyingGlass, UserCircle, EnvelopeSimple } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { listCustomers, type Customer } from '../api/customers.api';
import { CustomerFormDialog } from '../components/CustomerFormDialog';
import { formatCurrency } from '../../../shared/lib/format';

const SEGMENTS = [
  { value: '', label: 'Todos' },
  { value: 'vip', label: 'VIP (3+ estancias)' },
  { value: 'recientes', label: 'Recientes (30d)' },
  { value: 'inactivos', label: 'Inactivos (90d)' },
  { value: 'birthdays_month', label: 'Cumple este mes' },
] as const;

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<typeof SEGMENTS[number]['value']>('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params: { search?: string; segment?: 'vip' | 'inactivos' | 'birthdays_month' | 'recientes'; limit: number } = { limit: 100 };
      if (search) params.search = search;
      if (segment && (segment as string) !== '') {
        params.segment = segment as 'vip' | 'inactivos' | 'birthdays_month' | 'recientes';
      }
      const r = await listCustomers(params);
      setItems(r.data);
      setTotal(r.pagination.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 400);
    return () => clearTimeout(t);
  }, [segment, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Huespedes"
        subtitle={`${total} huespedes registrados`}
        actions={
          <>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            <button type="button" onClick={() => setShowForm(true)} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><Plus size={12} weight="bold" /> Nuevo huesped</button>
          </>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Buscar por nombre, email o documento..."
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value as typeof segment)}
          className="h-10 px-3 rounded-xl border border-border bg-card text-sm cursor-pointer outline-none focus:border-primary"
        >
          {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => void load()} className="h-10 px-4 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90">Buscar</button>
      </div>

      {/* Tabla */}
      <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={UserCircle} title="Sin huespedes" description="Aun no se han registrado huespedes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Nombre</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Documento</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Contacto</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estancias</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total gastado</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Marketing</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link to={`/huespedes/${c.id}`} className="font-semibold hover:text-primary">{c.nombres} {c.apellidos}</Link>
                      {c.nacionalidad && <p className="text-[11px] text-muted-foreground">{c.nacionalidad}</p>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="text-[10px] uppercase tracking-wider">{c.doc_kind}</span> · {c.doc_numero}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-[12px]">
                      <p>{c.email ?? '—'}</p>
                      {c.telefono && <p>{c.telefono}</p>}
                    </td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{c.total_estancias}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{formatCurrency(c.total_gastado)}</td>
                    <td className="px-5 py-3">
                      {c.accepts_marketing
                        ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400"><EnvelopeSimple size={12} weight="duotone" /> Si</span>
                        : <span className="text-[11px] text-muted-foreground">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <CustomerFormDialog onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void load(); }} />}
    </div>
  );
}
