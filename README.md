# Sistema Hotelero (SH)

ERP/PMS hotelero — gestion integral de habitaciones, reservas, ERP contable, check-in digital y email marketing por eventos.

> **Propuesta tecnica fuente:** `Propuesta_SistemaHotelero_Buggin_v3.pdf` (abril 2026, v1.0).
> **Estado:** Fase 0 — Discovery & Diseño. Este repositorio contiene unicamente documentacion de planificacion. Aun no hay codigo.

---

## Vision del producto

Plataforma web responsive (PWA) para que un hotel opere desde un unico panel:

- Estado de habitaciones en tiempo real (libre, ocupada, limpieza, mantenimiento).
- Alquiler por dia, semana o mes con calculo automatico y descuentos por temporada/cliente.
- Check-in digital de huespedes con historial completo.
- ERP de ingresos y egresos con comprobantes adjuntos (imagen/PDF).
- Reportes financieros diarios, semanales y mensuales con export CSV/PDF.
- Email marketing automatizado por eventos (bienvenida, post-estancia, recuperacion).
- Promociones y descuentos por codigo, vigencia y reglas.
- Multiusuario con roles (admin, recepcion, limpieza, contabilidad) y bitacora de acciones.

Para detalle de alcance ver `docs/00-vision-producto.md`.

---

## Stack tecnico

| Capa | Tecnologia | Notas |
|------|------------|-------|
| **Frontend** | React 18 + Vite 6 + **TypeScript** + shadcn/ui + Tailwind CSS | SPA servida por Nginx, base path `/sh/` |
| **Backend** | Node.js 20+ + Express + **TypeScript** | API REST en puerto 3002 (proxy Nginx `/sh/api`) |
| **Base de datos** | PostgreSQL 17 | Queries directas con `pg` (sin ORM). RLS nativo para seguridad por filas |
| **Autenticacion** | JWT (access 15min) + refresh httpOnly + bcrypt cost 12 | RLS por rol y por hotel |
| **Storage** | Cloudflare R2 (compatible S3) | Comprobantes, fotos de habitaciones |
| **Email** | **Resend** (API v1) | Transaccional + campañas por eventos |
| **Servidor** | VPS KVM1 €18/mes + IVA | Ubuntu 24.04 + Nginx + PM2 + Let's Encrypt |
| **Monitoreo** | Sentry + pino logs | Captura de errores y logs estructurados |
| **Backups** | pg_dump diario automatizado | Retencion 14 dias |
| **CI/CD** | GitHub Actions + deploy SSH | Validacion antes de produccion |

> Por que TS, por que Node+Express y no BaaS, por que Resend: ver `docs/05-decisiones-tecnicas.md`.

---

## Modulos del sistema

**Operativo (Fase 03):**
- `rooms` — habitaciones, tipos, tarifas, estado en tiempo real
- `bookings` — reservas/alquileres con calculo automatico
- `customers` — registro de huespedes con historial de estancias
- `check-ins` — registro digital al ingreso/salida

**ERP & Marketing (Fase 04):**
- `ledger` — ingresos/egresos con categorias
- `receipts` — comprobantes adjuntos (R2)
- `reports` — financieros con export CSV/PDF
- `promotions` — codigos y reglas de descuento
- `email-campaigns` — campañas automatizadas por evento

**Transversales:**
- `auth` — login, logout, refresh, set-password
- `users` — multiusuario con 5 roles
- `audit-log` — bitacora de acciones

Detalle modular completo: `docs/02-estructura-proyecto.md`.

---

## Roles

| Rol | Acceso |
|-----|--------|
| **superadmin** | Total. Unico que crea/desactiva usuarios |
| **admin** | Operativo completo, gestiona promociones y reportes |
| **recepcion** | Reservas, check-in, clientes |
| **limpieza** | Solo cambia estado de habitaciones |
| **contabilidad** | ERP, reportes, sin acceso operativo |

---

## Plan de fases

| Fase | Etapa | Duracion | Entregable |
|------|-------|----------|------------|
| 01 | Discovery & Diseño | 2 dias | Prototipo navegable, schema validado, flujos aprobados |
| 02 | Setup & Arquitectura | 1 dia | Proyecto base, BD, auth multiusuario, preview deployado |
| 03 | Nucleo Operativo | 5–7 dias | Habitaciones, reservas, check-in, ocupacion |
| 04 | ERP & Marketing | 4–5 dias | Ingresos/egresos, comprobantes, promos, email marketing |
| 05 | QA & Despliegue | 2 dias | Pruebas integrales, deploy VPS, capacitacion, manuales |

Detalle por fase con tareas y criterios de aceptacion: `docs/04-plan-fases.md`.

---

## Estructura del repositorio (esperada)

```
sh/
├── backend/                      # API REST Node.js + Express + TS
│   ├── src/
│   │   ├── modules/              # Un directorio por dominio
│   │   ├── shared/               # config, middleware, services, utils
│   │   └── app.ts                # Entry point
│   ├── migrations/               # SQL secuencial (001_, 002_...)
│   ├── seeds/                    # Seed data inicial
│   ├── tests/                    # Vitest
│   ├── ecosystem.config.cjs      # PM2
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/                     # SPA React + Vite + TS
│   ├── src/
│   │   ├── modules/              # Un directorio por feature
│   │   ├── shared/               # api, components, hooks, lib, layouts
│   │   ├── contexts/             # AuthContext, ThemeContext
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── package.json
│
├── docs/                         # Documentacion tecnica
│   ├── 00-vision-producto.md
│   ├── 01-esquema-base-datos.md
│   ├── 02-estructura-proyecto.md
│   ├── 03-api-endpoints.md
│   ├── 04-plan-fases.md
│   └── 05-decisiones-tecnicas.md
│
├── nginx/                        # Configuracion del proxy
├── scripts/                      # backup.sh, deploy.sh
├── .gitignore
├── CLAUDE.md                     # Convenciones de codigo
├── README.md                     # Este archivo
└── Propuesta_SistemaHotelero_Buggin_v3.pdf
```

---

## Equipo

| Persona | Rol | Area |
|---------|-----|------|
| **Manuel Casas** | Propietario / Superadmin | Direccion |
| **Buggin.dev** | Desarrollo fullstack | Backend, Frontend, DevOps |

Contacto Buggin: contacto@buggin.dev — +58 414 927 4827.

---

## Desarrollo local — quickstart

### Requisitos
- Node.js 20 LTS (recomendado: nvm)
- PostgreSQL 17 local con un superuser (o ajustar permisos)
- Git

### 1) Crear la BD
```bash
# Ejecutar como postgres / superuser
psql -U postgres -c "CREATE USER sh_user WITH PASSWORD 'sh_pass_dev';"
psql -U postgres -c "CREATE DATABASE sh_db OWNER sh_user ENCODING 'UTF8';"
psql -U postgres -d sh_db -c "GRANT ALL ON SCHEMA public TO sh_user;"
```

### 2) Backend
```bash
cd backend
cp .env.example .env          # Editar DATABASE_URL y los JWT_*_SECRET
npm install
npm run migrate               # Aplica las 12 migrations en orden
npm run seed                  # Crea admin inicial — IMPRIME el link de set-password
npm run dev                   # ts-node-dev, http://localhost:3002
```

> El comando `npm run seed` muestra en consola un enlace tipo
> `http://localhost:5173/sh/set-password/<token>`. Copialo, lo necesitaras
> para crear la primera password del superadmin.

### 3) Frontend
```bash
cd frontend
cp .env.example .env          # VITE_API_URL ya apunta a http://localhost:3002
npm install
npm run dev                   # Vite, http://localhost:5173/sh/
```

### 4) Primer login
1. Abre el link de set-password que imprimio el seed (paso 2)
2. Crea una password (>= 8 chars, mayuscula + minuscula + numero)
3. Login en `/sh/login` con `admin@TODO-DOMINIO.com` y la password recien creada
4. En **Configuracion → Usuarios** crea cuentas para recepcion / limpieza / contabilidad

### Build produccion
```bash
cd frontend && npm run build  # genera dist/
cd backend && npm run build   # compila TS a dist/
pm2 start ecosystem.config.cjs
```

### Que esta funcionando ahora (Fase 02 cerrada)
- Login / logout / refresh / set-password / change-password
- 5 roles con guards backend (verifyToken + roleGuard) y frontend (RoleRoute)
- CRUD de usuarios via UI (`/sh/settings/users`) — solo superadmin
- Sidebar adaptativo segun rol con placeholders "Pronto" para Fase 03
- Dark mode + toaster
- Migraciones SQL completas: rooms, bookings, customers, ledger, etc. (los modulos backend se construyen en Fase 03)

---

## Inversion (referencia, propuesta tecnica)

| Concepto | Monto |
|----------|-------|
| Desarrollo MVP (pago unico) | $200 USD |
| Mantenimiento mensual (incluye mejoras) | $15 USD/mes |
| VPS KVM1 (cliente) | €18/mes + IVA |

Plan de pagos por hitos:
- 40% ($80) al firmar y arrancar Fase 01
- 30% ($60) al cierre de Fase 03 (nucleo operativo funcional)
- 30% ($60) al cierre de Fase 05 (despliegue y capacitacion)

---

## Convenciones rapidas

- **Idioma codigo:** ingles para variables/funciones, español para comentarios y docs
- **Commits:** español con prefijo `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`
- **Ramas:** `main` (produccion), `dev` (integracion), `feature/<slug>`, `hotfix/<slug>`
- **Sin emojis en codigo ni docs** salvo peticion explicita
- **Sin ORMs.** SQL directo con `pg`, validacion con Zod en cada endpoint

Para la guia completa: `CLAUDE.md`.

---

## Documentacion de referencia

| Doc | Contenido |
|-----|-----------|
| [Vision del producto](docs/00-vision-producto.md) | Resumen del PDF: que es, para quien, alcance, exclusiones |
| [Esquema BD](docs/01-esquema-base-datos.md) | PostgreSQL: tablas, ENUMs, FKs, indices, RLS |
| [Estructura proyecto](docs/02-estructura-proyecto.md) | Arquitectura modular backend + frontend |
| [Endpoints API](docs/03-api-endpoints.md) | REST por modulo con request/response |
| [Plan de fases](docs/04-plan-fases.md) | 5 fases con tareas, criterios de aceptacion, orden |
| [Decisiones tecnicas](docs/05-decisiones-tecnicas.md) | ADR ligeros: por que TS, Node+Express, Resend, etc. |
| [CLAUDE.md](CLAUDE.md) | Convenciones de codigo y reglas de negocio criticas |
