import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, MagnifyingGlass, UserCircle, X, EnvelopeSimple } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { listCustomers, createCustomer, type Customer, type DocKind } from '../api/customers.api';
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
      const params: { search?: string; segment?: typeof segment; limit: number } = { limit: 100 };
      if (search) params.search = search;
      if (segment) params.segment = segment;
      const r = await listCustomers(params);
      setItems(r.data);
      setTotal(r.pagination.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [segment]);

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
          <div className="p-12 text-center text-sm text-muted-foreground">Cargando...</div>
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
                      <Link to={`/customers/${c.id}`} className="font-semibold hover:text-primary">{c.nombres} {c.apellidos}</Link>
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

function CustomerFormDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [docKind, setDocKind] = useState<DocKind>('cedula');
  const [docNumero, setDocNumero] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fechaNac, setFechaNac] = useState('');
  const [nacionalidad, setNacionalidad] = useState('');
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombres.trim() || !apellidos.trim() || !docNumero.trim()) {
      toast.error('Completa nombres, apellidos y documento');
      return;
    }
    setSubmitting(true);
    try {
      await createCustomer({
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        doc_kind: docKind,
        doc_numero: docNumero.trim(),
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        fecha_nacimiento: fechaNac || null,
        nacionalidad: nacionalidad.trim() || null,
        accepts_marketing: acceptsMarketing,
      });
      toast.success('Huesped creado');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Nuevo huesped</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Nombres" value={nombres} onChange={setNombres} required />
            <FieldInput label="Apellidos" value={apellidos} onChange={setApellidos} required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Tipo doc</label>
              <select value={docKind} onChange={(e) => setDocKind(e.target.value as DocKind)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
                <option value="cedula">Cedula</option>
                <option value="dni">DNI</option>
                <option value="pasaporte">Pasaporte</option>
                <option value="licencia">Licencia</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="col-span-2"><FieldInput label="Numero" value={docNumero} onChange={setDocNumero} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Email" type="email" value={email} onChange={setEmail} />
            <FieldInput label="Telefono" value={telefono} onChange={setTelefono} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Fecha de nacimiento" type="date" value={fechaNac} onChange={setFechaNac} />
            <FieldInput label="Nacionalidad" value={nacionalidad} onChange={setNacionalidad} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={acceptsMarketing} onChange={(e) => setAcceptsMarketing(e.target.checked)} />
            Acepta recibir comunicaciones de marketing
          </label>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">{submitting ? 'Guardando...' : 'Crear'}</button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
    </div>
  );
}
