# 02 — Estructura del Proyecto

> **Stack:** React 18 + Vite 6 + TypeScript + Node.js 20 + Express + PostgreSQL 17
> Patron heredado del CRM MultiProyecto, adaptado al dominio hotelero y migrado a TypeScript.

---

## 1. Filosofia arquitectonica

**Una carpeta por dominio.** Cada modulo (rooms, bookings, ledger, etc.) contiene todo su codigo: rutas, controlador, servicio, modelo, validacion, types. El codigo realmente compartido entre modulos vive en `shared/`.

Razones:
- Onboarding rapido — para entender "como funcionan las reservas" se mira `modules/bookings/` y se acabo
- Bajo acoplamiento — agregar / quitar un modulo es mover una carpeta
- Refactor por dominio sin tocar carpetas globales

---

## 2. Estructura de carpetas (raiz)

```
sh/
├── backend/
├── frontend/
├── docs/
├── nginx/
├── scripts/
├── .gitignore
├── CLAUDE.md
├── README.md
└── Propuesta_SistemaHotelero_Buggin_v3.pdf
```

---

## 3. Backend

```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── index.ts                 # Exporta { prefix: '/api/auth', router }
│   │   │   ├── auth.routes.ts           # Express Router con endpoints
│   │   │   ├── auth.controller.ts       # Handlers HTTP, parsean req y delegan
│   │   │   ├── auth.service.ts          # Logica de negocio, transacciones
│   │   │   ├── auth.model.ts            # Queries SQL crudas con pg pool
│   │   │   ├── auth.validation.ts       # Schemas Zod para body/query/params
│   │   │   └── auth.types.ts            # Types TS del dominio (LoginInput, AuthUser)
│   │   ├── users/
│   │   ├── rooms/
│   │   ├── room-types/
│   │   ├── bookings/
│   │   ├── booking-payments/
│   │   ├── customers/
│   │   ├── check-ins/
│   │   ├── ledger/
│   │   ├── ledger-categories/
│   │   ├── receipts/
│   │   ├── reports/
│   │   ├── promotions/
│   │   ├── email-campaigns/
│   │   ├── email-templates/
│   │   ├── audit-log/
│   │   └── settings/
│   ├── shared/
│   │   ├── config/
│   │   │   ├── db.ts                    # pg.Pool y helpers de transaccion
│   │   │   ├── env.ts                   # Validacion de env vars con Zod
│   │   │   ├── r2.ts                    # S3Client de Cloudflare R2
│   │   │   └── resend.ts                # Cliente Resend
│   │   ├── middleware/
│   │   │   ├── auth.ts                  # verifyToken: parsea Bearer, set req.user
│   │   │   ├── role-guard.ts            # roleGuard(['admin', 'superadmin'])
│   │   │   ├── rls.ts                   # SET LOCAL app.* por request
│   │   │   ├── error-handler.ts         # AppError -> { success: false, ... }
│   │   │   ├── request-id.ts            # genera X-Request-ID por request
│   │   │   ├── upload.ts                # multer en memoria + validacion mime
│   │   │   └── rate-limit.ts            # express-rate-limit con configs
│   │   ├── services/
│   │   │   ├── r2.service.ts            # upload, delete, getPresignedUrl
│   │   │   ├── email.service.ts         # send, batch, render template Mustache
│   │   │   ├── audit.service.ts         # log() helper
│   │   │   └── code-generator.service.ts # genera "BK-2026-0001"
│   │   ├── utils/
│   │   │   ├── app-error.ts             # class AppError
│   │   │   ├── logger.ts                # pino con destination y redaction
│   │   │   ├── dates.ts                 # diffNoches, isOverlap, etc.
│   │   │   └── response.ts              # ok(), fail(), paginated()
│   │   └── types/
│   │       ├── api.ts                   # ApiResponse<T>, ApiError, Pagination
│   │       └── auth.ts                  # AuthUser, Role, JwtPayload
│   ├── jobs/
│   │   ├── email-events.job.ts          # Cron horario: dispara campañas auto
│   │   ├── post-estancia.job.ts         # 24h tras checkout
│   │   ├── cumpleanios.job.ts           # diario 09:00 hotel time
│   │   ├── recuperacion.job.ts          # diario, 90 dias sin estancia
│   │   ├── occupancy-snapshot.job.ts    # snapshot diario para reportes
│   │   └── index.ts                     # Registro de cron jobs (node-cron)
│   ├── app.ts                           # Express setup + registro de modulos
│   └── server.ts                        # http.createServer + startup logic
├── migrations/
│   ├── 001_extensions.sql
│   ├── 002_enums.sql
│   ├── 003_users.sql
│   ├── 004_rooms.sql
│   ├── 005_customers.sql
│   ├── 006_bookings.sql
│   ├── 007_ledger.sql
│   ├── 008_promotions.sql
│   ├── 009_email.sql
│   ├── 010_audit.sql
│   ├── 011_triggers.sql
│   └── 012_rls_policies.sql
├── seeds/
│   ├── 001_seed_admin.sql
│   ├── 002_seed_room_types.sql
│   ├── 003_seed_ledger_categories.sql
│   ├── 004_seed_email_templates.sql
│   └── 005_seed_settings.sql
├── tests/                               # Tests integracion + unitarios (vitest)
├── ecosystem.config.cjs                 # PM2
├── tsconfig.json
├── package.json
└── .env.example
```

### 3.1 Archivos clave de un modulo

Ejemplo: modulo `bookings/`.

| Archivo | Responsabilidad | Que NO debe estar |
|---------|-----------------|-------------------|
| `index.ts` | Exportar `{ prefix: '/api/bookings', router }` | Logica |
| `bookings.routes.ts` | Define rutas Express, conecta middleware + controller | Logica de negocio |
| `bookings.controller.ts` | Recibe req, valida con Zod, llama service, responde | Queries SQL |
| `bookings.service.ts` | Reglas de negocio, orquesta multiples queries, transacciones | HTTP, queries directas |
| `bookings.model.ts` | Queries SQL puras: `findById`, `insert`, `update` | Reglas de negocio |
| `bookings.validation.ts` | Schemas Zod: `createBookingSchema`, `updateBookingSchema` | Logica |
| `bookings.types.ts` | Types TS: `Booking`, `CreateBookingInput`, `BookingFilters` | Runtime code |

### 3.2 Como crear un modulo nuevo

1. Crear `backend/src/modules/<nombre>/` con los 7 archivos del patron
2. En `index.ts`:
   ```ts
   import { Router } from 'express';
   import { ... } from './<nombre>.controller';

   const router = Router();
   router.get('/', listHandler);
   // ...
   export default { prefix: '/api/<nombre>', router };
   ```
3. Registrar en `app.ts`:
   ```ts
   import bookingsModule from './modules/bookings';
   const modules = [authModule, usersModule, bookingsModule, /* ... */];
   modules.forEach(m => app.use(m.prefix, m.router));
   ```

### 3.3 Convenciones backend

- Cada `controller` envuelve handlers con un `asyncHandler` para no repetir try/catch
- El `service` recibe el `userId` y `role` como argumentos (no lee req), facilita testing
- El `model` siempre devuelve filas tipadas (`Booking`, `Booking[]` o `null`)
- Un endpoint que muta multiples tablas SIEMPRE va en transaccion (`pool.connect()` + `BEGIN/COMMIT/ROLLBACK`)
- `audit.service.log()` se llama desde el service tras cada accion sensible, dentro de la misma transaccion

---

## 4. Frontend

```
frontend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── api/auth.api.ts
│   │   │   ├── pages/LoginPage.tsx
│   │   │   ├── pages/SetPasswordPage.tsx
│   │   │   └── validation/auth.schema.ts
│   │   ├── dashboard/
│   │   │   ├── api/dashboard.api.ts
│   │   │   ├── components/OccupancyCard.tsx, KpiCard.tsx
│   │   │   ├── hooks/useDashboard.ts
│   │   │   └── pages/DashboardPage.tsx
│   │   ├── rooms/
│   │   │   ├── api/rooms.api.ts, room-types.api.ts
│   │   │   ├── components/RoomCard.tsx, RoomStatusBadge.tsx, RoomFormDialog.tsx
│   │   │   ├── hooks/useRooms.ts, useRoomTypes.ts
│   │   │   ├── pages/RoomsPage.tsx, RoomTypesPage.tsx
│   │   │   ├── validation/room.schema.ts
│   │   │   └── types.ts
│   │   ├── bookings/
│   │   │   ├── api/bookings.api.ts
│   │   │   ├── components/BookingCalendar.tsx, BookingFormDialog.tsx, BookingStatusBadge.tsx
│   │   │   ├── hooks/useBookings.ts
│   │   │   ├── pages/BookingsPage.tsx, BookingsCalendarPage.tsx, BookingDetailPage.tsx
│   │   │   ├── validation/booking.schema.ts
│   │   │   └── types.ts
│   │   ├── customers/
│   │   ├── check-ins/
│   │   ├── ledger/
│   │   ├── reports/
│   │   ├── promotions/
│   │   ├── campaigns/
│   │   ├── settings/
│   │   └── profile/
│   ├── shared/
│   │   ├── api/
│   │   │   └── client.ts                # fetch nativo + interceptor refresh
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Navbar.tsx
│   │   │   │   ├── ProtectedRoute.tsx
│   │   │   │   └── RoleRoute.tsx
│   │   │   ├── ui/                      # shadcn/ui (button, input, dialog, table, ...)
│   │   │   └── shared/                  # PageHeader, EmptyState, ConfirmDialog, FileUpload
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useToast.ts
│   │   │   └── useDebounce.ts
│   │   ├── lib/
│   │   │   ├── cn.ts                    # clsx + tailwind-merge
│   │   │   ├── format.ts                # formatCurrency, formatDate
│   │   │   └── constants.ts
│   │   └── pages/
│   │       └── NotFoundPage.tsx
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── layouts/
│   │   ├── AuthLayout.tsx
│   │   └── AppLayout.tsx
│   ├── App.tsx
│   ├── main.tsx
│   ├── router.tsx                       # createBrowserRouter + lazy
│   ├── index.css                        # Tailwind directives + CSS vars shadcn
│   └── vite-env.d.ts
├── public/
│   └── favicon.svg
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── components.json                      # config de shadcn/ui
└── package.json
```

### 4.1 Rutas frontend

| Ruta | Pagina | Roles | Layout |
|------|--------|-------|--------|
| `/login` | LoginPage | Public | AuthLayout |
| `/set-password/:token` | SetPasswordPage | Public | AuthLayout |
| `/` | DashboardPage | Todos auth | AppLayout |
| `/rooms` | RoomsPage | Todos auth | AppLayout |
| `/rooms/types` | RoomTypesPage | superadmin, admin | AppLayout |
| `/bookings` | BookingsPage | superadmin, admin, recepcion | AppLayout |
| `/bookings/calendar` | BookingsCalendarPage | superadmin, admin, recepcion | AppLayout |
| `/bookings/:id` | BookingDetailPage | superadmin, admin, recepcion | AppLayout |
| `/check-ins/new/:bookingId` | CheckInPage | superadmin, admin, recepcion | AppLayout |
| `/customers` | CustomersPage | superadmin, admin, recepcion | AppLayout |
| `/customers/:id` | CustomerDetailPage | superadmin, admin, recepcion | AppLayout |
| `/ledger` | LedgerPage | superadmin, admin, contabilidad | AppLayout |
| `/ledger/new` | LedgerNewPage | superadmin, admin, contabilidad | AppLayout |
| `/reports` | ReportsPage | superadmin, admin, contabilidad | AppLayout |
| `/promotions` | PromotionsPage | superadmin, admin | AppLayout |
| `/campaigns` | CampaignsPage | superadmin, admin | AppLayout |
| `/campaigns/templates` | EmailTemplatesPage | superadmin, admin | AppLayout |
| `/settings` | SettingsPage | superadmin, admin | AppLayout |
| `/settings/users` | UsersAdminPage | superadmin | AppLayout |
| `/settings/audit` | AuditLogPage | superadmin, admin | AppLayout |
| `/profile` | ProfilePage | Todos auth | AppLayout |
| `*` | NotFoundPage | — | — |

### 4.2 Sidebar segun rol

```
Operacion
├── Dashboard
├── Habitaciones (rooms, types*)
├── Reservas (list + calendar)
├── Check-in
└── Clientes

Finanzas (admin, contabilidad)
├── Ingresos / Egresos
└── Reportes

Marketing (admin)
├── Promociones
└── Campañas

Admin (superadmin)
├── Usuarios
└── Configuracion
   └── Audit Log

Footer
└── Mi perfil + Cerrar sesion
```

### 4.3 Convenciones frontend

- Cada modulo expone su `api/<modulo>.api.ts` con funciones tipadas que devuelven `Promise<ApiResponse<T>>`
- Los hooks (`useRooms`, `useBookings`) encapsulan estado + fetching + error handling
- Las paginas son lazy-loaded en `router.tsx` con `lazy()`
- Forms usan `react-hook-form` + `@hookform/resolvers/zod` con schemas reutilizables
- Componentes shadcn/ui se instalan via `npx shadcn-ui add <nombre>` y viven en `shared/components/ui/`
- Iconos: `@phosphor-icons/react` (consistencia con CRM)
- Toast/notificaciones: shadcn `sonner` (acepto cambio del CRM, mas simple)
- Dark mode via `ThemeContext` con clase `dark` en `<html>`

---

## 5. Stack frontend — dependencias esperadas

| Paquete | Uso |
|---------|-----|
| react ^18.3 + react-dom | Framework |
| typescript ^5.4 | Tipado |
| vite ^6 + @vitejs/plugin-react | Bundler / dev server |
| react-router-dom ^6.28 | Routing con lazy |
| tailwindcss ^3.4 + tailwindcss-animate | CSS utilitario |
| class-variance-authority + clsx + tailwind-merge | Helpers de clases |
| @radix-ui/* (segun shadcn instale) | Primitivas accesibles |
| lucide-react o @phosphor-icons/react | Iconos |
| react-hook-form ^7.54 + @hookform/resolvers ^3.9 | Forms |
| zod ^3.23 | Validacion + tipos |
| recharts ^2.14 | Graficas |
| react-day-picker | Calendario (via shadcn calendar) |
| date-fns ^3 | Formateo fechas |
| sonner | Toaster |

---

## 6. Stack backend — dependencias esperadas

| Paquete | Uso |
|---------|-----|
| express ^4 + cors + helmet | HTTP framework + seguridad |
| typescript ^5.4 + ts-node-dev | Tipado + dev server |
| pg ^8 | Postgres driver |
| zod ^3.23 | Validacion + types |
| jsonwebtoken ^9 | JWT |
| bcrypt ^5 | Hash de contraseñas |
| pino ^9 + pino-pretty (dev) | Logger estructurado |
| pino-http | Middleware de logging |
| @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner | R2 |
| resend ^3 | Email |
| multer | Upload archivos en memoria |
| express-rate-limit | Rate limiting |
| node-cron | Cron jobs |
| mustache | Render plantillas email |
| @sentry/node | Monitoreo |
| dotenv | Carga .env (solo dev — en prod se inyecta por systemd/PM2) |
| vitest + supertest | Testing |

---

## 7. Variables de entorno

Lista en `backend/.env.example`:

```bash
# App
NODE_ENV=development
PORT=3002
LOG_LEVEL=info
APP_URL=http://localhost:5173/sh
API_URL=http://localhost:3002

# Database
DATABASE_URL=postgres://sh_user:sh_pass@localhost:5432/sh_db

# Auth
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
BCRYPT_COST=12
COOKIE_DOMAIN=localhost

# R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=sh-prod
R2_PUBLIC_URL=

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM="Hotel <noreply@dominio.com>"
EMAIL_REPLY_TO=

# Sentry
SENTRY_DSN=

# CORS
CORS_ORIGIN=http://localhost:5173
```

Frontend usa `VITE_*` prefijo (`VITE_API_URL`).

---

## 8. Resumen modulos backend

| Modulo | Responsabilidad | Endpoints clave |
|--------|----------------|-----------------|
| `auth` | Login, logout, refresh, set-password | `/api/auth/*` |
| `users` | CRUD usuarios (solo superadmin) | `/api/users/*` |
| `rooms` | Habitaciones + estado en tiempo real | `/api/rooms/*` |
| `room-types` | Tipos de habitacion + tarifas | `/api/room-types/*` |
| `bookings` | Reservas/alquileres con calculo automatico | `/api/bookings/*` |
| `booking-payments` | Pagos parciales/totales | `/api/bookings/:id/payments` |
| `customers` | Huespedes + historial + segmentacion | `/api/customers/*` |
| `check-ins` | Check-in/check-out digital | `/api/check-ins/*` |
| `ledger` | Ingresos/egresos del ERP | `/api/ledger/*` |
| `ledger-categories` | Categorias personalizables | `/api/ledger-categories/*` |
| `receipts` | Comprobantes adjuntos a R2 | `/api/receipts/*` |
| `reports` | Reportes financieros + export CSV/PDF | `/api/reports/*` |
| `promotions` | Codigos descuento + reglas | `/api/promotions/*` |
| `email-campaigns` | Campañas + envios + metricas | `/api/email-campaigns/*` |
| `email-templates` | Plantillas de email | `/api/email-templates/*` |
| `audit-log` | Bitacora de acciones | `/api/audit-log/*` |
| `settings` | Configuracion clave-valor del hotel | `/api/settings/*` |

Total: **17 modulos backend**, **18 modulos frontend** (sumando dashboard y profile).

---

## 9. Lo que va en `shared/` y por que

Solo lo que de verdad lo necesitan multiples modulos:

| Pieza | Por que es shared |
|-------|-------------------|
| `pg.Pool` | Una sola conexion para toda la app |
| `verifyToken` middleware | Todos los modulos protegidos lo usan |
| `roleGuard` middleware | Todos los modulos lo usan |
| `AppError` clase | Todo modulo lanza errores con esta clase |
| `r2.service` | rooms (foto), receipts, check-ins (firma/doc), customers (futuro) |
| `email.service` | auth (set-password), users (bienvenida), email-campaigns (todo) |
| `audit.service` | Toda accion sensible registra audit |
| `code-generator` | bookings y ledger generan codigos legibles |

Si algo solo lo usa un modulo, vive dentro del modulo. No se promueve a `shared/` "por si acaso".
