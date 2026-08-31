// Suscripcion del hotel: estado, prueba y planes.

import { supabase, invokeFunction } from '../../../shared/lib/supabase';
import { ApiError } from '../../../shared/api/client';

// El catalogo vive en ../planes.ts, sin dependencias, para que la landing
// publica pueda importarlo sin arrastrar el cliente de Supabase.
export {
  PLANS, PROMO, DESCUENTO_HOTEL_ADICIONAL, precioConPromo, planByCode,
  type Plan, type PlanCode,
} from '../planes';
import type { PlanCode } from '../planes';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
/** Lo decide la base de datos, no el frontend. Ver hotel_access_level(). */
export type AccessLevel = 'full' | 'read_only' | 'blocked';

export interface HotelSubscription {
  hotel_id: number;
  nombre: string;
  plan: PlanCode;
  status: SubscriptionStatus;
  access_level: AccessLevel;
  trial_ends_at: string | null;
  days_left: number;
  grace_until: string | null;
  data_retention_until: string | null;
  is_owner: boolean;
}



/** Estado de suscripcion del hotel activo. */
export async function getSubscription(hotelId?: number): Promise<HotelSubscription | null> {
  const { data, error } = await supabase.rpc('my_hotel_subscription', {
    p_hotel_id: hotelId ?? undefined,
  });
  if (error) throw new ApiError(400, error.message, 'SUBSCRIPTION_READ_ERROR');
  const row = Array.isArray(data) ? data[0] : data;
  return (row as HotelSubscription | undefined) ?? null;
}

/**
 * Abre el pago del plan elegido.
 *
 * Llama a una edge function que crea la sesion de Stripe Checkout en servidor.
 * El precio y el plan se resuelven ALLI a partir del codigo: si se enviara el
 * importe desde el navegador, cualquiera podria pagar 1 USD por el plan Grupo.
 *
 * Y quien activa la suscripcion es el webhook de Stripe, nunca esta llamada:
 * el usuario puede cerrar la pestaña y no volver.
 */
export async function startCheckout(plan: PlanCode, ciclo: 'mensual' | 'anual' = 'mensual'): Promise<{ url: string }> {
  const data = await invokeFunction<{ url: string }>('billing-checkout', { plan, ciclo });
  if (!data?.url) throw new ApiError(500, 'No se pudo iniciar el pago', 'CHECKOUT_NO_URL');
  return data;
}

/** Portal de Stripe para cambiar tarjeta, ver facturas o darse de baja. */
export async function openBillingPortal(): Promise<{ url: string }> {
  const data = await invokeFunction<{ url: string }>('billing-portal', {});
  if (!data?.url) throw new ApiError(500, 'No se pudo abrir el portal de facturacion', 'PORTAL_NO_URL');
  return data;
}
