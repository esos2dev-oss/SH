// Edge Function: billing-checkout
// POST /functions/v1/billing-checkout
// Body: { plan: 'esencial'|'profesional'|'grupo', ciclo?: 'mensual'|'anual' }
//
// Crea una sesion de Stripe Checkout para el hotel del usuario y devuelve su URL.
//
// Lo que esta funcion NO hace, a proposito: activar la suscripcion. Eso es
// competencia exclusiva del webhook. Aqui el usuario todavia no ha pagado — y
// puede cerrar la pestaña y no volver.

import { requireUser, adminClient } from '../_shared/supabase.ts';
import { PLANES, PROMO, esPlanValido, importeConPromo, stripeApi, corsFor, json, fail, type Ciclo } from '../_shared/billing.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsFor(req) });
  if (req.method !== 'POST') return fail('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405, req);

  try {
    const { client, user } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as { plan?: unknown; ciclo?: unknown };

    if (!esPlanValido(body.plan)) {
      return fail('Plan no valido', 'VALIDATION_ERROR', 400, req);
    }
    const ciclo: Ciclo = body.ciclo === 'anual' ? 'anual' : 'mensual';
    const plan = PLANES[body.plan];

    // El hotel se resuelve en SERVIDOR a partir del usuario, nunca se acepta un
    // hotel_id del body: si no, cualquiera pagaria (o cambiaria el plan) de un
    // hotel ajeno. La consulta va con el JWT del usuario, sujeta a RLS.
    const { data: sub, error: subErr } = await client
      .rpc('my_hotel_subscription')
      .select('hotel_id, nombre, is_owner')
      .maybeSingle();

    if (subErr) return fail(subErr.message, 'INTERNAL_ERROR', 500, req);
    if (!sub) return fail('No perteneces a ningun hotel', 'NO_HOTEL', 403, req);
    if (!sub.is_owner) {
      return fail('Solo el propietario del hotel puede contratar', 'FORBIDDEN', 403, req);
    }

    const admin = adminClient();
    const { data: hotel } = await admin
      .from('hotels')
      .select('id, nombre, stripe_customer_id')
      .eq('id', sub.hotel_id)
      .single();
    if (!hotel) return fail('Hotel no encontrado', 'NOT_FOUND', 404, req);

    // Cliente de Stripe: se reutiliza si ya existe, para no duplicar clientes
    // ni perder el historial de facturas del hotel.
    let customerId = hotel.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripeApi<{ id: string }>(
        'customers',
        {
          email: user.email ?? '',
          name: hotel.nombre,
          'metadata[hotel_id]': String(hotel.id),
        },
        `customer-hotel-${hotel.id}`,
      );
      customerId = customer.id;
      await admin.from('hotels').update({ stripe_customer_id: customerId }).eq('id', hotel.id);
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173/sh';
    const importeLista = ciclo === 'anual' ? plan.anual : plan.mensual;

    // El descuento se cobra como precio reducido durante los primeros meses, no
    // rebajando el precio de lista: cuando la promocion acabe, la suscripcion
    // pasa al precio normal sin tener que migrar a nadie de plan.
    const importe = PROMO.activa ? importeConPromo(importeLista) : importeLista;

    const session = await stripeApi<{ id: string; url: string }>('checkout/sessions', {
      mode: 'subscription',
      customer: customerId!,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(importe),
      'line_items[0][price_data][recurring][interval]': ciclo === 'anual' ? 'year' : 'month',
      'line_items[0][price_data][product_data][name]': `Plan ${plan.nombre}`,
      'line_items[0][price_data][product_data][description]':
        PROMO.activa
          ? `Hasta ${plan.maxHabitaciones} habitaciones · usuarios ilimitados · precio de lanzamiento ${PROMO.meses} meses`
          : `Hasta ${plan.maxHabitaciones} habitaciones · usuarios ilimitados`,

      // El calendario de la prueba lo lleva Stripe, no nosotros: si lo
      // calculamos aparte acabamos cobrando en una fecha distinta a la que la
      // aplicacion cree, y esa discrepancia es imposible de explicar al cliente.
      'subscription_data[trial_period_days]': '30',
      'subscription_data[metadata][hotel_id]': String(hotel.id),
      'subscription_data[metadata][plan]': body.plan,
      'subscription_data[metadata][precio_lista]': String(importeLista),
      'subscription_data[metadata][promo]': PROMO.activa ? `${PROMO.descuento * 100}%_${PROMO.meses}m` : 'no',

      // Se repiten en la sesion para que el webhook pueda identificar el hotel
      // aunque el evento que llegue sea el de la sesion y no el de la suscripcion.
      'metadata[hotel_id]': String(hotel.id),
      'metadata[plan]': body.plan,

      success_url: `${appUrl}/suscripcion?pago=ok`,
      cancel_url: `${appUrl}/suscripcion?pago=cancelado`,
      locale: 'es',
    });

    return json({ success: true, url: session.url }, 200, req);
  } catch (err) {
    if (err instanceof Response) return err;
    return fail(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500, req);
  }
});
