# Sistema Hotelero — Guia de Desarrollo

> Convenciones de codigo, arquitectura y reglas de negocio criticas del ERP/PMS hotelero.

## Descripcion

ERP/PMS hotelero. Plataforma web responsive para operar un hotel desde un unico panel: ocupacion en tiempo real, reservas/alquileres con calculo automatico, check-in digital, ERP de ingresos/egresos con comprobantes, conciliacion bancaria, cierre de caja, promociones y descuentos.

Documento fuente del producto: `Propuesta_SistemaHotelero_Buggin_v3.pdf`.

---

## Stack actual (post-migracion a Supabase)

- **Frontend:** React 18 + Vite 6 + **TypeScript** + shadcn/ui (Radix + Tailwind) — SPA
- **Backend:** **Supabase** (Postgres + Auth + Storage + Edge Functions en Deno) — no hay backend Express propio
- **Base de datos:** PostgreSQL gestionado por Supabase, RLS activo en todas las tablas de negocio
- **Autenticacion:** **Supabase Auth** (JWT manejado por la libreria oficial, refresh automatico)
- **Storage:** Supabase Storage (buckets: `receipts`, `documents`, `signatures`, `bank-statements`)
- **Email:** Resend (invitaciones via edge function `admin-create-user`)
- **Tests:** Vitest (frontend)

> El directorio `_backend_legacy_express/` es el backend Express+pg anterior, **archivado**. No tocar salvo para referencia historica.

---

## Estructura del repositorio

```
frontend/
  src/
    modules/                # Un directorio por feature
      auth/                 # LoginPage, SetPasswordPage
      dashboard/            # Ocupacion + KPIs + quick actions
      rooms/                # Estado habitaciones, tipos, tarifas
      bookings/             # Calendario + lista + crear (cliente inline + descuento + pago)
      customers/            # Datos + historial + observaciones + placa + referral
      check-ins/            # Check-in/check-out digital
      cleaning/             # Cola de habitaciones pendientes de limpieza
      ledger/               # ERP ingresos/egresos
      payments/             # Pagos, cuentas por cobrar, cierre caja, conciliacion bancaria
      reports/              # KPIs + estadisticas diarias/semanales/mensuales/anuales
      settings/             # Usuarios, auditoria, configuracion
      profile/              # Perfil del usuario
    shared/
      api/                  # client.ts wrapper sobre supabase-js
      components/           # layout + ui (shadcn)
      hooks/                # useAuth, useToast, etc.
      lib/
        supabase.ts         # Cliente supabase singleton
        auth-helpers.ts     # Helpers JWT/sesion
    contexts/               # AuthContext
    layouts/                # AuthLayout, AppLayout
    router.tsx              # createBrowserRouter + lazy

supabase/
  config.toml               # Config del proyecto Supabase
  migrations/               # SQL secuencial por timestamp
    20260101000000_extensions_and_enums.sql
    20260101000100_profiles.sql
    20260101000200_core_tables.sql       # rooms, bookings, customers, payments, ledger, cash_closures, audit, ...
    20260101000300_triggers.sql
    20260101000400_rls_policies.sql
    20260101000500_views_and_rpcs.sql    # vistas + RPCs (dashboard_today, ledger_summary, reports_kpis, customer_timeline, next_code)
    20260101000600_fix_dashboard_rpc.sql
    20260101000700_seed_test_data.sql
    20260101000800_fix_next_code_security.sql
  functions/
    _shared/                # cors.ts, supabase.ts
    admin-create-user/      # Solo superadmin. Crea auth user + magic link
    booking-create/         # Valida disponibilidad, calcula tarifa, genera codigo, inserta
    booking-checkin/        # Transiciona booking->en_curso, room->ocupada
    booking-checkout/       # Transiciona booking->finalizada, room->limpieza, dispara orden de limpieza
    ledger-reverse/         # Asiento inverso para anular entry contable

_backend_legacy_express/    # Backend antiguo archivado, NO TOCAR

docs/                       # Documentacion tecnica
nginx/                      # Template de configuracion (legacy, no aplica con Supabase)
scripts/                    # Utilidades
```

### Como crear un nuevo modulo (frontend)

1. Crear directorio `frontend/src/modules/<nombre>/`
2. Subdirectorios: `api/`, `hooks/`, `components/`, `pages/`, `validation/`
3. Importar pages con `lazy()` en `router.tsx` y añadir rutas
4. Imports internos del modulo: relativos (`../hooks/useX`)
5. Imports compartidos: alias (`@/shared/components/ui/button`)

### Como agregar una edge function

1. Crear directorio `supabase/functions/<nombre>/`
2. Crear `index.ts` con handler de Deno. Importar helpers de `../_shared/`
3. Usar CORS desde `_shared/cors.ts` y cliente desde `_shared/supabase.ts`
4. Validar JWT del caller; el `service_role` solo se usa para operaciones administrativas tras la validacion

### Como agregar una migracion

1. Crear archivo `supabase/migrations/<timestamp>_<descripcion>.sql` (timestamp formato `YYYYMMDDhhmmss`)
2. SQL idempotente cuando sea posible (`IF NOT EXISTS`, `CREATE OR REPLACE`)
3. Si toca politicas RLS, validar que cada rol siga teniendo el acceso correcto
4. Probar localmente con `supabase db reset` o migrar contra dev antes de prod

---

## Convenciones de codigo

### Frontend (React + TypeScript)

- **TypeScript estricto** (`strict: true`)
- Componentes en **PascalCase** y archivos `.tsx`: `RoomCard.tsx`, `BookingDialog.tsx`
- Hooks en `camelCase` con prefijo `use`: `useRooms.ts`, `useBookings.ts`
- **shadcn/ui** para primitivas (Button, Input, Dialog, Table, Select, Badge, Calendar)
- **Tailwind CSS** para estilos — nunca CSS modules ni styled-components
- Estado global: **React Context** (AuthContext, ThemeContext) — NO Redux, NO Zustand
- Fetching: funciones tipadas en `<modulo>/api/<modulo>.api.ts` que usan `supabase` client
- Llamadas a edge functions con `supabase.functions.invoke('<name>', { body })`
- **React Router v6** con `createBrowserRouter` y lazy loading por pagina
- Forms con `react-hook-form` + `@hookform/resolvers/zod`
- Graficas con **Recharts**, calendario con **react-day-picker**
- Iconos con **@phosphor-icons/react**
- Toaster con **sonner**

### Edge functions (Deno + TypeScript)

- Validar JWT del caller con `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization } } })`
- Para operaciones administrativas, usar cliente con `SUPABASE_SERVICE_ROLE_KEY` **solo despues** de validar autorizacion
- Devolver `Response` JSON con `{ success, data | error }`
- CORS desde `_shared/cors.ts` (preflight `OPTIONS`)
- Errores con codigo HTTP correcto (400 validacion, 401 sin auth, 403 sin permiso, 409 conflicto, 500 interno)
- Capturar codigo Postgres `23P01` (exclusion violation) y devolver mensaje claro de solapamiento de reserva

### SQL / Migraciones

- Idioma campos: **español** para columnas de negocio (`nombre`, `fecha_entrada`, `importe_total`), **ingles** para metadata (`created_at`, `updated_at`, `created_by`)
- snake_case en columnas y tablas
- ENUMs en lugar de strings libres cuando hay set fijo (`status`, `payment_status`, `method`)
- RLS **activo siempre**: `ENABLE ROW LEVEL SECURITY` + politicas por rol
- Helpers en BD: `current_role()`, `has_role(VARIADIC user_role[])` ya definidos
- Codigos legibles via RPC `next_code(prefix)` (BK-YYYY-NNNN, LG-YYYY-NNNN, PAY-YYYY-NNNN, CC-YYYY-NNNN)

### General

- **Idioma codigo:** ingles para variables/funciones/types, español para comentarios y commits
- **Idioma UI y docs:** español neutro
- **Commits en español** con prefijos: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`, `style:`
- **Ramas:** `main` (produccion), `dev` (integracion), `feature/<slug-corto>`, `hotfix/<slug>`
- Variables de entorno en `.env` y secrets de Supabase — NUNCA hardcodeadas
- Variables `VITE_*` van al bundle publico: **solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`** y similares publicas
- Service role key, secretos de webhook: **solo en Supabase secrets** (edge functions)
- Nunca commit de `.env`, `node_modules/`, `dist/`, `.DS_Store`
- **Sin emojis** en codigo ni docs salvo peticion explicita

---

## Reglas de negocio criticas

### Autenticacion y sesiones (Supabase Auth)

- Login con email + password. Refresh automatico via libreria oficial
- Tabla `profiles` (1:1 con `auth.users`) tiene `role` (ENUM 5 valores) y `active`
- Trigger `handle_new_user()` crea `profiles` automaticamente al insertar en `auth.users`
- Edge function `admin-create-user` (solo superadmin) crea usuario + envia magic link de set-password
- Helpers en BD: `current_role()` retorna rol del usuario JWT, `has_role(roles...)` para policies

### Roles (5)

| Rol | Acceso |
| --- | --- |
| **superadmin** | Total. Unico que crea/desactiva usuarios |
| **admin** | Operativo completo, configuraciones, promociones, reportes |
| **recepcion** | Reservas, check-in, clientes, cobros |
| **limpieza** | Solo cambia estado de habitaciones (limpia → disponible) |
| **contabilidad** | ERP, reportes, conciliacion. Sin acceso a operacion |

### Habitaciones

- Estado en tiempo real: `disponible`, `ocupada`, `limpieza`, `mantenimiento`, `fuera_servicio`
- Cambio de estado registra en `audit_log`
- Al check-in → room pasa a `ocupada` automaticamente (edge `booking-checkin`)
- Al check-out → room pasa a `limpieza` automaticamente + se genera orden de limpieza (edge `booking-checkout`)
- Rol `limpieza` marca como `disponible` cuando termina

### Reservas / alquileres

- Periodo: `dia`, `semana`, `mes` — tarifa se toma del `room_type` correspondiente
- **Calculo automatico** del `importe_total` en edge function `booking-create`:
  - Tarifa base × cantidad de unidades
  - Menos `descuento_pct` (0-100) o `descuento_monto` (fijo) — campos en `bookings`
- **Anti-doble-reserva:** Constraint `EXCLUDE USING gist` sobre `(room_id, tstzrange(fecha_entrada, fecha_salida, '[)'))` WHERE status activo. Cubre crear/editar/mover/extender automaticamente. Codigo de error Postgres `23P01` debe atraparse en edge function y traducirse a mensaje claro al usuario.
- `importe_pendiente = importe_total - importe_pagado` se **calcula en aplicacion**, no se almacena
- Estados: `pendiente`, `confirmada`, `en_curso`, `finalizada`, `cancelada`, `no_show`
- Cancelacion: soft delete via `status='cancelada'` + `cancelled_at`
- Codigos legibles via `next_code('BK')` → `BK-YYYY-NNNN`

### Check-in / Check-out digital

- Solo recepcion/admin/superadmin
- Check-in (edge `booking-checkin`): captura hora_entrada, documento, firma opcional. booking → `en_curso`, room → `ocupada`
- Check-out (edge `booking-checkout`): captura hora_salida. booking → `finalizada`, room → `limpieza`. Genera orden de limpieza (notificable al rol limpieza)

### Huesped (customers)

- Campos: nombres, apellidos, doc_kind, doc_numero, email, telefono, fecha_nacimiento, nacionalidad, direccion, **placa_vehiculo** (default del huesped, sobreescribible por booking), **referral_source** (enum: instagram/facebook/google/recomendacion/calle/recurrente/otro), preferencias (JSONB), notas, accepts_marketing
- UNIQUE (`doc_kind`, `doc_numero`)
- Historial consultable via RPC `customer_timeline(p_id)` → estancias + emails

### ERP — ingresos / egresos (ledger)

- `ledger_entries` **inmutable** — correccion via asiento inverso (edge `ledger-reverse`)
- Ingresos auto al cobrar reserva, egresos manuales con comprobante obligatorio
- Codigos `LG-YYYY-NNNN` via `next_code('LG')`

### Pagos (booking_payments)

- N pagos por reserva (fraccionado). Sin constraint UNIQUE en `booking_id`
- ENUM `method`: `efectivo`, `tarjeta`, `transferencia`, `paypal`, `otro`, `pago_movil`, `zelle`, `punto_venta`, `efectivo_usd`, `efectivo_bs`
- ENUM `status`: `pending_confirmation` (pago_movil/zelle/transferencia inician aqui), `confirmed`, `rejected`
- Comprobante: `receipt_url` + `receipt_mime`. Notas: `notas`. Detalles especificos por metodo: `method_details` (JSONB con banco/cedula/telefono para pago movil)
- Tasa de cambio: tabla `exchange_rates` (fecha PK), `bs_per_usd`. `monto_base` y `tasa_cambio` se snapshot al pago
- Codigos `PAY-YYYY-NNNN`

### Cuentas por cobrar

- `getBookingStatement(booking_id)`: deuda + pagos por reserva
- `getCustomerStatement(customer_id)`: deuda agregada del cliente
- `importe_pendiente` calculado siempre como `importe_total - importe_pagado` (donde `importe_pagado` suma solo pagos `confirmed`)

### Cierre de caja

- Tabla `cash_closures` con `opened_at` y `closed_at` (rango horario explicito)
- Agrega totales por metodo + estado en JSONB `totals`
- `pending_count` para alertar de pagos sin confirmar
- Codigos `CC-YYYY-NNNN`

### Conciliacion bancaria

- Tabla `bank_statements` (extractos importados) y `bank_statement_movements`
- Match automatico/manual con `booking_payments.bank_match_id`

### Comprobantes / archivos

- Subida a Supabase Storage (`receipts`, `documents`, `signatures`, `bank-statements`)
- URLs firmadas con expiracion 15 min para visualizacion
- Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Tamaño maximo: 10 MB
- Validacion mime real (magic bytes) cuando posible

### Auditoria

- `audit_log` con `before`/`after` JSONB, IP, user_agent
- Cualquier accion sensible registra entrada
- Solo admin/superadmin pueden consultarlo (RLS)

### Seguridad

- **RLS activo** en todas las tablas de negocio
- Service role key **solo** en edge functions, nunca en frontend
- Secretos en Supabase secrets (`supabase secrets set`)
- Rate limit gestionado por Supabase Auth
- CORS configurado en edge functions desde `_shared/cors.ts`

---

## Formato de respuesta de edge functions

```jsonc
// Exito
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "Mensaje en español", "code": "ERROR_CODE" }
```

Codigos de error estandar: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `OVERLAP`, `INTERNAL_ERROR`.

---

## Comandos utiles

```bash
# Frontend
cd frontend
npm run dev                  # vite en :5173
npm run build                # vite build
npm run preview              # vite preview
npm run test                 # vitest

# Supabase local (requiere supabase CLI)
supabase start               # levanta stack local (db, auth, storage, functions)
supabase db reset            # re-aplica migrations + seed
supabase migration new <nombre>
supabase functions serve <nombre> --env-file .env.local
supabase functions deploy <nombre>
supabase db push             # aplica migrations al proyecto remoto
```

---

## Documentacion de referencia

- [docs/00-vision-producto.md](docs/00-vision-producto.md) — Que es, alcance, exclusiones
- [docs/01-esquema-base-datos.md](docs/01-esquema-base-datos.md) — Schema (puede estar desactualizado vs migrations actuales)
- [docs/02-estructura-proyecto.md](docs/02-estructura-proyecto.md) — Arquitectura modular
- [docs/03-api-endpoints.md](docs/03-api-endpoints.md) — Endpoints / edge functions
- [docs/04-plan-fases.md](docs/04-plan-fases.md) — Plan fase a fase
- [docs/05-decisiones-tecnicas.md](docs/05-decisiones-tecnicas.md) — ADR ligeros
