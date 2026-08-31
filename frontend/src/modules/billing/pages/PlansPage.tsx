// Planes y suscripcion del hotel.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, CreditCard, Sparkle, Warning, Receipt } from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { Button } from '../../../shared/components/ui/button';
import { ApiError } from '../../../shared/api/client';
import { formatDate } from '../../../shared/lib/format';
import { APP_NAME } from '../../../shared/lib/brand';
import {
  PLANS, PROMO, precioConPromo, getSubscription, startCheckout, openBillingPortal,
  planByCode, type HotelSubscription, type PlanCode,
} from '../api/billing.api';

type Ciclo = 'mensual' | 'anual';

export default function PlansPage() {
  const [sub, setSub] = useState<HotelSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [ciclo, setCiclo] = useState<Ciclo>('mensual');
  const [pagando, setPagando] = useState<PlanCode | null>(null);

  const load = useCallback(async () => {
    try {
      setSub(await getSubscription());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cargar la suscripcion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSuscribir(plan: PlanCode) {
    setPagando(plan);
    try {
      const { url } = await startCheckout(plan, ciclo);
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo iniciar el pago');
      setPagando(null);
    }
  }

  async function handlePortal() {
    try {
      const { url } = await openBillingPortal();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo abrir la facturacion');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suscripcion"
        subtitle={`Elige el plan que necesita tu hotel. Sin permanencia: puedes cambiarlo o cancelarlo cuando quieras.`}
        actions={
          sub?.is_owner && sub.status !== 'trialing' ? (
            <Button variant="outline" onClick={handlePortal}>
              <Receipt size={16} weight="duotone" className="mr-1.5" />
              Facturas y metodo de pago
            </Button>
          ) : null
        }
      />

      {!loading && sub && <EstadoActual sub={sub} />}

      {/* Selector de ciclo */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setCiclo('mensual')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
              ciclo === 'mensual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setCiclo('anual')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
              ciclo === 'anual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Anual
            <span className="ml-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">2 meses gratis</span>
          </button>
        </div>
      </div>

      {/* Planes */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const actual = sub?.plan === plan.code && (sub.status === 'active' || sub.status === 'past_due');
          const precio = ciclo === 'anual' ? plan.precioAnio : plan.precioMes;
          return (
            <div
              key={plan.code}
              className={`relative flex flex-col rounded-2xl border p-5 ${
                plan.destacado ? 'border-primary shadow-lg shadow-primary/10' : 'border-border'
              } bg-card`}
            >
              {plan.destacado && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                  Recomendado
                </span>
              )}

              <h3 className="font-bold text-lg">{plan.nombre}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hasta {plan.maxHabitaciones} habitaciones
              </p>

              {PROMO.activa && precioConPromo(precio) < precio && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-base font-bold tabular-nums text-muted-foreground line-through">
                    {precio} USD
                  </span>
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    -{PROMO.descuento * 100}% lanzamiento
                  </span>
                </div>
              )}
              <div className={PROMO.activa ? 'flex items-baseline gap-1' : 'mt-4 flex items-baseline gap-1'}>
                <span className="text-3xl font-extrabold tabular-nums">
                  {precioConPromo(precio)}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  USD/{ciclo === 'anual' ? 'anio' : 'mes'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {PROMO.activa && precioConPromo(precio) < precio
                  ? `Durante ${PROMO.meses} meses. Despues, ${precio} USD.`
                  : ciclo === 'anual'
                    ? `Equivale a ${(plan.precioAnio / 12).toFixed(2)} USD al mes`
                    : ''}
              </p>

              <ul className="mt-4 space-y-2 flex-1">
                {plan.incluye.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs">
                    <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-5 w-full"
                variant={plan.destacado ? 'default' : 'outline'}
                disabled={actual || pagando !== null || (sub != null && !sub.is_owner)}
                onClick={() => handleSuscribir(plan.code)}
              >
                {actual ? 'Tu plan actual' : pagando === plan.code ? 'Abriendo el pago...' : (
                  <>
                    <CreditCard size={16} weight="duotone" className="mr-1.5" />
                    Suscribirme
                  </>
                )}
              </Button>

              {sub != null && !sub.is_owner && !actual && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Solo el propietario del hotel puede contratar
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5 text-xs text-muted-foreground space-y-1.5">
        <p><strong className="text-foreground">Los usuarios no se cobran aparte.</strong> Da de alta a todo tu equipo sin coste adicional: cada quien con su cuenta y su rol, para que la auditoria sirva de algo.</p>
        <p><strong className="text-foreground">Se cobra por hotel.</strong> Si gestionas varios, el segundo y siguientes tienen un 20% de descuento.</p>
        <p><strong className="text-foreground">Puedes pagar en bolivares</strong> al cambio del dia, ademas de con tarjeta internacional.</p>
      </div>
    </div>
  );
}

/**
 * Estado actual de la suscripcion.
 *
 * El mensaje de conservacion de datos es deliberadamente explicito: un hotel que
 * no paga a tiempo necesita saber que su informacion sigue ahi. Perder el libro
 * de reservas por un recibo devuelto es la clase de cosa que hace que un cliente
 * no vuelva nunca, y lo cuente.
 */
function EstadoActual({ sub }: { sub: HotelSubscription }) {
  const plan = planByCode(sub.plan);

  if (sub.status === 'trialing') {
    const urgente = sub.days_left <= 7;
    return (
      <div className={`rounded-2xl border p-5 ${
        urgente ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/20' : 'border-border bg-card'
      }`}>
        <div className="flex items-start gap-3">
          <Sparkle size={20} weight="duotone" className={urgente ? 'text-amber-600' : 'text-primary'} />
          <div className="flex-1">
            <p className="font-bold text-sm">
              {sub.days_left > 0
                ? `Te quedan ${sub.days_left} dia${sub.days_left === 1 ? '' : 's'} de prueba`
                : 'Tu prueba termina hoy'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Estas probando {APP_NAME} completo, sin recortes, hasta el{' '}
              {sub.trial_ends_at ? formatDate(sub.trial_ends_at) : '—'}. Suscribete para seguir
              trabajando sin interrupciones.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (sub.access_level === 'read_only') {
    return (
      <div className="rounded-2xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 p-5">
        <div className="flex items-start gap-3">
          <Warning size={20} weight="duotone" className="text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-sm">Tu cuenta esta en modo solo lectura</p>
            <p className="text-xs text-muted-foreground mt-1">
              Puedes consultar y exportar toda tu informacion, pero no registrar reservas ni
              cobros nuevos.
            </p>
            {sub.data_retention_until && (
              <p className="text-xs mt-2 font-semibold text-foreground">
                Conservamos tu informacion hasta el {formatDate(sub.data_retention_until)}.
                Para seguir usandola, suscribete.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (sub.access_level === 'blocked') {
    return (
      <div className="rounded-2xl border border-red-400/50 bg-red-50 dark:bg-red-950/20 p-5">
        <div className="flex items-start gap-3">
          <Warning size={20} weight="duotone" className="text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-sm">Tu suscripcion ha terminado</p>
            {sub.data_retention_until && (
              <p className="text-xs mt-1">
                <strong>Tu informacion no se ha borrado.</strong> La conservamos hasta el{' '}
                {formatDate(sub.data_retention_until)}. Si te suscribes antes de esa fecha, lo
                recuperas todo tal y como lo dejaste: reservas, huespedes, pagos y contabilidad.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Suscripcion al corriente o con un cobro pendiente de reintento.
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Check size={20} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
        <div className="flex-1">
          <p className="font-bold text-sm">Plan {plan.nombre} activo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hasta {plan.maxHabitaciones} habitaciones · {plan.precioMes} USD al mes
          </p>
          {sub.status === 'past_due' && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 font-semibold">
              No pudimos cobrar tu ultimo recibo. Lo reintentaremos; puedes seguir trabajando
              con normalidad mientras tanto. Revisa tu metodo de pago.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
