import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, EnvelopeSimple, X, PaperPlaneTilt } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import {
  listCampaigns, createCampaign, sendCampaignNow, cancelCampaign, listTemplates,
  type Campaign, type EmailTemplate,
} from '../api/campaigns.api';
import { formatDateTime } from '../../../shared/lib/format';

const SEGMENTS = [
  { value: 'all', label: 'Todos los huespedes' },
  { value: 'vip', label: 'VIP (3+ estancias)' },
  { value: 'inactivos', label: 'Inactivos (90d)' },
  { value: 'birthdays_month', label: 'Cumple este mes' },
];

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [camps, tpls] = await Promise.all([listCampaigns(), listTemplates()]);
      setItems(camps);
      setTemplates(tpls);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function onSendNow(c: Campaign) {
    if (!confirm(`Enviar la campaña "${c.nombre}" ahora?`)) return;
    try {
      const r = await sendCampaignNow(c.id);
      toast.success(`Enviada: ${r.enviados} OK, ${r.fallidos} fallidos de ${r.total}`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function onCancel(c: Campaign) {
    try {
      await cancelCampaign(c.id);
      toast.success('Campaña cancelada');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campañas de email"
        subtitle="Comunicacion masiva con huespedes"
        actions={
          <>
            <Link to="/campaigns/templates" className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5">Plantillas</Link>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            <button type="button" onClick={() => setShowForm(true)} disabled={!templates.length} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5 disabled:opacity-50"><Plus size={12} weight="bold" /> Nueva campaña</button>
          </>
        }
      />

      {!templates.length && !loading && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-sm">
          <p className="text-amber-700 dark:text-amber-400 font-semibold">No hay plantillas activas.</p>
          <p className="text-amber-600 dark:text-amber-400/80 text-xs mt-1">Crea una <Link to="/campaigns/templates" className="underline font-bold">plantilla</Link> antes de configurar campañas.</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>
      ) : items.length === 0 ? (
        <EmptyState icon={EnvelopeSimple} title="Sin campañas" description="Crea la primera campaña con una plantilla y un segmento." />
      ) : (
        <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Nombre</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Segmento</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Destinatarios</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Enviados</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-semibold">{c.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDateTime(c.created_at)}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      c.status === 'enviada' ? 'bg-emerald-50 text-emerald-700' :
                      c.status === 'borrador' ? 'bg-gray-100 text-gray-700' :
                      c.status === 'programada' ? 'bg-blue-50 text-blue-700' :
                      c.status === 'enviando' ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>{c.status}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{c.segmento.type ?? 'all'}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{c.total_destinatarios}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">{c.total_enviados}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      {c.status === 'borrador' || c.status === 'programada' ? (
                        <>
                          <button type="button" onClick={() => void onSendNow(c)} className="h-7 px-2 text-[11px] font-semibold bg-primary text-primary-foreground rounded hover:bg-primary/90 flex items-center gap-1"><PaperPlaneTilt size={11} weight="bold" /> Enviar</button>
                          <button type="button" onClick={() => void onCancel(c)} className="h-7 px-2 text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700 rounded hover:bg-red-100">Cancelar</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && templates.length > 0 && (
        <CampaignFormDialog
          templates={templates}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }}
        />
      )}
    </div>
  );
}

function CampaignFormDialog({ templates, onClose, onSaved }: { templates: EmailTemplate[]; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState('');
  const [templateId, setTemplateId] = useState<number>(templates[0]?.id ?? 0);
  const [segmento, setSegmento] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !templateId) return;
    setSubmitting(true);
    try {
      await createCampaign({ nombre: nombre.trim(), template_id: templateId, segmento: { type: segmento }, event: 'manual' });
      toast.success('Campaña creada como borrador');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Nueva campaña</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:bg-card" placeholder="Recuperacion mayo 2026" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Plantilla</label>
            <select value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
              {templates.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.event})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Segmento</label>
            <select value={segmento} onChange={(e) => setSegmento(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
              {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">Solo se enviara a huespedes con email y consentimiento de marketing (excepto segmento "Todos").</p>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">{submitting ? 'Creando...' : 'Crear borrador'}</button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
