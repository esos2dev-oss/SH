# Sistema Hotelero — Guia de Desarrollo

> Convenciones de codigo, arquitectura modular y reglas de negocio criticas del ERM hotelero.

## Descripcion

ERP/PMS hotelero. Plataforma web responsive para operar un hotel desde un unico panel: ocupacion en tiempo real, reservas/alquileres con calculo automatico, check-in digital, ERP de ingresos/egresos con comprobantes, email marketing por eventos, promociones y descuentos.

Documento fuente del producto: `Propuesta_SistemaHotelero_Buggin_v3.pdf`.

---

## Stack

- **Frontend:** React 18 + Vite 6 + **TypeScript** + shadcn/ui (Radix + Tailwind) — SPA servida desde `/sh/` por Nginx
- **Backend:** Node.js 20 + Express + **TypeScript** — API REST en puerto 3002, proxy reverso Nginx
- **Base de datos:** PostgreSQL 17 — relacional, queries directas con `pg` (sin ORM), Row Level Security activo
- **Autenticacion:** JWT (access 15min) + refresh httpOnly (7 dias) + bcrypt cost factor 12
- **Storage:** Cloudflare R2 — comprobantes y fotos de habitaciones
- **Email:** Resend — transaccional + campañas por eventos (bienvenida, post-estancia, recuperacion)
- **Servidor:** VPS KVM1 — Nginx + PM2 + Let's Encrypt + pg_dump diario
- **Monitoreo:** Sentry + pino (logs estructurados)
- **Tests:** Vitest (backend y frontend)

---

## Estructura del repositorio (modular)

Arquitectura por modulos: cada dominio (rooms, bookings, customers, ledger...) contiene todo su codigo (routes, controller, service, model, validation, types). Codigo compartido en `shared/`.

```
backend/
  src/
    modules/                # Un directorio por dominio de negocio
      auth/                 # login, logout, refresh, set-password
        index.ts            # Exporta { prefix, router }
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.model.ts
        auth.validation.ts  # Schemas Zod
        auth.types.ts       # Types TS del dominio
      users/                # CRUD usuarios + roles + bienvenida Resend
      rooms/                # Habitaciones, tipos, tarifas, estado
      bookings/             # Reservas/alquileres con calculo automatico
      customers/            # Huespedes: datos, historial de estancias, segmentacion
      check-ins/            # Flujo de check-in/check-out digital
      ledger/               # Ingresos/egresos del ERP
      receipts/             # Comprobantes adjuntos a R2
      reports/              # Financieros + export CSV/PDF
      promotions/           # Codigos descuento + reglas + vigencias
      email-campaigns/      # Campañas por evento + plantillas + metricas
      audit-log/            # Bitacora de acciones
    shared/                 # Codigo compartido entre modulos
      config/               # db.ts (pg pool), r2.ts (S3 client), env.ts
      middleware/           # auth.ts, roleGuard.ts, errorHandler.ts, upload.ts, rls.ts
      services/             # r2.service.ts, email.service.ts, audit.service.ts
      utils/                # AppError.ts, logger.ts, presignedUrl.ts, dates.ts
      types/                # Types compartidos (Role, AuthUser, ApiResponse)
    jobs/                   # Cron: reminders, email-events, occupancy-snapshot
    app.ts                  # Express setup + registro automatico de modulos
    server.ts               # Bootstrap http server
  migrations/               # SQL secuencial: 001_initial_schema.sql, ...
  seeds/                    # Seed data SQL (admin inicial, room_types base)
  tests/                    # Vitest
  ecosystem.config.cjs      # PM2
  tsconfig.json
  package.json
  .env.example

frontend/
  src/
    modules/                # Un directorio por feature
      auth/                 # LoginPage, SetPasswordPage
      dashboard/            # Ocupacion + KPIs
      rooms/                # Panel estado, gestion tipos
        api/rooms.api.ts
        hooks/useRooms.ts
        components/RoomCard.tsx, RoomStatusBadge.tsx
        pages/RoomsPage.tsx, RoomTypesPage.tsx
        validation/room.schema.ts
        types.ts
      bookings/             # Calendario + lista + dialog reserva
      customers/
      check-ins/
      ledger/               # Ingresos/egresos + adjuntar comprobante
      reports/
      promotions/
      campaigns/            # Email marketing
      settings/             # Usuarios, plantillas, integraciones
      profile/
    shared/
      api/client.ts         # fetch nativo + interceptor refresh token
      components/
        layout/             # AppLayout, Sidebar, Navbar
        ui/                 # Primitivas shadcn/ui
      hooks/                # useAuth, useToast, useDebounce
      lib/                  # cn(), constantes, formatters
      pages/                # NotFoundPage
    contexts/               # AuthContext, ThemeContext
    layouts/                # AuthLayout, AppLayout
    App.tsx
    main.tsx
    index.css
    router.tsx              # createBrowserRouter + lazy
  tailwind.config.ts
  tsconfig.json
  vite.config.ts
  package.json

docs/                       # Documentacion tecnica MD
nginx/                      # Template de configuracion
scripts/                    # backup.sh, deploy.sh
```

### Como crear un nuevo modulo (backend)
1. Crear directorio `backend/src/modules/<nombre>/`
2. Crear archivos: `<nombre>.routes.ts`, `<nombre>.controller.ts`, `<nombre>.service.ts`, `<nombre>.model.ts`, `<nombre>.validation.ts`, `<nombre>.types.ts`
3. Crear `index.ts` que exporte `{ prefix: '/api/<nombre>', router }`
4. Importar y registrar en `app.ts` (array `modules`)

### Como crear un nuevo modulo (frontend)
1. Crear directorio `frontend/src/modules/<nombre>/`
2. Subdirectorios: `api/`, `hooks/`, `components/`, `pages/`, `validation/`
3. Importar pages con `lazy()` en `router.tsx` y añadir rutas
4. Imports internos del modulo: relativos (`../hooks/useX`)
5. Imports compartidos: alias (`@/shared/components/ui/button`)

---

## Convenciones de codigo

### Backend (Node.js + TypeScript)

- **TypeScript estricto** (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`)
- ES modules nativos (`"type": "module"` en package.json)
- Archivos en **kebab-case**: `booking.service.ts`, `auth.controller.ts`
- Funciones `async/await`, nunca callbacks
- Queries SQL directas con `pg` pool — **NO ORM** (ni Prisma, ni Drizzle, ni Knex)
- Validacion de input con **Zod** en cada endpoint, schemas en `<modulo>.validation.ts`
- Types del dominio en `<modulo>.types.ts`, derivados de Zod con `z.infer<...>` cuando aplique
- Errores con clase `AppError(message, statusCode, code?)` definida en `shared/utils/AppError.ts`
- Logger: `pino` con niveles info/warn/error, contexto estructurado (request id, user id)
- Cada controller responde con `res.json({ success: true, data })` o lanza `AppError`
- Tests con Vitest, archivos `*.test.ts` colocados al lado del codigo o en `tests/`

### Frontend (React + TypeScript)

- **TypeScript estricto** alineado con backend
- Componentes en **PascalCase** y archivos `.tsx`: `RoomCard.tsx`, `BookingDialog.tsx`
- Hooks en `camelCase` con prefijo `use`: `useRooms.ts`, `useBookings.ts`
- **shadcn/ui** para primitivas (Button, Input, Dialog, Table, Select, Badge, Calendar)
- **Tailwind CSS** para estilos — nunca CSS modules ni styled-components
- Estado global: **React Context** (AuthContext, ThemeContext) — NO Redux, NO Zustand
- Fetching: funciones tipadas en `<modulo>/api/<modulo>.api.ts`, llamadas desde hooks custom
- **fetch nativo** con interceptor de refresh token (0 deps de http)
- **React Router v6** con `createBrowserRouter` y lazy loading por pagina
- Forms con `react-hook-form` + `@hookform/resolvers/zod` y schema Zod compartido cuando aplique
- Graficas con **Recharts**, calendario con **react-day-picker** (incluido en shadcn)
- Iconos con **@phosphor-icons/react** (no lucide)
- Toaster con **sonner** (default shadcn)

### General

- **Idioma codigo:** ingles para variables/funciones/types, español para comentarios y commits
- **Idioma UI y docs:** español neutro
- **Commits en español** con prefijos: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`, `style:`
- **Ramas:** `main` (produccion), `dev` (integracion), `feature/<slug-corto>`, `hotfix/<slug>`
- Variables de entorno en `.env` — NUNCA hardcodeadas
- Nunca commit de `.env`, `node_modules/`, `dist/`, `.DS_Store`
- **Sin emojis** en codigo ni docs salvo peticion explicita

---

## Reglas de negocio criticas

### Autenticacion y sesiones

- Contraseñas con **bcrypt cost factor 12**
- JWT access token: **15 minutos**, header `Authorization: Bearer`
- Refresh token: **7 dias**, **httpOnly cookie** (`Secure` + `SameSite=Strict` en prod)
- Middleware chain estandar: `verifyToken` → `roleGuard(roles[])` → handler
- Refresh tokens se guardan **hasheados** en tabla `user_sessions` (revocables)
- Logout revoca el refresh token actual; "logout all" revoca todos los del usuario
- Endpoint `set-password/:token` con expiracion de 24h en `users.set_password_token`

### Roles (5)

| Rol | Acceso |
|-----|--------|
| **superadmin** | Total. Unico que crea/desactiva usuarios |
| **admin** | Operativo completo, configuraciones, promociones, reportes |
| **recepcion** | Reservas, check-in, clientes, cobros |
| **limpieza** | Solo cambia estado de habitaciones (limpia → disponible) |
| **contabilidad** | ERP, reportes, conciliacion. Sin acceso a operacion |

### Habitaciones

- Estado en tiempo real: `disponible`, `ocupada`, `limpieza`, `mantenimiento`, `fuera_servicio`
- Cambio de estado registra en `audit_log` (quien y cuando)
- Al iniciar check-in → habitacion pasa a `ocupada` automaticamente
- Al hacer check-out → habitacion pasa a `limpieza` automaticamente
- Limpieza marca como `disponible` cuando termina

### Reservas / alquileres

- Periodo: `dia`, `semana`, `mes` — la tarifa aplicada se toma del `room_type` correspondiente al periodo
- **Calculo automatico** del `importe_total` en backend en una sola transaccion:
  - Tarifa base × cantidad de unidades (noches/semanas/meses)
  - Menos descuento de promocion si aplica (porcentaje o monto fijo)
  - Validacion de no solapamiento con otras reservas activas en la misma habitacion
- `importe_pendiente = importe_total - importe_pagado` se **calcula en aplicacion**, no se almacena
- Estados: `pendiente`, `confirmada`, `en_curso`, `finalizada`, `cancelada`, `no_show`
- Cancelacion no borra el registro — soft delete via `status = 'cancelada'` + `cancelled_at`

### Check-in digital

- Solo recepcion/admin/superadmin pueden ejecutar check-in
- Requiere booking en estado `confirmada` o `pendiente` con pago suficiente segun politica
- Captura: hora_entrada, documento de identidad (foto/PDF a R2), firma opcional, observaciones
- Al ejecutar: booking → `en_curso`, room → `ocupada`, `audit_log` → entrada
- Check-out simetrico: booking → `finalizada`, room → `limpieza`

### ERP — ingresos / egresos

- Toda entrada en `ledger_entries` es inmutable una vez creada — correccion via asiento inverso
- `type = ingreso | egreso`, categoria personalizable por hotel
- Ingresos automaticos al cobrar reserva (vinculo `booking_id` y `customer_id`)
- Egresos manuales con comprobante obligatorio (imagen o PDF a R2)
- Conciliacion: estado `conciliado` se setea cuando coincide con extracto bancario importado
- Reportes diarios/semanales/mensuales agregados por categoria, exportables a CSV y PDF

### Comprobantes

- Subida a R2 con **pre-signed URLs**, expiracion 15 minutos para visualizacion
- Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Tamaño maximo: 10 MB
- Nunca se borran fisicamente — soft delete via `active = false`
- Validacion de mime type real (magic bytes), no solo extension

### Promociones

- Codigo unico, vigencia (fecha_inicio/fecha_fin), max_usos opcional
- Tipos: `porcentaje` (0-100) o `monto_fijo` (en moneda del hotel)
- Reglas en JSONB: minimo de noches, tipo de habitacion aplicable, dias de la semana, etc.
- Validacion en backend al crear booking; descuento aplicado se guarda historico en `booking_promotions`

### Email marketing

- Eventos automaticos: `bienvenida` (al crear customer), `post_estancia` (24h tras checkout), `fecha_especial` (cumpleaños), `recuperacion` (90 dias sin estancia)
- Plantillas con variables Mustache `{{customer.nombre}}`, `{{booking.fecha_entrada}}`, etc.
- Cron job `email-events` se ejecuta cada hora
- `email_logs` registra cada envio con status, provider_id (Resend), aperturas via webhook
- Anti-spam: respeta unsubscribe + cumplimiento GDPR/RGPD basico

### Auditoria

- Toda accion sensible (login, cambio rol, cambio estado room, creacion/cancelacion booking, edicion ledger) genera entrada en `audit_log`
- Campos: `user_id`, `action`, `entity`, `entity_id`, `before` (JSONB), `after` (JSONB), `ip`, `user_agent`, `created_at`
- Solo admin/superadmin pueden consultar el log

### Seguridad

- **Row Level Security** activo en `rooms`, `bookings`, `customers`, `ledger_entries`, `audit_log` — el usuario autenticado solo ve filas a las que su rol da acceso
- CORS configurado **por dominio**, nunca wildcard en produccion
- PostgreSQL **solo acceso local** desde el VPS (puerto 5432 firewallado)
- Rate limit en login (5 intentos/15min por IP)
- Helmet activo en backend
- Variables sensibles (Resend API key, R2 credentials, JWT secret) solo en `.env`, nunca en git

---

## Formato de respuesta API

```jsonc
// Exito
{ "success": true, "data": { ... }, "pagination": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } }

// Error
{ "success": false, "error": "Mensaje descriptivo en español", "code": "ERROR_CODE" }
```

Codigos de error estandar: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`.

---

## Comandos utiles (cuando exista codigo)

```bash
# Backend
cd backend
npm run dev                  # ts-node-dev en :3002 con hot reload
npm run build                # tsc -> dist/
npm run start                # node dist/server.js
npm run migrate              # aplica migrations en orden
npm run seed                 # carga seeds
npm run test                 # vitest

# Frontend
cd frontend
npm run dev                  # vite en :5173/sh/
npm run build                # vite build
npm run preview              # vite preview
npm run test                 # vitest

# Migraciones manuales
psql -U sh_user -d sh_db -f backend/migrations/001_initial_schema.sql

# PM2 (servidor)
pm2 start ecosystem.config.cjs
pm2 logs sh-api
pm2 restart sh-api
```

---

## Documentacion de referencia

- [docs/00-vision-producto.md](docs/00-vision-producto.md) — Que es, alcance, exclusiones
- [docs/01-esquema-base-datos.md](docs/01-esquema-base-datos.md) — Schema PostgreSQL completo
- [docs/02-estructura-proyecto.md](docs/02-estructura-proyecto.md) — Arquitectura modular detallada
- [docs/03-api-endpoints.md](docs/03-api-endpoints.md) — Endpoints REST por modulo
- [docs/04-plan-fases.md](docs/04-plan-fases.md) — Plan fase a fase con tareas
- [docs/05-decisiones-tecnicas.md](docs/05-decisiones-tecnicas.md) — ADR ligeros
