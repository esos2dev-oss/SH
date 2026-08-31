// Catalogo de planes y helpers de Stripe, en SERVIDOR.
//
// El precio vive aqui y no en el navegador a proposito: si el importe viajara
// en el body, cualquiera podria pagar 1 USD por el plan Grupo editando la
// peticion. El cliente manda un codigo de plan; el precio lo pone el servidor.

export type PlanCode = 'esencial' | 'profesional' | 'grupo';
export type Ciclo = 'mensual' | 'anual';

interface PlanDef {
  nombre: string;
  maxHabitaciones: number;
  /** Importe en centavos de USD, que es como Stripe cuenta el dinero. */
  mensual: number;
  anual: number;
}

export const PLANES: Record<PlanCode, PlanDef> = {
  esencial:    { nombre: 'Esencial',    maxHabitaciones: 12, mensual: 1900, anual: 19000 },
  profesional: { nombre: 'Profesional', maxHabitaciones: 30, mensual: 3900, anual: 39000 },
  grupo:       { nombre: 'Grupo',       maxHabitaciones: 80, mensual: 7900, anual: 79000 },
};

export function esPlanValido(v: unknown): v is PlanCode {
  return typeof v === 'string' && v in PLANES;
}

/**
 * Promocion de lanzamiento.
 *
 * TIENE QUE COINCIDIR con frontend/src/modules/billing/planes.ts. Si la landing
 * anuncia 19 y el checkout cobra 39, el cliente lo descubre con la tarjeta en la
 * mano — y esa es la peor forma posible de empezar una relacion comercial.
 *
 * Se aplica en servidor y no se acepta ningun importe del cliente: el navegador
 * manda un codigo de plan, nunca un precio.
 */
export const PROMO = {
  activa: true,
  descuento: 0.5,
  meses: 6,
} as const;

/** Importe a cobrar, en centavos, con la promocion ya aplicada. */
export function importeConPromo(centavos: number): number {
  if (!PROMO.activa) return centavos;
  // Se redondea a dolar entero para que la factura no salga con centimos raros.
  return Math.round((centavos * (1 - PROMO.descuento)) / 100) * 100;
}

export function stripeKey(): string {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('Falta STRIPE_SECRET_KEY en el entorno de la funcion');
  return key;
}

/**
 * Llama a la API de Stripe con form-encoding, que es lo que espera.
 *
 * Se usa fetch directo en lugar del SDK: son cuatro llamadas contadas y evita
 * arrastrar una dependencia grande al arranque en frio de la edge function.
 */
export async function stripeApi<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  // Evita duplicar suscripciones si el usuario pulsa dos veces o hay reintento.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(params).toString(),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Stripe respondio ${res.status}`);
  }
  return json as T;
}

/**
 * Origen permitido para CORS.
 *
 * Estas funciones mueven dinero: no llevan el `*` del resto. Se limita a los
 * origenes declarados en APP_ORIGINS (lista separada por comas).
 */
export function corsFor(req: Request): Record<string, string> {
  const permitidos = (Deno.env.get('APP_ORIGINS') ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = req.headers.get('Origin') ?? '';
  const allow = permitidos.includes(origin) ? origin : permitidos[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), 'Content-Type': 'application/json' },
  });
}

export function fail(message: string, code: string, status: number, req: Request): Response {
  return json({ success: false, error: message, code }, status, req);
}
