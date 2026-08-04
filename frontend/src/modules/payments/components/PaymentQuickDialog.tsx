// Dialog rapido de pago. Atajo P global lo abre.
// Flujo:
//  1. Seleccionar metodo
//  2. Seleccionar destino (reserva/huesped) salvo que venga preasignado
//  3. Capturar detalles del metodo (banco emisor, ref, etc.)
//  4. Monto + moneda + tasa BCV (autocargada)
//  5. Notas + fecha
//  6. Guardar / Guardar y registrar otro

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FloppyDisk, Plus, WarningCircle, Spinner } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../shared/components/ui/dialog';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Label } from '../../../shared/components/ui/label';
import { Textarea } from '../../../shared/components/ui/textarea';
import { SelectNative } from '../../../shared/components/ui/select-native';
import { errorMessage } from '../../../shared/lib/errors';
import { formatCurrency } from '../../../shared/lib/format';
import { convertAmount, convertNumber, unitsPerUsd, isRateStale, rateAgeDays, type RateSnapshot } from '../lib/currency';
import { MethodSelector } from './MethodSelector';
import { MethodFields, type MethodFieldsValue } from './MethodFields';
import { TargetLookup, type SelectedTarget } from './TargetLookup';
import { ReceiptUploader } from './ReceiptUploader';
import { createPayment, getCurrentRate, type CreatePaymentInput, type PaymentMethod } from '../api/payments.api';
import {
  METHOD_LABELS,
  methodCurrency,
  methodStartsAsPending,
} from '../lib/labels';

export interface QuickPaymentInitial {
  /** Si se pasa una reserva, la seleccion queda fija */
  booking_id?: number;
  /** Si se pasa solo huesped (pago suelto) */
  customer_id?: number;
  /** Label/hint precargados para mostrar sin re-consultar (opcional) */
  preselected?: SelectedTarget;
  /** Monto sugerido */
  monto?: number;
  /** Moneda sugerida */
  moneda?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: QuickPaymentInitial;
  onSaved?: () => void;
}

interface FormState {
  method: PaymentMethod | null;
  target: SelectedTarget | null;
  methodFields: MethodFieldsValue;
  monto: string;
  moneda: string;
  pagado_at: string;
  notas: string;
  receipt_url: string | null;
  receipt_mime: string | null;
}

function toLocalDatetimeInput(d: Date): string {
  // YYYY-MM-DDTHH:mm para input[type="datetime-local"]
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoFromLocal(local: string): string {
  // Convierte de YYYY-MM-DDTHH:mm a ISO con offset
  return new Date(local).toISOString();
}

function emptyForm(initial?: QuickPaymentInitial): FormState {
  return {
    method: null,
    target: initial?.preselected ?? (initial?.booking_id ? null : initial?.customer_id ? null : null),
    methodFields: { method_details: {} },
    monto: initial?.monto ? String(initial.monto) : '',
    moneda: initial?.moneda ?? 'USD',
    pagado_at: toLocalDatetimeInput(new Date()),
    notas: '',
    receipt_url: null,
    receipt_mime: null,
  };
}

export function PaymentQuickDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => emptyForm(initial));
  const [submitting, setSubmitting] = useState(false);
  const [rate, setRate] = useState<RateSnapshot | null>(null);
  const [rateLoaded, setRateLoaded] = useState(false);

  // Cargar tasa actual al abrir
  useEffect(() => {
    if (!open) return;
    setRateLoaded(false);
    getCurrentRate()
      .then((r) => setRate(r))
      .catch(() => setRate(null))
      .finally(() => setRateLoaded(true));
  }, [open]);

  // Reiniciar form al abrir
  useEffect(() => {
    if (open) {
      setForm(emptyForm(initial));
    }
  }, [open, initial]);

  // Si el metodo cambia, autoajustar moneda + limpiar method_details.
  //
  // CLAVE (bug 3): antes esto cambiaba la ETIQUETA de moneda dejando el monto
  // intacto. Con un saldo de 320 EUR precargado, elegir "Pago Movil" lo dejaba
  // como "320 VES" — 0,05 EUR en vez de 320. Ahora CONVERTIMOS el importe a la
  // moneda del metodo usando la tasa vigente.
  useEffect(() => {
    if (!form.method) return;
    const destino = methodCurrency(form.method);
    setForm((f) => {
      const origen = f.moneda;
      const next: FormState = {
        ...f,
        methodFields: { method_details: { kind: form.method }, referencia: f.methodFields.referencia },
        moneda: destino ?? f.moneda,
      };
      if (destino && destino !== origen) {
        const convertido = convertAmount(f.monto, origen, destino, rate);
        // Si no hay tasa para convertir, vaciamos el campo: es preferible que
        // recepcion vuelva a teclear el importe a que cobre una cifra falsa.
        next.monto = convertido ?? '';
      }
      return next;
    });
  }, [form.method, rate]);

  // Si preseleccionaste reserva y la moneda de la reserva esta disponible, prefer
  useEffect(() => {
    if (form.target?.moneda && !form.method) {
      setForm((f) => ({ ...f, moneda: f.target?.moneda ?? f.moneda }));
    }
  }, [form.target, form.method]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function clientValidate(): string | null {
    if (!form.method) return 'Selecciona un metodo de pago';
    if (!form.target) return 'Selecciona una reserva o huesped';
    const monto = Number(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) return 'Ingresa un monto valido';
    if (!form.moneda || form.moneda.length !== 3) return 'Moneda invalida';
    // Sin tasa no se puede contabilizar el cobro en moneda base: la BD lo
    // rechazaria igualmente, pero avisamos antes de que el usuario lo intente.
    if (unitsPerUsd(form.moneda, rate) === null) {
      return `No hay tasa registrada para ${form.moneda}. Sincroniza o registra la tasa antes de cobrar en esa moneda.`;
    }
    if (form.method === 'pago_movil') {
      const d = form.methodFields.method_details as Record<string, unknown>;
      if (!d['banco_emisor']) return 'Banco emisor requerido';
      if (!d['titular_doc']) return 'Cedula del titular requerida';
      if (!d['titular_telefono']) return 'Telefono del titular requerido';
      if (!form.methodFields.referencia || form.methodFields.referencia.length < 4) {
        return 'Referencia (al menos 4 digitos) requerida';
      }
    }
    if (form.method === 'transferencia') {
      if (!form.methodFields.referencia) return 'Referencia requerida para transferencia';
    }
    if (form.method === 'tarjeta') {
      const u4 = (form.methodFields.method_details as Record<string, unknown>)['ultimos_4'] as string | undefined;
      if (!u4 || !/^\d{4}$/.test(u4)) return 'Ultimos 4 digitos requeridos';
    }
    if (form.method === 'zelle') {
      const em = (form.methodFields.method_details as Record<string, unknown>)['email_titular'] as string | undefined;
      if (!em || !/.+@.+\..+/.test(em)) return 'Email del titular invalido';
    }
    if (form.method === 'otro') {
      const desc = (form.methodFields.method_details as Record<string, unknown>)['descripcion'] as string | undefined;
      if (!desc) return 'Descripcion del metodo requerida';
    }
    return null;
  }

  async function handleSave(andOther: boolean) {
    const err = clientValidate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!form.method || !form.target) return;

    const payload: CreatePaymentInput = {
      booking_id: form.target.booking_id ?? null,
      customer_id: form.target.customer_id ?? null,
      monto: Number(form.monto),
      moneda: form.moneda,
      // Congelamos la tasa usada en el momento del cobro. Sin esto, recalcular
      // el estado de cuenta mañana con otra tasa cambiaba pagos ya cerrados.
      tasa_cambio: unitsPerUsd(form.moneda, rate),
      method: form.method,
      method_details: { kind: form.method, ...form.methodFields.method_details } as Record<string, unknown>,
      referencia: form.methodFields.referencia ?? null,
      pagado_at: isoFromLocal(form.pagado_at),
      notas: form.notas || null,
      receipt_url: form.receipt_url,
      receipt_mime: form.receipt_mime,
    };

    setSubmitting(true);
    try {
      await createPayment(payload);
      const pending = methodStartsAsPending(form.method);
      toast.success(
        pending
          ? 'Pago registrado en estado "por confirmar"'
          : 'Pago confirmado y contabilizado',
      );
      onSaved?.();
      if (andOther) {
        // Mantener target y metodo, limpiar monto/notas/details/captura
        setForm({
          method: form.method,
          target: form.target,
          methodFields: { method_details: { kind: form.method } },
          monto: '',
          moneda: form.moneda,
          pagado_at: toLocalDatetimeInput(new Date()),
          notas: '',
          receipt_url: null,
          receipt_mime: null,
        });
      } else {
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo registrar el pago'));
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void handleSave(false);
  }

  // Equivalente en moneda base y en la moneda de la reserva, para que recepcion
  // vea SIEMPRE cuanto se esta imputando realmente a la reserva.
  const montoNum = Number(form.monto);
  const equivalenteBase =
    montoNum > 0 ? convertNumber(montoNum, form.moneda, 'USD', rate) : null;
  const monedaReserva = form.target?.moneda ?? null;
  const equivalenteReserva =
    montoNum > 0 && monedaReserva && monedaReserva !== form.moneda
      ? convertNumber(montoNum, form.moneda, monedaReserva, rate)
      : null;
  const tasaVencida = isRateStale(rate);
  const diasTasa = rateAgeDays(rate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Atajo: tecla <kbd className="rounded border bg-muted px-1 text-[10px] font-mono">P</kbd> abre este dialogo desde cualquier pantalla.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Metodo */}
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 block">
              1. Metodo
            </Label>
            <MethodSelector value={form.method} onChange={(m) => setField('method', m)} />
          </div>

          {/* Target (reserva/huesped) */}
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 block">
              2. Reserva o huesped
            </Label>
            <TargetLookup value={form.target} onChange={(t) => setField('target', t)} />
            {form.target && form.target.kind === 'booking' && form.target.importe_pendiente > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Saldo pendiente: <strong>{form.target.importe_pendiente.toFixed(2)} {form.target.moneda ?? ''}</strong>
              </p>
            )}
          </div>

          {form.method && (
            <>
              {/* Detalles segun metodo */}
              <div>
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 block">
                  3. Datos de {METHOD_LABELS[form.method]}
                </Label>
                <MethodFields method={form.method} value={form.methodFields} onChange={(v) => setField('methodFields', v)} />
              </div>

              {/* Monto + moneda + fecha */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="qd-monto">Monto *</Label>
                  <Input
                    id="qd-monto"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.monto}
                    onChange={(e) => setField('monto', e.target.value)}
                    autoFocus
                  />
                  {montoNum > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {equivalenteReserva !== null && (
                        <span className="font-semibold text-foreground">
                          Imputa {formatCurrency(equivalenteReserva, monedaReserva!)} a la reserva.{' '}
                        </span>
                      )}
                      {equivalenteBase !== null
                        ? <>≈ {formatCurrency(equivalenteBase, 'USD')} en moneda base</>
                        : <span className="text-red-600 dark:text-red-400">Sin tasa para convertir {form.moneda}</span>}
                      {rate && ` · tasa del ${rate.fecha}`}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="qd-moneda">Moneda</Label>
                  <SelectNative id="qd-moneda" value={form.moneda} onChange={(e) => setField('moneda', e.target.value)}>
                    <option value="USD">USD</option>
                    <option value="VES">VES (Bs)</option>
                    <option value="EUR">EUR</option>
                  </SelectNative>
                </div>
              </div>

              {/* El aviso anterior solo saltaba si NO habia ninguna tasa. Con una
                  tasa de hace 4 dias no decia nada y cada Pago Movil perdia dinero. */}
              {rateLoaded && form.moneda !== 'USD' && tasaVencida && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3">
                  <WarningCircle size={16} weight="fill" className="mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {!rate
                      ? 'No hay ninguna tasa de cambio registrada. Sincroniza el BCV en Configuracion de pagos antes de cobrar en otra moneda.'
                      : `La tasa es del ${rate.fecha}${diasTasa ? ` (hace ${diasTasa} dia${diasTasa > 1 ? 's' : ''})` : ''}. Sincroniza el BCV antes de cobrar para no perder en el cambio.`}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="qd-fecha">Fecha y hora</Label>
                  <Input
                    id="qd-fecha"
                    type="datetime-local"
                    value={form.pagado_at}
                    onChange={(e) => setField('pagado_at', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Comprobante (captura/imagen)</Label>
                <ReceiptUploader
                  value={form.receipt_url}
                  mime={form.receipt_mime}
                  onChange={(url, mime) => {
                    setForm((f) => ({ ...f, receipt_url: url, receipt_mime: mime }));
                  }}
                />
              </div>

              <div>
                <Label htmlFor="qd-notas">Notas</Label>
                <Textarea
                  id="qd-notas"
                  rows={2}
                  placeholder="Opcional"
                  value={form.notas}
                  onChange={(e) => setField('notas', e.target.value)}
                />
              </div>

              {methodStartsAsPending(form.method) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Este pago se registrara como <strong>por confirmar</strong>. Recepcion o contabilidad debera conciliarlo despues.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:items-center gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => void handleSave(true)}
            >
              <Plus size={14} weight="bold" className="mr-1.5" />
              Guardar y otro
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner size={14} weight="bold" className="mr-1.5 animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <FloppyDisk size={14} weight="bold" className="mr-1.5" /> Guardar pago
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
