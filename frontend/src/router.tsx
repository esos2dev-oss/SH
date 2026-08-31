import { createBrowserRouter, Navigate, useParams, useRouteError } from 'react-router-dom';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';

import { AuthLayout } from './layouts/AuthLayout';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './shared/components/layout/ProtectedRoute';
import { RoleRoute } from './shared/components/layout/RoleRoute';
import { useAuth } from './contexts/AuthContext';

// Redirect que conserva los parametros de la ruta.
// <Navigate to="/huespedes/:id"> no sustituye nada: navega a la URL literal
// "/huespedes/:id", que no existe y acaba en el NotFound.
function RedirectWithParams({ to }: { to: string }) {
  const params = useParams();
  const target = to.replace(/:([A-Za-z0-9_]+)/g, (match, key) => params[key] ?? match);
  return <Navigate to={target} replace />;
}

// Index redirect: rol limpieza va siempre a /limpieza.
function IndexRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'limpieza') return <Navigate to="/limpieza" replace />;
  if (user?.role === 'restaurante') return <Navigate to="/desayunos" replace />;
  return <>{children}</>;
}

// Auth
const LoginPage = lazy(() => import('./modules/auth/pages/LoginPage'));
const SetPasswordPage = lazy(() => import('./modules/auth/pages/SetPasswordPage'));

// Operacion
const DashboardPage = lazy(() => import('./modules/dashboard/pages/DashboardPage'));
const RoomsPage = lazy(() => import('./modules/rooms/pages/RoomsPage'));
const RoomTypesPage = lazy(() => import('./modules/rooms/pages/RoomTypesPage'));
const CustomersPage = lazy(() => import('./modules/customers/pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./modules/customers/pages/CustomerDetailPage'));
const BookingsPage = lazy(() => import('./modules/bookings/pages/BookingsPage'));
const BookingsCalendarPage = lazy(() => import('./modules/bookings/pages/BookingsCalendarPage'));
const OccupancyTimelinePage = lazy(() => import('./modules/bookings/pages/OccupancyTimelinePage'));
const BookingDetailPage = lazy(() => import('./modules/bookings/pages/BookingDetailPage'));
const CheckInPage = lazy(() => import('./modules/check-ins/pages/CheckInPage'));
const CheckOutPage = lazy(() => import('./modules/check-ins/pages/CheckOutPage'));
const CleaningPage = lazy(() => import('./modules/cleaning/pages/CleaningPage'));

// Pagos
const PaymentsPage = lazy(() => import('./modules/payments/pages/PaymentsPage'));
const BankReconciliationPage = lazy(() => import('./modules/payments/pages/BankReconciliationPage'));
const CashClosurePage = lazy(() => import('./modules/payments/pages/CashClosurePage'));
const PaymentsSettingsPage = lazy(() => import('./modules/payments/pages/PaymentsSettingsPage'));

// ERP / Marketing
const LedgerPage = lazy(() => import('./modules/ledger/pages/LedgerPage'));
const ReportsPage = lazy(() => import('./modules/reports/pages/ReportsPage'));

// Admin / Perfil
const ProfilePage = lazy(() => import('./modules/profile/pages/ProfilePage'));
const UsersAdminPage = lazy(() => import('./modules/settings/pages/UsersAdminPage'));
const AuditLogPage = lazy(() => import('./modules/settings/pages/AuditLogPage'));
const SettingsHubPage = lazy(() => import('./modules/settings/pages/SettingsHubPage'));
const HelpPage = lazy(() => import('./modules/help/pages/HelpPage'));
const MaintenancePage = lazy(() => import('./modules/maintenance/pages/MaintenancePage'));
const BreakfastPage = lazy(() => import('./modules/breakfast/pages/BreakfastPage'));
const AttendancePage = lazy(() => import('./modules/attendance/pages/AttendancePage'));
const PlantaPage = lazy(() => import('./modules/planta/pages/PlantaPage'));
const PlansPage = lazy(() => import('./modules/billing/pages/PlansPage'));
const OnboardingPage = lazy(() => import('./modules/billing/pages/OnboardingPage'));
const LandingPage = lazy(() => import('./modules/landing/pages/LandingPage'));

const NotFoundPage = lazy(() => import('./shared/pages/NotFoundPage'));

function Suspended({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
      {children}
    </Suspense>
  );
}

// Cuando un lazy() falla (chunk hash viejo tras deploy nuevo), react-router lo captura
// en su propio errorElement y NO lo re-lanza a window.error. Aqui detectamos y recargamos.
function isChunkError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return m.includes('failed to fetch dynamically imported module') ||
         m.includes('importing a module script failed') ||
         m.includes('unable to preload css') ||
         m.includes('chunkloaderror');
}
const CHUNK_RELOAD_FLAG = 'sh-chunk-reload';
function RouteErrorBoundary() {
  const err = useRouteError();
  useEffect(() => {
    if (isChunkError(err) && !sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
      sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
      window.location.reload();
    }
  }, [err]);
  if (isChunkError(err)) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  }
  const msg = err instanceof Error ? err.message : String(err ?? 'Error inesperado');
  return (
    <div className="max-w-lg mx-auto mt-16 p-6 bg-card border border-border rounded-2xl text-center space-y-4">
      <h1 className="text-lg font-bold">Ocurrio un error</h1>
      <p className="text-sm text-muted-foreground break-words">{msg}</p>
      <button onClick={() => { sessionStorage.removeItem(CHUNK_RELOAD_FLAG); window.location.href = '/sh/'; }} className="h-10 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm">Volver al inicio</button>
    </div>
  );
}

export const router = createBrowserRouter(
  [
    {
      element: <AuthLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        { path: '/bienvenido', element: <Suspended><LandingPage /></Suspended> },
        { path: '/login', element: <Suspended><LoginPage /></Suspended> },
        { path: '/establecer-clave', element: <Suspended><SetPasswordPage /></Suspended> },
      ],
    },
    // Alta de hotel: a pantalla completa, sin el layout de la aplicacion. Pide
    // sesion pero no hotel — es justo lo que viene a crear.
    {
      path: '/nuevo-hotel',
      element: <ProtectedRoute><Suspended><OnboardingPage /></Suspended></ProtectedRoute>,
    },
    {
      element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
      errorElement: <RouteErrorBoundary />,
      children: [
        { index: true, element: <IndexRoute><Suspended><DashboardPage /></Suspended></IndexRoute> },

        // === URLs en espanol ===
        // Habitaciones
        { path: 'habitaciones', element: <Suspended><RoomsPage /></Suspended> },
        { path: 'habitaciones/tipos', element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><RoomTypesPage /></Suspended></RoleRoute> },

        // Huespedes
        { path: 'huespedes', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><CustomersPage /></Suspended></RoleRoute> },
        { path: 'huespedes/:id', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><CustomerDetailPage /></Suspended></RoleRoute> },

        // Reservas
        { path: 'reservas', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><BookingsPage /></Suspended></RoleRoute> },
        { path: 'reservas/calendario', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion']}><Suspended><BookingsCalendarPage /></Suspended></RoleRoute> },
        { path: 'reservas/timeline', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion']}><Suspended><OccupancyTimelinePage /></Suspended></RoleRoute> },
        { path: 'reservas/:id', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><BookingDetailPage /></Suspended></RoleRoute> },

        // Check-in / Check-out
        { path: 'check-in/nuevo/:bookingId', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion']}><Suspended><CheckInPage /></Suspended></RoleRoute> },
        { path: 'check-in/:bookingId', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><CheckOutPage /></Suspended></RoleRoute> },
        { path: 'limpieza', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'limpieza']}><Suspended><CleaningPage /></Suspended></RoleRoute> },
        { path: 'mantenimiento', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad']}><Suspended><MaintenancePage /></Suspended></RoleRoute> },

        // Pagos
        { path: 'pagos', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><PaymentsPage /></Suspended></RoleRoute> },
        { path: 'pagos/conciliacion', element: <RoleRoute allowed={['superadmin', 'admin', 'contabilidad']}><Suspended><BankReconciliationPage /></Suspended></RoleRoute> },
        { path: 'pagos/cierre-caja', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><CashClosurePage /></Suspended></RoleRoute> },
        { path: 'pagos/configuracion', element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><PaymentsSettingsPage /></Suspended></RoleRoute> },

        // Finanzas
        { path: 'finanzas', element: <RoleRoute allowed={['superadmin', 'admin', 'contabilidad']}><Suspended><LedgerPage /></Suspended></RoleRoute> },
        { path: 'reportes', element: <RoleRoute allowed={['superadmin', 'admin', 'contabilidad']}><Suspended><ReportsPage /></Suspended></RoleRoute> },

        { path: 'ayuda', element: <Suspended><HelpPage /></Suspended> },

        // Desayunos
        { path: 'desayunos', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><BreakfastPage /></Suspended></RoleRoute> },

        // Asistencia empleados (todos los roles pueden marcar entrada/salida)
        { path: 'asistencia', element: <Suspended><AttendancePage /></Suspended> },

        // Planta electrica (generador)
        { path: 'planta', element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad']}><Suspended><PlantaPage /></Suspended></RoleRoute> },

        // Perfil + configuracion
        { path: 'perfil', element: <Suspended><ProfilePage /></Suspended> },
        { path: 'configuracion', element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><SettingsHubPage /></Suspended></RoleRoute> },
        { path: 'configuracion/usuarios', element: <RoleRoute allowed={['superadmin']}><Suspended><UsersAdminPage /></Suspended></RoleRoute> },
        { path: 'configuracion/auditoria', element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><AuditLogPage /></Suspended></RoleRoute> },
        // Suscripcion: la ve cualquiera del hotel, pero solo el owner puede contratar.
        { path: 'suscripcion', element: <Suspended><PlansPage /></Suspended> },

        // === Redirects retrocompatibilidad (bookmarks/enlaces viejos en ingles) ===
        { path: 'rooms', element: <Navigate to="/habitaciones" replace /> },
        { path: 'rooms/types', element: <Navigate to="/habitaciones/tipos" replace /> },
        { path: 'customers', element: <Navigate to="/huespedes" replace /> },
        { path: 'customers/:id', element: <RedirectWithParams to="/huespedes/:id" /> },
        { path: 'bookings', element: <Navigate to="/reservas" replace /> },
        { path: 'bookings/calendar', element: <Navigate to="/reservas/calendario" replace /> },
        { path: 'bookings/timeline', element: <Navigate to="/reservas/timeline" replace /> },
        { path: 'bookings/:id', element: <RedirectWithParams to="/reservas/:id" /> },
        { path: 'check-ins/new/:bookingId', element: <RedirectWithParams to="/check-in/nuevo/:bookingId" /> },
        { path: 'check-ins/:bookingId', element: <RedirectWithParams to="/check-in/:bookingId" /> },
        { path: 'cleaning', element: <Navigate to="/limpieza" replace /> },
        { path: 'payments', element: <Navigate to="/pagos" replace /> },
        { path: 'payments/bank', element: <Navigate to="/pagos/conciliacion" replace /> },
        { path: 'payments/cash-closure', element: <Navigate to="/pagos/cierre-caja" replace /> },
        { path: 'payments/settings', element: <Navigate to="/pagos/configuracion" replace /> },
        { path: 'ledger', element: <Navigate to="/finanzas" replace /> },
        { path: 'reports', element: <Navigate to="/reportes" replace /> },
        { path: 'profile', element: <Navigate to="/perfil" replace /> },
        { path: 'settings', element: <Navigate to="/configuracion" replace /> },
        { path: 'settings/users', element: <Navigate to="/configuracion/usuarios" replace /> },
        { path: 'settings/audit', element: <Navigate to="/configuracion/auditoria" replace /> },

        { path: '*', element: <Suspended><NotFoundPage /></Suspended> },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: '/sh' },
);
