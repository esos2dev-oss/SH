import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, ArrowClockwise, EnvelopeSimple, X, ArrowLeft, Eye } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, previewTemplate,
  type EmailTemplate, type EmailEvent,
} from '../api/campaigns.api';

const EVENTS: EmailEvent[] = ['bienvenida', 'post_estancia', 'fecha_especial', 'recuperacion', 'manual'];

export default function EmailTemplatesPage() {
  const [items, setItems] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await listTemplates());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function onDelete(id: number, nombre: string) {
    if (!confirm(`Desactivar plantilla "${nombre}"?`)) return;
    try {
      await deleteTemplate(id);
      toast.success('Plantilla desactivada');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Volver a campañas</Link>

      <PageHeader
        title="Plantillas de email"
        subtitle="Plantillas con variables Mustache: {'{{customer.nombres}}'}, {'{{hotel.nombre}}'}, etc."
        actions={
          <>
            <button type="button" onClick={() => void load()} className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5"><ArrowClockwise size={12} weight="bold" /> Refrescar</button>
            <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/20 flex items-center gap-1.5"><Plus size={12} weight="bold" /> Nueva plantilla</button>
          </>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>
      ) : items.length === 0 ? (
        <EmptyState icon={EnvelopeSimple} title="Sin plantillas" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((t) => (
            <div key={t.id} className="bg-card rounded-3xl border border-border shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{t.nombre}</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t.event}</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{t.asunto}</p>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setPreviewing(t)} className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"><Eye size={12} /> Preview</button>
                <button type="button" onClick={() => { setEditing(t); setShowForm(true); }} className="text-xs font-semibold text-primary hover:underline">Editar</button>
                {t.active && <button type="button" onClick={() => void onDelete(t.id, t.nombre)} className="text-xs font-semibold text-destructive hover:underline">Desactivar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TemplateFormDialog
          tpl={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }}
        />
      )}

      {previewing && (
        <PreviewDialog tpl={previewing} onClose={() => setPreviewing(null)} />
      )}
    </div>
  );
}

function TemplateFormDialog({ tpl, onClose, onSaved }: { tpl: EmailTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(tpl?.nombre ?? '');
  const [event, setEvent] = useState<EmailEvent>(tpl?.event ?? 'manual');
  const [asunto, setAsunto] = useState(tpl?.asunto ?? '');
  const [bodyHtml, setBodyHtml] = useState(tpl?.body_html ?? '');
  const [bodyText, setBodyText] = useState(tpl?.body_text ?? '');
  const [variables, setVariables] = useState((tpl?.variables ?? []).join(', '));
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !asunto.trim() || !bodyHtml.trim()) {
      toast.error('Completa nombre, asunto y body HTML');
      return;
    }
    setSubmitting(true);
    try {
      const data = {
        nombre: nombre.trim(),
        event,
        asunto: asunto.trim(),
        body_html: bodyHtml,
        body_text: bodyText.trim() || null,
        variables: variables.split(',').map((v) => v.trim()).filter(Boolean),
      };
      if (tpl) await updateTemplate(tpl.id, data);
      else await createTemplate(data);
      toast.success(tpl ? 'Plantilla actualizada' : 'Plantilla creada');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{tpl ? `Editar ${tpl.nombre}` : 'Nueva plantilla'}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:bg-card" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Evento</label>
              <select value={event} onChange={(e) => setEvent(e.target.value as EmailEvent)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm cursor-pointer outline-none focus:border-primary focus:bg-card">
                {EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Asunto</label>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:bg-card" placeholder="Hola {{customer.nombres}}" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Body HTML</label>
            <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={8} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm font-mono outline-none focus:border-primary focus:bg-card" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Body texto plano (opcional)</label>
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={3} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm font-mono outline-none focus:border-primary focus:bg-card" />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">Variables esperadas (separadas por coma)</label>
            <input value={variables} onChange={(e) => setVariables(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:bg-card" placeholder="customer.nombres, hotel.nombre" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">{submitting ? 'Guardando...' : tpl ? 'Actualizar' : 'Crear'}</button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PreviewDialog({ tpl, onClose }: { tpl: EmailTemplate; onClose: () => void }) {
  const [preview, setPreview] = useState<{ asunto: string; html: string; text: string | null } | null>(null);

  useEffect(() => {
    void previewTemplate(tpl.id).then(setPreview).catch((err) => toast.error(err instanceof ApiError ? err.message : 'Error'));
  }, [tpl.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Preview · {tpl.nombre}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        {!preview ? <p className="text-sm text-muted-foreground">Generando...</p> : (
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Asunto</p>
              <p className="font-semibold mt-1">{preview.asunto}</p>
            </div>
            <div className="bg-white text-black border border-border rounded-2xl p-4 overflow-x-auto">
              <div dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
