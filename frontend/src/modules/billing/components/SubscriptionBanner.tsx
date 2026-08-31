// Aviso de estado de la suscripcion, visible en toda la aplicacion.
//
// Solo aparece cuando hay algo que decir: prueba a punto de acabar, modo solo
// lectura o suscripcion terminada. Con la cuenta al corriente no molesta.
//
// El aviso de fin de prueba es, ademas de una cortesia, la palanca de conversion
// mas eficaz que tiene un producto de suscripcion.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Warning, Sparkle } from '@phosphor-icons/react';
import { formatDate } from '../../../shared/lib/format';
import { getSubscription, type HotelSubscription } from '../api/billing.api';

export function SubscriptionBanner() {
  const [sub, setSub] = useState<HotelSubscription | null>(null);

  useEffect(() => {
    let cancelado = false;
    // Un fallo aqui no puede tumbar la aplicacion: es un aviso, no una funcion
    // critica. Si no se puede leer el estado, simplemente no se muestra nada.
    getSubscription()
      .then((s) => { if (!cancelado) setSub(s); })
      .catch(() => { /* silencioso a proposito */ });
    return () => { cancelado = true; };
  }, []);

  if (!sub) return null;

  const avisarPrueba = sub.status === 'trialing' && sub.days_left <= 7;
  const restringido = sub.access_level === 'read_only' || sub.access_level === 'blocked';
  if (!avisarPrueba && !restringido) return null;

  if (restringido) {
    const bloqueado = sub.access_level === 'blocked';
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-xs font-medium ${
        bloqueado
          ? 'bg-red-600 text-white'
          : 'bg-amber-500 text-amber-950'
      }`}>
        <Warning size={15} weight="fill" className="shrink-0" />
        <span className="font-bold">
          {bloqueado ? 'Tu suscripcion ha terminado.' : 'Modo solo lectura: no puedes registrar reservas ni cobros.'}
        </span>
        {sub.data_retention_until && (
          <span>
            Conservamos tu informacion hasta el {formatDate(sub.data_retention_until)}.
          </span>
        )}
        <Link
          to="/suscripcion"
          className="ml-auto rounded-md bg-white/20 px-2.5 py-1 font-bold underline-offset-2 hover:bg-white/30 transition-colors"
        >
          Suscribirme
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-primary/10 px-4 py-2 text-xs font-medium text-foreground">
      <Sparkle size={15} weight="fill" className="shrink-0 text-primary" />
      <span className="font-bold">
        {sub.days_left > 0
          ? `Te ${sub.days_left === 1 ? 'queda 1 dia' : `quedan ${sub.days_left} dias`} de prueba.`
          : 'Tu prueba termina hoy.'}
      </span>
      <span className="text-muted-foreground">Suscribete para no perder el acceso a tu informacion.</span>
      <Link
        to="/suscripcion"
        className="ml-auto rounded-md bg-primary px-2.5 py-1 font-bold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Ver planes
      </Link>
    </div>
  );
}
