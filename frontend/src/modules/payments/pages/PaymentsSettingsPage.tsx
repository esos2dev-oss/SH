// Settings de pagos: tasa BCV diaria + datos del hotel para pago movil.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CurrencyDollar, DeviceMobile, FloppyDisk } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Label } from '../../../shared/components/ui/label';
import { SelectNative } from '../../../shared/components/ui/select-native';
import { ApiError, api } from '../../../shared/api/client';
import {
  getCurrentRate, upsertRate, listRates,
  type ExchangeRate,
} from '../api/payments.api';
import { VENEZUELAN_BANKS } from '../lib/labels';
import { formatDate } from '../../../shared/lib/format';

const SETTING_KEYS = {
  banco: 'pago_movil.banco',
  cedula: 'pago_movil.cedula',
  telefono: 'pago_movil.telefono',
  titular: 'pago_movil.titular',
} as const;

interface SettingRecord {
  key: string;
  value: unknown;
  updated_at: string;
}

const fetchSetting = async (key: string): Promise<unknown> => {
  try {
    const r = await api.get<SettingRecord>(`/api/settings/${key}`);
    return r.value;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
};

const writeSetting = (key: string, value: unknown) => api.put<SettingRecord>(`/api/settings/${key}`, { value });

export default function PaymentsSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configuracion de pagos" subtitle="Tasa BCV diaria y datos del hotel para que los huespedes paguen via Pago Movil." />

      <ExchangeRateCard />
      <HotelPaymentDataCard />
    </div>
  );
}

// =============================================================================

function ExchangeRateCard() {
  const [current, setCurrent] = useState<ExchangeRate | null>(null);
  const [history, setHistory] = useState<ExchangeRate[]>([]);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([getCurrentRate(), listRates()]);
      setCurrent(c);
      setHistory(h);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    const v = Number(input);
    if (!Number.isFinite(v) || v <= 0) {
      toast.error('Tasa invalida');
      return;
    }
    setSubmitting(true);
    try {
      await upsertRate({ bs_per_usd: v, source: 'manual' });
      toast.success('Tasa actualizada');
      setInput('');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <CurrencyDollar size={18} weight="duotone" className="text-primary" />
        <h2 className="font-bold">Tasa de cambio Bs/USD (BCV)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <Label>Tasa actual</Label>
          <div className="h-10 flex items-center font-mono text-2xl font-extrabold tabular-nums">
            {current ? current.bs_per_usd.toFixed(4) : <span className="text-sm text-muted-foreground">Sin tasa registrada</span>}
          </div>
          {current && <p className="text-[11px] text-muted-foreground">Fuente: {current.source} · {formatDate(current.fecha)}</p>}
        </div>
        <div>
          <Label htmlFor="rate-input">Nueva tasa (Bs por USD)</Label>
          <Input
            id="rate-input"
            type="number"
            step="0.0001"
            min="0"
            inputMode="decimal"
            placeholder="36.5000"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={submitting || !input}>
          <FloppyDisk size={14} weight="bold" className="mr-1.5" />
          {submitting ? 'Guardando...' : 'Guardar tasa de hoy'}
        </Button>
      </div>

      {history.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Historial</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {history.slice(0, 12).map((r) => (
              <div key={r.fecha} className="rounded-lg border border-border bg-background p-2 text-center">
                <p className="text-[10px] text-muted-foreground">{formatDate(r.fecha)}</p>
                <p className="font-bold tabular-nums text-sm">{r.bs_per_usd.toFixed(4)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================

function HotelPaymentDataCard() {
  const [banco, setBanco] = useState('');
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [titular, setTitular] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [b, c, t, n] = await Promise.all([
          fetchSetting(SETTING_KEYS.banco),
          fetchSetting(SETTING_KEYS.cedula),
          fetchSetting(SETTING_KEYS.telefono),
          fetchSetting(SETTING_KEYS.titular),
        ]);
        if (typeof b === 'string') setBanco(b);
        if (typeof c === 'string') setCedula(c);
        if (typeof t === 'string') setTelefono(t);
        if (typeof n === 'string') setTitular(n);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Error');
      } finally { setLoading(false); }
    })();
  }, []);

  async function handleSave() {
    setSubmitting(true);
    try {
      await Promise.all([
        writeSetting(SETTING_KEYS.banco, banco),
        writeSetting(SETTING_KEYS.cedula, cedula),
        writeSetting(SETTING_KEYS.telefono, telefono),
        writeSetting(SETTING_KEYS.titular, titular),
      ]);
      toast.success('Datos guardados');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <DeviceMobile size={18} weight="duotone" className="text-primary" />
        <h2 className="font-bold">Datos del hotel para Pago Movil</h2>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Banco receptor</Label>
            <SelectNative value={banco} onChange={(e) => setBanco(e.target.value)}>
              <option value="">Seleccione banco…</option>
              {VENEZUELAN_BANKS.map((b) => (
                <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
              ))}
            </SelectNative>
          </div>
          <div>
            <Label htmlFor="hpd-titular">Titular (razon social)</Label>
            <Input id="hpd-titular" value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Hotel Buggin C.A." />
          </div>
          <div>
            <Label htmlFor="hpd-cedula">Cedula juridica / RIF</Label>
            <Input id="hpd-cedula" value={cedula} onChange={(e) => setCedula(e.target.value.toUpperCase())} placeholder="J-12345678-9" />
          </div>
          <div>
            <Label htmlFor="hpd-tel">Telefono asociado</Label>
            <Input id="hpd-tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="04141234567" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="button" onClick={() => void handleSave()} disabled={submitting}>
              <FloppyDisk size={14} weight="bold" className="mr-1.5" />
              {submitting ? 'Guardando...' : 'Guardar datos'}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Estos datos se usan en las plantillas de WhatsApp y los mensajes de confirmacion de reserva para que el huesped sepa a donde transferir.
      </p>
    </div>
  );
}
