// Edge Function: billing-portal
// POST /functions/v1/billing-portal
//
// Devuelve la URL del portal de facturacion de Stripe, donde el propietario
// cambia su tarjeta, descarga facturas o se da de baja.
//
// Se delega en Stripe a proposito: construir esas pantallas es trabajo que no
// diferencia al producto, y el portal ya cumple con la normativa de cada pais.

import { requireUser, adminClient } from '../_shared/supabase.ts';
import { stripeApi, corsFor, json, fail } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsFor(req) });
  if (req.method !== 'POST') return fail('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405, req);

  try {
    const { client } = await requireUser(req);

    const { data: sub, error } = await client
      .rpc('my_hotel_subscription')
      .select('hotel_id, is_owner')
      .maybeSingle();

    if (error) return fail(error.message, 'INTERNAL_ERROR', 500, req);
    if (!sub) return fail('No perteneces a ningun hotel', 'NO_HOTEL', 403, req);
    if (!sub.is_owner) {
      return fail('Solo el propietario puede gestionar la facturacion', 'FORBIDDEN', 403, req);
    }

    const admin = adminClient();
    const { data: hotel } = await admin
      .from('hotels')
      .select('stripe_customer_id')
      .eq('id', sub.hotel_id)
      .single();

    if (!hotel?.stripe_customer_id) {
      return fail('Este hotel todavia no tiene facturacion activa', 'NO_CUSTOMER', 409, req);
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173/sh';
    const session = await stripeApi<{ url: string }>('billing_portal/sessions', {
      customer: hotel.stripe_customer_id,
      return_url: `${appUrl}/suscripcion`,
      locale: 'es',
    });

    return json({ success: true, url: session.url }, 200, req);
  } catch (err) {
    if (err instanceof Response) return err;
    return fail(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500, req);
  }
});
