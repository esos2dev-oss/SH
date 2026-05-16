// Campos especificos por metodo. Cada uno construye su method_details + referencia.

import type { PaymentMethod } from '../api/payments.api';
import { Input } from '../../../shared/components/ui/input';
import { Label } from '../../../shared/components/ui/label';
import { SelectNative } from '../../../shared/components/ui/select-native';
import { VENEZUELAN_BANKS } from '../lib/labels';

export interface MethodFieldsValue {
  method_details: Record<string, unknown>;
  referencia?: string;
}

interface Props {
  method: PaymentMethod;
  value: MethodFieldsValue;
  onChange: (v: MethodFieldsValue) => void;
}

function setDetails(value: MethodFieldsValue, patch: Record<string, unknown>): MethodFieldsValue {
  return { ...value, method_details: { ...value.method_details, ...patch } };
}

export function MethodFields({ method, value, onChange }: Props) {
  const d = value.method_details ?? {};

  if (method === 'pago_movil') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="pm-banco">Banco emisor *</Label>
          <SelectNative
            id="pm-banco"
            value={(d['banco_emisor'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'pago_movil', banco_emisor: e.target.value }))}
          >
            <option value="">Seleccione banco…</option>
            {VENEZUELAN_BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} — {b.name}
              </option>
            ))}
          </SelectNative>
        </div>
        <div>
          <Label htmlFor="pm-doc">Cedula titular *</Label>
          <Input
            id="pm-doc"
            placeholder="V12345678"
            value={(d['titular_doc'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'pago_movil', titular_doc: e.target.value.toUpperCase() }))}
          />
        </div>
        <div>
          <Label htmlFor="pm-tel">Telefono titular *</Label>
          <Input
            id="pm-tel"
            placeholder="04141234567"
            value={(d['titular_telefono'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'pago_movil', titular_telefono: e.target.value }))}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="pm-ref">Referencia (6+ digitos) *</Label>
          <Input
            id="pm-ref"
            placeholder="123456"
            value={value.referencia ?? ''}
            onChange={(e) => onChange({ ...value, referencia: e.target.value.replace(/\s/g, '') })}
          />
        </div>
      </div>
    );
  }

  if (method === 'transferencia') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tr-origen">Banco origen</Label>
          <Input
            id="tr-origen"
            placeholder="Banesco"
            value={(d['banco_origen'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'transferencia', banco_origen: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="tr-destino">Banco destino</Label>
          <Input
            id="tr-destino"
            placeholder="Mercantil"
            value={(d['banco_destino'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'transferencia', banco_destino: e.target.value }))}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="tr-ref">Referencia *</Label>
          <Input
            id="tr-ref"
            placeholder="Numero de operacion"
            value={value.referencia ?? ''}
            onChange={(e) => onChange({ ...value, referencia: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (method === 'zelle') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="zl-email">Email titular *</Label>
          <Input
            id="zl-email"
            type="email"
            placeholder="cliente@ejemplo.com"
            value={(d['email_titular'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'zelle', email_titular: e.target.value }))}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="zl-nombre">Nombre titular</Label>
          <Input
            id="zl-nombre"
            placeholder="John Doe"
            value={(d['titular_nombre'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'zelle', titular_nombre: e.target.value }))}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="zl-ref">Confirmacion / referencia</Label>
          <Input
            id="zl-ref"
            value={value.referencia ?? ''}
            onChange={(e) => onChange({ ...value, referencia: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (method === 'tarjeta') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tc-u4">Ultimos 4 *</Label>
          <Input
            id="tc-u4"
            placeholder="1234"
            maxLength={4}
            inputMode="numeric"
            value={(d['ultimos_4'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'tarjeta', ultimos_4: e.target.value.replace(/\D/g, '') }))}
          />
        </div>
        <div>
          <Label htmlFor="tc-marca">Marca</Label>
          <Input
            id="tc-marca"
            placeholder="VISA / Mastercard"
            value={(d['marca'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'tarjeta', marca: e.target.value }))}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="tc-ref">Numero de autorizacion</Label>
          <Input
            id="tc-ref"
            value={value.referencia ?? ''}
            onChange={(e) => onChange({ ...value, referencia: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (method === 'punto_venta') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pv-u4">Ultimos 4</Label>
          <Input
            id="pv-u4"
            placeholder="1234"
            maxLength={4}
            inputMode="numeric"
            value={(d['ultimos_4'] as string | undefined) ?? ''}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '');
              onChange(setDetails(value, { kind: 'punto_venta', ultimos_4: v || undefined }));
            }}
          />
        </div>
        <div>
          <Label htmlFor="pv-banco">Banco del POS</Label>
          <Input
            id="pv-banco"
            placeholder="Banesco"
            value={(d['banco_pos'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'punto_venta', banco_pos: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="pv-lote">Lote</Label>
          <Input
            id="pv-lote"
            value={(d['lote'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'punto_venta', lote: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="pv-voucher">Voucher</Label>
          <Input
            id="pv-voucher"
            value={(d['voucher'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'punto_venta', voucher: e.target.value }))}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="pv-ref">Referencia</Label>
          <Input
            id="pv-ref"
            value={value.referencia ?? ''}
            onChange={(e) => onChange({ ...value, referencia: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (method === 'efectivo' || method === 'efectivo_usd' || method === 'efectivo_bs') {
    return (
      <div>
        <Label htmlFor="ef-nota">Nota opcional</Label>
        <Input
          id="ef-nota"
          placeholder="Denominaciones, contado por…"
          value={(d['notes'] as string | undefined) ?? ''}
          onChange={(e) => onChange(setDetails(value, { kind: method, notes: e.target.value || undefined }))}
        />
      </div>
    );
  }

  if (method === 'paypal') {
    return (
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label htmlFor="pp-tx">Transaction ID</Label>
          <Input
            id="pp-tx"
            value={(d['transaction_id'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'paypal', transaction_id: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="pp-email">Email titular</Label>
          <Input
            id="pp-email"
            type="email"
            value={(d['email_titular'] as string | undefined) ?? ''}
            onChange={(e) => onChange(setDetails(value, { kind: 'paypal', email_titular: e.target.value }))}
          />
        </div>
      </div>
    );
  }

  // otro
  return (
    <div>
      <Label htmlFor="ot-desc">Descripcion del metodo *</Label>
      <Input
        id="ot-desc"
        placeholder="Ej: criptomoneda, vale postdatado, etc."
        value={(d['descripcion'] as string | undefined) ?? ''}
        onChange={(e) => onChange(setDetails(value, { kind: 'otro', descripcion: e.target.value }))}
      />
    </div>
  );
}
