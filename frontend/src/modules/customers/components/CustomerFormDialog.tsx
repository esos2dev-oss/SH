// Dialog reutilizable para crear/editar huesped.
// - sin `customer`: modo crear, llama createCustomer
// - con `customer`: modo editar, llama updateCustomer

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { X } from '@phosphor-icons/react';
import { ApiError } from '../../../shared/api/client';
import {
  createCustomer, updateCustomer,
  REFERRAL_SOURCE_LABELS,
  type Customer, type DocKind, type ReferralSource,
} from '../api/customers.api';

interface Props {
  customer?: Customer;
  onClose: () => void;
  onSaved: (c: Customer) => void;
}

export function CustomerFormDialog({ customer, onClose, onSaved }: Props) {
  const isEdit = !!customer;
  const [nombres, setNombres] = useState(customer?.nombres ?? '');
  const [apellidos, setApellidos] = useState(customer?.apellidos ?? '');
  const [docKind, setDocKind] = useState<DocKind>(customer?.doc_kind ?? 'cedula');
  const [docNumero, setDocNumero] = useState(customer?.doc_numero ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [telefono, setTelefono] = useState(customer?.telefono ?? '');
  const [fechaNac, setFechaNac] = useState(customer?.fecha_nacimiento ?? '');
  const [nacionalidad, setNacionalidad] = useState(customer?.nacionalidad ?? '');
  const [direccion, setDireccion] = useState(customer?.direccion ?? '');
  const [vehiclePlate, setVehiclePlate] = useState(customer?.vehicle_plate ?? '');
  const [referralSource, setReferralSource] = useState<ReferralSource | ''>(customer?.referral_source ?? '');
  const [referralOther, setReferralOther] = useState(customer?.referral_other ?? '');
  const [notas, setNotas] = useState(customer?.notas ?? '');
  const [acceptsMarketing, setAcceptsMarketing] = useState(customer?.accepts_marketing ?? false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombres.trim() || !apellidos.trim() || !docNumero.trim()) {
      toast.error('Completa nombres, apellidos y documento');
      return;
    }
    if (referralSource === 'otro' && !referralOther.trim()) {
      toast.error('Especifica como nos conocio');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        doc_kind: docKind,
        doc_numero: docNumero.trim(),
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        fecha_nacimiento: fechaNac || null,
        nacionalidad: nacionalidad.trim() || null,
        direccion: direccion.trim() || null,
        vehicle_plate: vehiclePlate.trim().toUpperCase() || null,
        referral_source: referralSource || null,
        referral_other: referralSource === 'otro' ? referralOther.trim() : null,
        notas: notas.trim() || null,
        accepts_marketing: acceptsMarketing,
      };
      const saved = isEdit
        ? await updateCustomer(customer!.id, payload)
        : await createCustomer(payload);
      toast.success(isEdit ? 'Huesped actualizado' : 'Huesped creado');
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-border shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{isEdit ? 'Editar huesped' : 'Nuevo huesped'}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombres" required value={nombres} onChange={setNombres} />
            <Input label="Apellidos" required value={apellidos} onChange={setApellidos} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Tipo doc</Label>
              <select value={docKind} onChange={(e) => setDocKind(e.target.value as DocKind)} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm">
                <option value="cedula">Cedula</option>
                <option value="dni">DNI</option>
                <option value="pasaporte">Pasaporte</option>
                <option value="licencia">Licencia</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="col-span-2"><Input label="Numero documento" required value={docNumero} onChange={setDocNumero} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" value={email} onChange={setEmail} />
            <Input label="Telefono" value={telefono} onChange={setTelefono} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha de nacimiento" type="date" value={fechaNac} onChange={setFechaNac} />
            <Input label="Nacionalidad" value={nacionalidad} onChange={setNacionalidad} />
          </div>
          <Input label="Direccion" value={direccion} onChange={setDireccion} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Placa de vehiculo" value={vehiclePlate} onChange={setVehiclePlate} placeholder="AB123CD" />
            <div>
              <Label>Donde nos conocio</Label>
              <select value={referralSource} onChange={(e) => setReferralSource(e.target.value as ReferralSource | '')} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm">
                <option value="">— Sin especificar —</option>
                {Object.entries(REFERRAL_SOURCE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          {referralSource === 'otro' && (
            <Input label="Especifica como nos conocio" required value={referralOther} onChange={setReferralOther} />
          )}
          <div>
            <Label>Notas internas</Label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-sm" placeholder="Alergias, preferencias, advertencias..." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={acceptsMarketing} onChange={(e) => setAcceptsMarketing(e.target.checked)} />
            Acepta recibir comunicaciones de marketing
          </label>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60">
              {submitting ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear')}
            </button>
            <button type="button" onClick={onClose} className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">{children}</label>;
}

function Input({ label, value, onChange, type = 'text', required, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <div>
      <Label>{label} {required && <span className="text-destructive">*</span>}</Label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card" />
    </div>
  );
}
