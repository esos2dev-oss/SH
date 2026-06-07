# Sistema Hotelero (SH)

ERP/PMS hotelero — gestion integral de habitaciones, reservas, ERP contable y check-in digital.

> **Backend:** Supabase puro (Postgres + Auth + Storage + Edge Functions + Realtime).
> **Migracion desde Express:** completada. El backend Node.js previo queda archivado en
> `_backend_legacy_express/` como referencia. No se despliega.

---

## Stack

| Capa | Tecnologia |
|------|------------|
| **Frontend** | React 18 + Vite 6 + TypeScript + shadcn/ui + Tailwind. Base `/sh/` |
| **Backend** | **Supabase** — Postgres 17 + PostgREST + GoTrue (Auth) + Storage + Realtime |
| **Logica de negocio** | **Edge Functions** (Deno) para reglas que no caben en RLS+PostgREST |
| **Auth** | Supabase Auth (email/password + magic link para invitaciones) |
| **Storage** | Supabase Storage — buckets `receipts`, `check-in-docs`, `room-photos` |
| **Realtime** | Supabase Realtime — estado de habitaciones en vivo |
| **Hosting** | Supabase Cloud (Free para dev, Pro $25/mes prod) + frontend en Vercel/Netlify |

---

## Estructura

```
SH/
├── frontend/                       # SPA React + Vite + TS
│   ├── .env.example                # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
│   └── src/
│       ├── shared/lib/supabase.ts  # Cliente unico Supabase + helper invokeFunction
│       ├── contexts/AuthContext.tsx# Sesion via supabase.auth
│       └── modules/                # auth, bookings, rooms, customers, ...
│
├── supabase/
│   ├── config.toml                 # Config local (puertos, buckets, JWT)
│   ├── .env.example                # SUPABASE_URL, SERVICE_ROLE_KEY, etc.
│   ├── migrations/                 # SQL versionado (timestamped)
│   │   ├── 20260101000000_extensions_and_enums.sql
│   │   ├── 20260101000100_profiles.sql
│   │   ├── 20260101000200_core_tables.sql
│   │   ├── 20260101000300_triggers.sql
│   │   └── 20260101000400_rls_policies.sql
│   ├── seed.sql                    # room_types, ledger_categories, settings base
│   └── functions/
│       ├── _shared/                # cors.ts, supabase.ts (clients)
│       ├── booking-create/         # Calcula importe + valida no-solape
│       ├── booking-checkin/        # Booking->en_curso + room->ocupada + audit
│       ├── booking-checkout/       # Booking->finalizada + room->limpieza + audit
│       ├── ledger-reverse/         # Asiento inverso (ledger inmutable)
│       └── admin-create-user/      # Invita usuario via Auth Admin API
│
├── _backend_legacy_express/        # Backend Node.js previo (archivado, no se ejecuta)
├── docs/                           # Documentacion tecnica (pendiente actualizar para Supabase)
├── scripts/                        # dev-setup.ps1, dev-up.ps1 (pendiente actualizar)
└── Propuesta_SistemaHotelero_Buggin_v3.pdf
```

---

## Quickstart (desarrollo local)

### 1) Pre-requisitos
- Node.js 20+
- Docker Desktop (lo usa `supabase start` para levantar Postgres + servicios)
- Supabase CLI: `npm i -g supabase` o `scoop install supabase`

### 2) Levantar Supabase local
```powershell
cd c:/Users/Diego/Desktop/SH/SH
supabase start
# Aplica todas las migrations + seed automaticamente.
# Imprime las URLs y claves locales — anota anon key y service_role key.
```

### 3) Configurar frontend
```powershell
cd frontend
copy .env.example .env
# Editar .env con los valores que imprimio "supabase start":
#   VITE_SUPABASE_URL=http://127.0.0.1:54321
#   VITE_SUPABASE_ANON_KEY=<anon key local>
npm install
npm run dev   # http://localhost:5173/sh/
```

### 4) Crear el primer superadmin
En el Dashboard local (http://127.0.0.1:54323) → Authentication → Add user:
- Email + password
- En "User metadata" (raw JSON):
  ```json
  { "nombre": "Manuel Casas", "role": "superadmin" }
  ```
El trigger `handle_new_user` crea automaticamente el `profiles` row con el rol.

### 5) Login
Entrar en `http://localhost:5173/sh/login` con el email/password del paso 4.
Los siguientes usuarios se crean desde **Configuracion → Usuarios** (UI) o llamando
la edge function `admin-create-user` (envia magic link de invitacion).

---

## Despliegue a Supabase Cloud

```powershell
# 1. Linkear proyecto (una vez)
supabase login
supabase link --project-ref <tu-project-ref>

# 2. Empujar schema
supabase db push

# 3. Desplegar edge functions
supabase functions deploy booking-create
supabase functions deploy booking-checkin
supabase functions deploy booking-checkout
supabase functions deploy ledger-reverse
supabase functions deploy admin-create-user

# 4. Configurar secretos (si las funciones los usan)
supabase secrets set RESEND_API_KEY=...
```

Frontend: deploy a Vercel/Netlify con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
apuntando al proyecto hosted.

---

## Estado actual de la migracion a Supabase

**Migrado (✅):**
- Schema completo en `supabase/migrations/` (sin marketing, sin user_sessions)
- `users` → `profiles` (UUID = auth.users.id)
- RLS reescrito con `auth.uid()` + helper `public.has_role()`
- AuthContext + auth.api + LoginPage + SetPasswordPage usando Supabase Auth
- Edge functions para logica de negocio core: booking-create / checkin / checkout / ledger-reverse / admin-create-user
- Buckets de Storage configurados con sus politicas RLS

**Pendiente (⚠️):**
- Refactor de todos los modulos no-auth del frontend (`rooms`, `bookings`, `customers`, `payments`, `ledger`, `reports`, `settings`, `check-ins`, `cleaning`, `profile`, `dashboard`):
  cada `*.api.ts` actualmente llama a `/api/...` del Express. Hay que reemplazar
  por `supabase.from('tabla')...` o `invokeFunction('nombre')`.
- `frontend/src/shared/api/client.ts` puede eliminarse cuando se complete la migracion de modulos.
- Actualizar `docs/` para reflejar el nuevo stack.
- Actualizar `scripts/dev-setup.ps1` y `scripts/dev-up.ps1` (referencian PostgreSQL+Express).

---

## Roles (sin cambios)

| Rol | Acceso |
|-----|--------|
| **superadmin** | Total. Unico que crea/desactiva usuarios |
| **admin** | Operativo completo + promociones + reportes |
| **recepcion** | Reservas, check-in, clientes |
| **limpieza** | Solo cambia estado de habitaciones |
| **contabilidad** | ERP, reportes, sin acceso operativo |

---

## Convenciones

- **Idioma codigo:** ingles para variables/funciones, español para comentarios y docs
- **Commits:** español con prefijo `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`
- **Sin emojis** en codigo ni docs salvo peticion explicita
- **RLS first.** Las queries del frontend se autorizan por RLS, no por el backend.
- **Edge functions** solo para logica que no puede expresarse con RLS+PostgREST: calculos
  derivados (importe_total), transiciones de estado encadenadas (checkin), generacion de
  codigos (BK-YYYY-NNNN), envio de emails, llamadas a APIs externas.
