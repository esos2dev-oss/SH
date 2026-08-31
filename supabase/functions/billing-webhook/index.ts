// Edge Function: billing-webhook
// POST /functions/v1/billing-webhook
//
// UNICA fuente de verdad del estado de la suscripcion. Ni el frontend ni
// billing-checkout activan nada: solo lo que Stripe confirma aqui.
//
// DESPLIEGUE: esta funcion debe publicarse SIN verificacion de JWT
//   supabase functions deploy billing-webhook --no-verify-jwt
// porque quien llama es Stripe, no un usuario. Su autenticacion es la firma
// del evento, que se comprueba abajo.

import { adminClient } from '../_shared/supabase.ts';
import { esPlanValido } from '../_shared/billing.ts';

/**
 * Verifica la firma del webhook de Stripe.
 *
 * Sin esto, cualquiera que conozca la URL puede enviar un evento falso y
 * regalarse una suscripcion. Se implementa a mano (HMAC-SHA256 sobre
 * "timestamp.payload") para no cargar el SDK entero.
 */
async function firmaValida(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;

  const partes = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, ...v] = p.split('=');
      return [k?.trim() ?? '', v.join('=')];
    }),
  );
  const timestamp = partes['t'];
  const firma = partes['v1'];
  if (!timestamp || !firma) return false;

  // Rechaza eventos viejos: sin esto, una firma capturada se puede reenviar
  // indefinidamente (ataque de repeticion).
  const edadSegundos = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(edadSegundos) || edadSegundos > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const esperado = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Comparacion en tiempo constante: un == normal filtra informacion por el
  // tiempo que tarda en fallar.
  if (esperado.length !== firma.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) {
    diff |= esperado.charCodeAt(i) ^ firma.charCodeAt(i);
  }
  return diff === 0;
}

/** Mapeo directo de los estados de Stripe a los nuestros. */
function mapEstado(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'canceled':
    case 'incomplete_expired': return 'canceled';
    default: return 'canceled';
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Metodo no permitido', { status: 405 });
  }

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    console.error('Falta STRIPE_WEBHOOK_SECRET');
    return new Response('Mal configurado', { status: 500 });
  }

  // El cuerpo debe leerse en crudo: cualquier reserializacion cambia los bytes
  // y la firma deja de cuadrar.
  const payload = await req.text();

  if (!(await firmaValida(payload, req.headers.get('stripe-signature'), secret))) {
    return new Response('Firma no valida', { status: 400 });
  }

  const evento = JSON.parse(payload) as {
    id: string;
    type: string;
    data: { object: Record<string, any> };
  };

  const admin = adminClient();

  // Idempotencia: Stripe reintenta ante cualquier duda. Sin esto, un reintento
  // vuelve a aplicar el cambio y puede reactivar una suscripcion ya cancelada.
  const { error: dupErr } = await admin
    .from('billing_events')
    .insert({ id: evento.id, type: evento.type });
  if (dupErr) {
    // Clave duplicada = ya procesado. Se responde 200 para que Stripe pare.
    if (dupErr.code === '23505') return new Response('Ya procesado', { status: 200 });
    console.error('No se pudo registrar el evento', dupErr);
    return new Response('Error', { status: 500 });
  }

  try {
    const obj = evento.data.object;

    switch (evento.type) {
      case 'checkout.session.completed': {
        const hotelId = Number(obj.metadata?.hotel_id);
        if (!hotelId) break;
        const plan = obj.metadata?.plan;
        await admin
          .from('hotels')
          .update({
            stripe_subscription_id: obj.subscription ?? null,
            stripe_customer_id: obj.customer ?? null,
            ...(esPlanValido(plan) ? { plan } : {}),
          })
          .eq('id', hotelId);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const hotelId = Number(obj.metadata?.hotel_id);
        if (!hotelId) break;
        const estado = mapEstado(obj.status);
        const finPeriodo = obj.current_period_end
          ? new Date(obj.current_period_end * 1000).toISOString()
          : null;

        await admin
          .from('hotels')
          .update({
            subscription_status: estado,
            current_period_end: finPeriodo,
            stripe_subscription_id: obj.id,
            // Al volver a estar al corriente se limpian las fechas de corte.
            ...(estado === 'active' || estado === 'trialing'
              ? { grace_until: null, data_retention_until: null }
              : {}),
          })
          .eq('id', hotelId);
        break;
      }

      case 'customer.subscription.deleted': {
        const hotelId = Number(obj.metadata?.hotel_id);
        if (!hotelId) break;
        const ahora = Date.now();
        // Baja: 30 dias de solo lectura y 90 mas de conservacion. Nunca se
        // borra nada aqui; solo se marcan las fechas.
        await admin
          .from('hotels')
          .update({
            subscription_status: 'canceled',
            grace_until: new Date(ahora + 30 * 864e5).toISOString(),
            data_retention_until: new Date(ahora + 120 * 864e5).toISOString(),
          })
          .eq('id', hotelId);
        break;
      }

      case 'invoice.payment_failed': {
        // No se corta el servicio: Stripe reintentara. Cortar por un recibo
        // devuelto deja tirado a un hotel en plena operacion.
        const subId = obj.subscription;
        if (!subId) break;
        await admin
          .from('hotels')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_subscription_id', subId);
        break;
      }

      default:
        // Evento que no nos interesa. Queda registrado y se confirma.
        break;
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    // Si algo falla, se borra el registro para que el reintento de Stripe pueda
    // volver a intentarlo; si no, el evento quedaria marcado como procesado sin
    // haberse aplicado.
    await admin.from('billing_events').delete().eq('id', evento.id);
    console.error('Error procesando', evento.type, err);
    return new Response('Error', { status: 500 });
  }
});
