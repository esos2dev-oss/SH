// Settings de pagos: tasa BCV diaria + datos del hotel para pago movil.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CurrencyDollar, DeviceMobile, FloppyDisk, DownloadSimple } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Label } from '../../../shared/components/ui/label';
import { SelectNative } from '../../../shared/components/ui/select-native';
import { ApiError } from '../../../shared/api/client';
import { supabase } from '../../../shared/lib/supabase';
import {
  getCurrentRate, upsertRate, listRates, syncBcvRate,
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
  const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
};

const writeSetting = async (key: string, value: unknown): Promise<SettingRecord> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data, error } = await supabase.from('settings').upsert({ key, value, updated_by: user.id, updated_at: new Date().toISOString() }).select('*').single();
  if (error) throw new Error(error.message);
  return data as SettingRecord;
};

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
  const [usdInput, setUsdInput] = useState('');
  const [eurInput, setEurInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
    const usd = Number(usdInput);
    const eur = eurInput ? Number(eurInput) : null;
    if (!Number.isFinite(usd) || usd <= 0) { toast.error('Tasa USD invalida'); return; }
    if (eur !== null && (!Number.isFinite(eur) || eur <= 0)) { toast.error('Tasa EUR invalida'); return; }
    setSubmitting(true);
    try {
      await upsertRate({ bs_per_usd: usd, bs_per_eur: eur, source: 'manual' });
      toast.success('Tasa actualizada');
      setUsdInput(''); setEurInput('');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    } finally { setSubmitting(false); }
  }

  async function handleSyncBcv() {
    setSyncing(true);
    try {
      const r = await syncBcvRate();
      toast.success(`Sync BCV OK · USD ${r.bs_per_usd.toFixed(2)} · EUR ${(r.bs_per_eur ?? 0).toFixed(2)}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error sync BCV');
    } finally { setSyncing(false); }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CurrencyDollar size={18} weight="duotone" className="text-primary" />
          <h2 className="font-bold">Tasa de cambio BCV (Bs/USD y Bs/EUR)</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleSyncBcv()} disabled={syncing}>
          <DownloadSimple size={14} weight="bold" className="mr-1.5" />
          {syncing ? 'Sincronizando...' : 'Sincronizar BCV automatico'}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl bg-muted/40 border border-border p-3">
          <p className="text-[10px] uppercase text-muted-foreground font-bold">USD hoy</p>
          <p className="font-mono text-2xl font-extrabold tabular-nums">{current ? current.bs_per_usd.toFixed(4) : '—'}</p>
        </div>
        <div className="rounded-xl bg-muted/40 border border-border p-3">
          <p className="text-[10px] uppercase text-muted-foreground font-bold">EUR hoy</p>
          <p className="font-mono text-2xl font-extrabold tabular-nums">{current?.bs_per_eur ? current.bs_per_eur.toFixed(4) : '—'}</p>
        </div>
        <div className="rounded-xl bg-muted/40 border border-border p-3 col-span-2">
          <p className="text-[10px] uppercase text-muted-foreground font-bold">Fuente</p>
          <p className="text-sm font-semibold">{current ? `${current.source} · ${formatDate(current.fecha)}` : 'Sin tasa registrada'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <Label htmlFor="rate-usd">Nueva tasa USD (Bs/USD)</Label>
          <Input id="rate-usd" type="number" step="0.0001" min="0" inputMode="decimal" placeholder="737.88" value={usdInput} onChange={(e) => setUsdInput(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="rate-eur">Nueva tasa EUR (Bs/EUR)</Label>
          <Input id="rate-eur" type="number" step="0.0001" min="0" inputMode="decimal" placeholder="841.84" value={eurInput} onChange={(e) => setEurInput(e.target.value)} />
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={submitting || !usdInput}>
          <FloppyDisk size={14} weight="bold" className="mr-1.5" />
          {submitting ? 'Guardando...' : 'Guardar tasa manual'}
        </Button>
      </div>

      {history.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Historial (ultimos 12 dias)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {history.slice(0, 12).map((r) => (
              <div key={r.fecha} className="rounded-lg border border-border bg-background p-2 text-center">
                <p className="text-[10px] text-muted-foreground">{formatDate(r.fecha)}</p>
                <p className="font-bold tabular-nums text-sm">USD {r.bs_per_usd.toFixed(2)}</p>
                {r.bs_per_eur && <p className="text-[11px] tabular-nums">EUR {r.bs_per_eur.toFixed(2)}</p>}
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
