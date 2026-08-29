// Sincroniza tasa BCV oficial (USD + EUR) desde ve.dolarapi.com.
// On-demand desde UI (rol admin/superadmin) o cron.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface DolarApiItem { moneda: string; fuente: string; promedio: number; fechaActualizacion: string }

async function fetchOne(kind: 'dolares' | 'euros'): Promise<number> {
  const res = await fetch(`https://ve.dolarapi.com/v1/${kind}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`dolarapi ${kind} HTTP ${res.status}`);
  const arr = await res.json() as DolarApiItem[];
  const oficial = arr.find((r) => r.fuente === 'oficial');
  const val = Number(oficial?.promedio);
  if (!Number.isFinite(val) || val <= 0) throw new Error(`dolarapi ${kind}: precio invalido`);
  return val;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const [usd, eur] = await Promise.all([fetchOne('dolares'), fetchOne('euros')]);
    const fecha = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await supabase.from('exchange_rates').upsert({
      fecha, bs_per_usd: usd, bs_per_eur: eur, source: 'bcv',
    }, { onConflict: 'fecha' });
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({
      success: true,
      data: { fecha, bs_per_usd: usd, bs_per_eur: eur, source: 'bcv' },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: msg, code: 'BCV_SYNC_ERROR' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
