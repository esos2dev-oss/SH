// Edge Function: bcv-sync
// POST /functions/v1/bcv-sync
// Body: {}  (sin parametros)
//
// Sincroniza la tasa oficial del BCV (Bs/USD y, si esta disponible, Bs/EUR)
// y la guarda en public.exchange_rates para la fecha de hoy.
//
// Contexto (bug 15): no existia NINGUN mecanismo de sincronizacion. La tasa
// solo cambiaba si alguien la tecleaba a mano en Configuracion de pagos, asi
// que los cobros en Bs se hacian con tasas de varios dias — dinero perdido en
// cada Pago Movil con la inflacion venezolana.
//
// Auth: usuario autenticado con rol superadmin/admin/contabilidad/recepcion,
// o llamada automatica con la cabecera X-Cron-Secret == CRON_SECRET.

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { userClient, adminClient } from '../_shared/supabase.ts';

interface RateResult {
  bs_per_usd: number;
  bs_per_eur: number | null;
  source_name: string;
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'sistema-hotelero/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** pydolarve expone BCV con USD y EUR en la misma respuesta. */
async function fromPyDolarVe(): Promise<RateResult | null> {
  try {
    const raw = await fetchJson('https://pydolarve.org/api/v1/dollar?page=bcv') as {
      monitors?: Record<string, { price?: unknown }>;
    };
    const usd = asPositiveNumber(raw?.monitors?.usd?.price);
    if (!usd) return null;
    const eur = asPositiveNumber(raw?.monitors?.eur?.price);
    return { bs_per_usd: usd, bs_per_eur: eur, source_name: 'pydolarve/bcv' };
  } catch {
    return null;
  }
}

/** dolarapi solo da USD oficial, sirve de respaldo. */
async function fromDolarApi(): Promise<RateResult | null> {
  try {
    const raw = await fetchJson('https://ve.dolarapi.com/v1/dolares/oficial') as {
      promedio?: unknown; venta?: unknown; compra?: unknown;
    };
    const usd = asPositiveNumber(raw?.promedio) ?? asPositiveNumber(raw?.venta) ?? asPositiveNumber(raw?.compra);
    if (!usd) return null;
    return { bs_per_usd: usd, bs_per_eur: null, source_name: 'dolarapi/oficial' };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405);

  try {
    // --- Autorizacion: usuario con rol, o cron con secreto -------------------
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = !!cronSecret && req.headers.get('X-Cron-Secret') === cronSecret;

    let setBy: string | null = null;

    if (!isCron) {
      const client = userClient(req);
      const { data: { user }, error: uErr } = await client.auth.getUser();
      if (uErr || !user) return errorResponse('No autenticado', 'UNAUTHORIZED', 401);

      const { data: profile } = await client
        .from('profiles').select('role').eq('id', user.id).single();
      const role = (profile as { role?: string } | null)?.role;
      if (!role || !['superadmin', 'admin', 'contabilidad', 'recepcion'].includes(role)) {
        return errorResponse('No tienes permiso para sincronizar la tasa', 'FORBIDDEN', 403);
      }
      setBy = user.id;
    }

    // --- Obtener tasa -------------------------------------------------------
    const rate = (await fromPyDolarVe()) ?? (await fromDolarApi());
    if (!rate) {
      return errorResponse(
        'No se pudo obtener la tasa del BCV en este momento. Registrala manualmente o reintenta en unos minutos.',
        'UPSTREAM_UNAVAILABLE',
        503,
      );
    }

    // bs_per_eur -> eur_per_usd (euros por 1 USD), que es lo que guarda el schema.
    const eurPerUsd = rate.bs_per_eur && rate.bs_per_eur > 0
      ? Number((rate.bs_per_usd / rate.bs_per_eur).toFixed(6))
      : null;

    // --- Guardar ------------------------------------------------------------
    const admin = adminClient();
    const fecha = new Date().toISOString().slice(0, 10);

    // Si esta ejecucion no trajo EUR, conservamos el ultimo conocido para no
    // dejar la fecha de hoy sin tasa EUR (romperia los cobros en euros).
    let eurFinal = eurPerUsd;
    if (eurFinal === null) {
      const { data: prev } = await admin
        .from('exchange_rates')
        .select('eur_per_usd')
        .not('eur_per_usd', 'is', null)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle();
      eurFinal = (prev as { eur_per_usd: number } | null)?.eur_per_usd ?? null;
    }

    const { data: saved, error: sErr } = await admin
      .from('exchange_rates')
      .upsert({
        fecha,
        bs_per_usd: rate.bs_per_usd,
        eur_per_usd: eurFinal,
        source: 'bcv',
        set_by: setBy,
      }, { onConflict: 'fecha' })
      .select('*')
      .single();

    if (sErr) return errorResponse(sErr.message, 'INTERNAL_ERROR', 500);

    return jsonResponse({
      success: true,
      data: { ...saved, provider: rate.source_name },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500);
  }
});
