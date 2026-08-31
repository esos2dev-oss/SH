import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { listMyHotels } from '../../../modules/billing/api/hotels.api';

/** Rutas accesibles con sesion pero sin pertenecer todavia a ningun hotel. */
const SIN_HOTEL_PERMITIDAS = ['/nuevo-hotel', '/perfil'];

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // null = todavia no se sabe. Se distingue de 0 a proposito: redirigir mientras
  // se comprueba mandaria al asistente a gente que si tiene hotel.
  const [numHoteles, setNumHoteles] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelado = false;
    listMyHotels()
      .then((h) => { if (!cancelado) setNumHoteles(h.length); })
      // Si la consulta falla, se asume que si tiene: dejar pasar y que la
      // pantalla muestre su propio error es mejor que empujar a alguien con
      // hotel a crear otro por un fallo de red.
      .catch(() => { if (!cancelado) setNumHoteles(1); });
    return () => { cancelado = true; };
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Cargando sesion...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (numHoteles === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Preparando tu espacio...
      </div>
    );
  }

  // Recien registrado: al asistente en vez de a un panel vacio donde no puede
  // hacer nada y sin pista de que le falta.
  const enRutaPermitida = SIN_HOTEL_PERMITIDAS.some((r) => location.pathname.startsWith(r));
  if (numHoteles === 0 && !enRutaPermitida) {
    return <Navigate to="/nuevo-hotel" replace />;
  }

  return <>{children}</>;
}
