import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';

import { AuthLayout } from './layouts/AuthLayout';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './shared/components/layout/ProtectedRoute';
import { RoleRoute } from './shared/components/layout/RoleRoute';

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
const BookingDetailPage = lazy(() => import('./modules/bookings/pages/BookingDetailPage'));
const CheckInPage = lazy(() => import('./modules/check-ins/pages/CheckInPage'));
const CheckOutPage = lazy(() => import('./modules/check-ins/pages/CheckOutPage'));

// ERP / Marketing
const LedgerPage = lazy(() => import('./modules/ledger/pages/LedgerPage'));
const ReportsPage = lazy(() => import('./modules/reports/pages/ReportsPage'));
const PromotionsPage = lazy(() => import('./modules/promotions/pages/PromotionsPage'));
const CampaignsPage = lazy(() => import('./modules/campaigns/pages/CampaignsPage'));
const EmailTemplatesPage = lazy(() => import('./modules/campaigns/pages/EmailTemplatesPage'));

// Admin / Perfil
const ProfilePage = lazy(() => import('./modules/profile/pages/ProfilePage'));
const UsersAdminPage = lazy(() => import('./modules/settings/pages/UsersAdminPage'));
const AuditLogPage = lazy(() => import('./modules/settings/pages/AuditLogPage'));

const NotFoundPage = lazy(() => import('./shared/pages/NotFoundPage'));

function Suspended({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter(
  [
    {
      element: <AuthLayout />,
      children: [
        { path: '/login', element: <Suspended><LoginPage /></Suspended> },
        { path: '/set-password/:token', element: <Suspended><SetPasswordPage /></Suspended> },
      ],
    },
    {
      element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
      children: [
        { index: true, element: <Suspended><DashboardPage /></Suspended> },

        // Rooms
        { path: 'rooms', element: <Suspended><RoomsPage /></Suspended> },
        {
          path: 'rooms/types',
          element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><RoomTypesPage /></Suspended></RoleRoute>,
        },

        // Customers
        {
          path: 'customers',
          element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><CustomersPage /></Suspended></RoleRoute>,
        },
        {
          path: 'customers/:id',
          element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><CustomerDetailPage /></Suspended></RoleRoute>,
        },

        // Bookings
        {
          path: 'bookings',
          element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><BookingsPage /></Suspended></RoleRoute>,
        },
        {
          path: 'bookings/calendar',
          element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion']}><Suspended><BookingsCalendarPage /></Suspended></RoleRoute>,
        },
        {
          path: 'bookings/:id',
          element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><BookingDetailPage /></Suspended></RoleRoute>,
        },

        // Check-ins
        {
          path: 'check-ins/new/:bookingId',
          element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion']}><Suspended><CheckInPage /></Suspended></RoleRoute>,
        },
        {
          path: 'check-ins/:bookingId',
          element: <RoleRoute allowed={['superadmin', 'admin', 'recepcion', 'contabilidad']}><Suspended><CheckOutPage /></Suspended></RoleRoute>,
        },

        // ERP
        {
          path: 'ledger',
          element: <RoleRoute allowed={['superadmin', 'admin', 'contabilidad']}><Suspended><LedgerPage /></Suspended></RoleRoute>,
        },
        {
          path: 'reports',
          element: <RoleRoute allowed={['superadmin', 'admin', 'contabilidad']}><Suspended><ReportsPage /></Suspended></RoleRoute>,
        },

        // Marketing
        {
          path: 'promotions',
          element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><PromotionsPage /></Suspended></RoleRoute>,
        },
        {
          path: 'campaigns',
          element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><CampaignsPage /></Suspended></RoleRoute>,
        },
        {
          path: 'campaigns/templates',
          element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><EmailTemplatesPage /></Suspended></RoleRoute>,
        },

        // Profile + admin
        { path: 'profile', element: <Suspended><ProfilePage /></Suspended> },
        {
          path: 'settings/users',
          element: <RoleRoute allowed={['superadmin']}><Suspended><UsersAdminPage /></Suspended></RoleRoute>,
        },
        {
          path: 'settings/audit',
          element: <RoleRoute allowed={['superadmin', 'admin']}><Suspended><AuditLogPage /></Suspended></RoleRoute>,
        },

        { path: '*', element: <Suspended><NotFoundPage /></Suspended> },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: '/sh' },
);
