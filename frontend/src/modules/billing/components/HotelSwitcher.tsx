// Selector de hotel.
//
// Solo aparece si el usuario pertenece a mas de uno: a un hotelero con una sola
// posada no hay que mostrarle un desplegable con una unica opcion.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Buildings, CaretUpDown, Check } from '@phosphor-icons/react';
import { listMyHotels, switchHotel, type HotelMembership } from '../api/hotels.api';

const ROLES: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  recepcion: 'Recepcion',
  limpieza: 'Limpieza',
  contabilidad: 'Contabilidad',
  restaurante: 'Restaurante',
};

export function HotelSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const [hoteles, setHoteles] = useState<HotelMembership[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cambiando, setCambiando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setHoteles(await listMyHotels());
    } catch {
      // Es navegacion auxiliar: si falla, la aplicacion sigue funcionando con
      // el hotel que ya tuviera activo.
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  // Con un solo hotel no hay nada que elegir.
  if (hoteles.length <= 1) return null;

  const activo = hoteles[0]!;

  async function elegir(h: HotelMembership) {
    if (cambiando) return;
    setCambiando(h.hotel_id);
    try {
      await switchHotel(h.hotel_id);
      toast.success(`Ahora trabajas en ${h.nombre}`);
      // Recarga completa: hay datos de otro hotel cacheados por toda la
      // aplicacion, y limpiarlos uno a uno es mas fragil que empezar de cero.
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar de hotel');
      setCambiando(null);
    }
  }

  return (
    <div className="relative px-2 mb-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left hover:border-primary/40 transition-colors"
        aria-expanded={abierto}
        aria-haspopup="listbox"
      >
        <Buildings size={16} weight="duotone" className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold">{activo.nombre}</span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {ROLES[activo.role] ?? activo.role}
          </span>
        </span>
        <CaretUpDown size={14} className="shrink-0 text-muted-foreground" />
      </button>

      {abierto && (
        <ul
          role="listbox"
          className="absolute left-2 right-2 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          {hoteles.map((h) => (
            <li key={h.hotel_id}>
              <button
                type="button"
                role="option"
                aria-selected={h.hotel_id === activo.hotel_id}
                disabled={cambiando !== null}
                onClick={() => { void elegir(h); onNavigate?.(); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-muted transition-colors disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.nombre}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {ROLES[h.role] ?? h.role}
                    {h.access !== 'full' && ' · sin suscripcion'}
                  </span>
                </span>
                {h.hotel_id === activo.hotel_id && (
                  <Check size={14} weight="bold" className="shrink-0 text-primary" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
