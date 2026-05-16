# 05 — Decisiones Tecnicas (ADR ligero)

> Registro de decisiones tecnicas tomadas en planificacion del MVP.
> Formato: contexto → opciones → decision → consecuencias.
> Cada ADR se numera secuencialmente y queda fijado salvo cambio explicito documentado en una nueva entrada.

---

## ADR-001 — Backend: Node.js + Express + PostgreSQL + TypeScript (NO BaaS)

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Contexto
La propuesta tecnica menciona "BaaS gestionado" en la tabla de stack pero tambien describe arquitectura tradicional (PostgreSQL + RLS, autenticacion propia, hosting VPS KVM1). Hay que decidir entre:
- BaaS tipo Supabase / Pocketbase / Appwrite
- Stack tradicional Node + Express + Postgres

### Opciones consideradas

| Opcion | Pro | Contra |
|--------|-----|--------|
| **Supabase** | Auth + storage + realtime listo. Velocidad de MVP. RLS nativo | Vendor lock-in. Coste mensual sobre el plan free al crecer. La propuesta promete "codigo y datos son propiedad del cliente" — auto-hosting Supabase es complejo |
| **Pocketbase** | Self-hosted, simple, embebido | Menos maduro para ERP. SQLite por defecto |
| **Appwrite** | Self-hosted, completo | Stack mas pesado, requiere Docker Compose, mas piezas que mantener |
| **Node + Express + PG** | Control total, mismo patron del CRM existente del cliente, conocimiento propio del equipo, sin vendor lock-in | Mas codigo que escribir (auth, RLS manual, presigned URLs) |

### Decision
**Node.js 20 + Express + PostgreSQL 17 + TypeScript estricto, con `pg` directo (sin ORM).**

### Razones
1. **Continuidad con el CRM** — el patron modular ya existe y funciona, reutilizable casi por completo.
2. **Propiedad real del codigo** — la propuesta vende como ventaja diferencial que el cliente es dueño del codigo y datos. BaaS aleja eso.
3. **VPS unico €18/mes** — Postgres + Node corren comodos en un KVM1; añadir un BaaS fuerza a tener mas dependencias o a self-hostear el BaaS, lo cual contradice "MVP estable a coste operativo bajo".
4. **Auth + RLS suficientes con Postgres nativo** — la propuesta menciona "Auth + RLS" como capa, no a Supabase Auth especificamente. Politicas RLS de Postgres + JWT propio son suficientes.
5. **TypeScript estricto** — la propuesta lo exige. Aplica end-to-end (frontend y backend) y sustituye al beneficio de tipos auto-generados de un BaaS.

### Consecuencias
- Mas codigo que mantener (~500 LOC de auth + middleware vs ~50 con BaaS)
- Necesidad de cron jobs propios (no hay edge functions) — `node-cron` lo resuelve
- Compensacion: cero coste mensual extra, control total, deploy a un solo VPS

### Alternativas que reabren esta decision
Si el cliente pide en el futuro: realtime al estilo PubSub fuerte, multi-region, o se llega a 5+ hoteles con scaling, podriamos revisar Supabase con plan pago o introducir Redis + websockets.

---

## ADR-002 — TypeScript estricto end-to-end

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Contexto
La propuesta exige "tipado estricto end-to-end". El CRM actual del cliente esta en JavaScript sin TS. Hay que decidir si SH continua con JS (consistencia con CRM) o adopta TS.

### Decision
**TypeScript en `strict: true` tanto en backend como frontend.**

### Razones
1. La propuesta lo dice explicitamente como ventaja vendida al cliente.
2. El dominio hotelero tiene mas calculos sensibles (importes, fechas, estados con maquina de estados clara) que el CRM — los tipos pagan dividendos.
3. Zod ya se usa para validacion runtime — `z.infer<typeof schema>` da tipos derivados gratis.
4. La curva de aprendizaje es minima para alguien que ya escribe JavaScript con buena disciplina.

### Consecuencias
- Build step adicional (tsc) — gestionado con `ts-node-dev` en dev y `tsc` en build
- Mas archivos `*.types.ts` por modulo — vale la pena
- `tsconfig.json` con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — capturar bugs antes

---

## ADR-003 — Sin ORM, queries SQL directas con `pg`

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Contexto
TypeScript suele venir con ORMs populares: Prisma, Drizzle, Kysely, TypeORM.

### Decision
**`pg` directo, sin ORM. Queries SQL escritas a mano. Tipos TS para filas mantenidos manualmente o derivados de Zod.**

### Razones
1. Patron heredado del CRM — funciona, equipo lo conoce.
2. Postgres avanzado (`EXCLUDE` constraints, RLS, JSONB, CTEs, ventanas) se aprovecha mejor sin abstraccion intermedia.
3. Migraciones SQL planas y revisables — sin "magia" de migraciones generadas.
4. Cero deps de ORM — menos vulnerabilidades, menos breaking changes en npm audit.
5. Drizzle/Kysely serian las opciones menos malas si quisieramos query builder, pero el dolor que evitan no compensa la complejidad añadida en un MVP.

### Consecuencias
- Hay que tipar manualmente las filas devueltas (`db.query<RoomRow>(...)`)
- Riesgo de SQL injection si alguien usa string interpolation en vez de parametros — mitigado con linter rule + revisiones
- Si cambia el schema, hay que actualizar SQL y tipos a la vez — disciplina necesaria

### Notas
- Considerar `kysely` solo si en el futuro la cantidad de queries crece a un punto en que el SQL crudo sea ingobernable

---

## ADR-004 — Email transaccional: Resend

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Contexto
La propuesta menciona "Resend / Postmark u otro proveedor". El CRM usa Brevo. Hay que elegir uno para el SH.

### Opciones

| Opcion | Free tier | Costo escalado | DX |
|--------|-----------|----------------|-----|
| **Resend** | 100/dia, 3000/mes | $20/mes para 50k | API minimalista, JSX templates |
| **Postmark** | 100 trial | $15/mes para 10k | Foco en transaccional, latencia muy baja |
| **Brevo** | 300/dia | $25/mes para 20k | UI mas marketing-friendly |
| **AWS SES** | Casi gratis | $0.10 por 1k | Setup tedioso, requiere out-of-sandbox |

### Decision
**Resend.**

### Razones
1. La propuesta lo menciona explicitamente primero.
2. API minimalista (`resend.emails.send({...})`) — facil de integrar con TS.
3. Webhook signing con HMAC para sync de estados — robusto.
4. Verificacion de dominio simple (DNS records).
5. Free tier suficiente para volumenes de un solo hotel (<100 emails/dia esperado).

### Consecuencias
- Lock-in moderado en SDK de Resend — mitigable con `email.service.ts` que abstrae el provider
- Si se necesita >3000 emails/mes en plan free, costara ~$20/mes — coste de exito

---

## ADR-005 — Storage de archivos: Cloudflare R2

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Contexto
Necesitamos storage para fotos de habitaciones, comprobantes de ledger, documentos y firmas de check-in.

### Decision
**Cloudflare R2** con SDK `@aws-sdk/client-s3` (R2 es S3-compatible).

### Razones
1. CRM actual ya usa R2 — credenciales y workflow conocidos.
2. **Cero egress cost** vs S3 (gran ventaja a largo plazo).
3. $0.015/GB/mes — competitivo.
4. Compatible S3 → no hay lock-in real.

### Consecuencias
- Misma cuenta de Cloudflare puede gestionar SH y CRM con buckets separados (`sh-prod`, `crm-prod`).
- Pre-signed URLs con TTL 15 min para visualizacion privada (heredado del CRM).

---

## ADR-006 — Frontend: shadcn/ui + Tailwind + fetch nativo

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Contexto
Stack frontend con multiples opciones razonables (MUI, Mantine, Chakra, shadcn/ui).

### Decision
**shadcn/ui con Tailwind CSS, primitivas Radix, fetch nativo del navegador (no axios).**

### Razones
1. Mismo stack que el CRM — aprendizaje cero para el equipo.
2. shadcn/ui no es libreria, es codigo copiado a tu repo — control total para customizar.
3. Tailwind permite ajuste fino sin escribir CSS.
4. fetch nativo + interceptor manual = 0 deps de HTTP, sin vulnerabilidades, ya probado en el CRM (ver `frontend/src/shared/api/client.js` del CRM como referencia portable a TS).
5. Recharts para graficas, react-day-picker (incluido en shadcn calendar) para fechas.

### Consecuencias
- Hay que escribir mas codigo para cosas que MUI/Antd dan listas (DataGrid avanzada, etc.) — la simplicidad del MVP no la necesita.
- Migraciones de shadcn requieren regenerar componentes con la CLI cuando hay updates — manejable.

---

## ADR-007 — Auth: JWT propio (access 15min + refresh 7 dias httpOnly)

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Contexto
Patrones comunes: JWT propio, sesiones server-side con cookies, NextAuth, Auth0/Clerk.

### Decision
**JWT propio.** Access token 15 min en `Authorization: Bearer`. Refresh token 7 dias en cookie httpOnly + Secure + SameSite=Strict. Refresh tokens hasheados en `user_sessions` (revocables).

### Razones
1. Patron del CRM, ya validado.
2. No queremos depender de Auth0/Clerk (coste + lock-in) en un proyecto de $200.
3. NextAuth requiere Next.js — usamos React + Vite plain.
4. Sesiones server-side con cookies son tambien validas pero JWT con `user_sessions` ya nos da revocacion sin pegar a la BD en cada request.

### Consecuencias
- Hay que rotar `JWT_REFRESH_SECRET` ocasionalmente (politica del cliente).
- Logout debe revocar el `refresh_token_hash` en BD.

### Notas de seguridad
- bcrypt cost 12 (heredado del CRM)
- Cookie SameSite=Strict bloquea CSRF; añadimos token CSRF en endpoints sensibles si surge necesidad.
- Rate limit de 5 intentos / 15min en `/auth/login` por IP.

---

## ADR-008 — Logger: pino con request-id

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Decision
`pino` con `pino-http` para middleware. Cada request lleva un `X-Request-ID` (UUID) propagado en logs. En produccion, output JSON a stdout (PM2 captura) y se rota cada 100 MB.

### Razones
- Mas rapido que Winston, output JSON estructurado.
- Misma libreria que el CRM, transferible.

---

## ADR-009 — Monitoreo: Sentry para errores, sin APM

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Decision
Sentry para captura de errores en backend y frontend. Sin Datadog/New Relic.

### Razones
- Sentry tiene tier gratis suficiente para un solo proyecto.
- Para 1 hotel + 10 usuarios concurrentes, no se justifica APM.
- Los logs estructurados de pino + Sentry cubren el 95% de los casos.

### Consecuencias
- Si en el futuro se necesita ver latencias de endpoints o queries lentas, añadir `pg-stat-statements` en Postgres y Sentry Performance.

---

## ADR-010 — Cron jobs: `node-cron` en proceso, sin Redis ni BullMQ

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Decision
`node-cron` ejecutandose dentro del proceso PM2 principal (instancia unica, no cluster). Cron jobs:
- Email events (post-estancia, cumpleaños, recuperacion)
- Cleanup de `user_sessions` expiradas
- Snapshot de occupancy diario

### Razones
- Volumen pequeño (centenas de emails/dia max).
- Una sola instancia → no hay riesgo de doble ejecucion.
- Añadir Redis + BullMQ duplicaria piezas a operar para nada.

### Consecuencias
- Si en el futuro vamos a multi-instancia (load balanced) hay que migrar a BullMQ + Redis o usar `pg_cron`. Un solo VPS no requiere esto.
- Si un job se cae mientras se ejecuta, no hay reintento automatico — los jobs son idempotentes (controlados por flags en BD).

---

## ADR-011 — Migraciones: SQL plano numerado, sin libreria

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Decision
Archivos `001_<nombre>.sql`, `002_<nombre>.sql`, etc. en `backend/migrations/`. Un script `npm run migrate` aplica los pendientes registrados en una tabla `_migrations` propia.

### Razones
- Cero deps. Patron del CRM. SQL es revisable a simple vista.
- No necesitamos rollback automatico — para rollback se escribe un archivo nuevo.

### Consecuencias
- El equipo es responsable de no editar migraciones ya aplicadas.
- Si alguien necesita Knex migrate / node-pg-migrate por preferencia, se valora — pero el patron actual del CRM es suficiente.

---

## ADR-012 — Validacion: Zod en backend y frontend

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Decision
Zod en cada endpoint backend para `body`/`query`/`params`. Mismas schemas reusadas en frontend con react-hook-form + `@hookform/resolvers/zod` cuando aplique.

### Razones
- Tipos derivados gratis (`z.infer<>`).
- Mensajes de error en español personalizables.
- Reutilizable en cliente y servidor (paquetes compartidos en futuro si crece).

### Consecuencias
- En endpoints con archivos (multipart) Zod no valida bytes — usamos validacion manual + magic bytes con `file-type` para mime real.

---

## ADR-013 — Hosting: VPS unico, single instance

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Decision
**VPS KVM1 unico** (€18/mes + IVA). Ubuntu LTS + Nginx + PM2 + Postgres local + R2 externo + Sentry SaaS.

### Razones
- Volumen real: 1 hotel, ~10 usuarios, ~50 habitaciones, ~3000 reservas/año, ~100k emails/año = perfectamente manejable en un KVM1.
- La propuesta especifica explicitamente este hosting.
- Coste predecible.

### Consecuencias
- Si el VPS cae, la app cae. Mitigacion: backups diarios + Sentry alerts.
- Si crece a multi-hotel necesitaremos otro plan — fuera del MVP.

---

## ADR-014 — RLS por rol, sin multi-tenancy en MVP

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Decision
RLS activo en Postgres. Politicas por rol del usuario (superadmin, admin, recepcion, limpieza, contabilidad). **No** se incluye `hotel_id` en MVP — se asume un solo hotel por instalacion.

### Razones
- MVP es 1 hotel.
- Añadir multi-tenancy ahora añade complejidad sin beneficio inmediato.

### Como migrar a multi-hotel cuando haga falta
- Añadir tabla `hotels` y FK `hotel_id` en `rooms`, `bookings`, `customers`, `ledger_entries`, `users`
- Añadir politica RLS adicional `current_user_hotel_id() = hotel_id`
- Migration retroactiva con `hotel_id = 1` para datos existentes

---

## ADR-015 — Idioma: español neutro en UI; codigo en ingles

**Fecha:** 2026-05-09
**Estado:** Aceptado

### Decision
- UI 100% en español neutro (sin "vosotros" ni "ustedes" forzado).
- Codigo: variables, funciones, types, archivos en ingles.
- Comentarios y commits en español.
- Logs en ingles (estructurados con campos en ingles).

### Razones
- El cliente y los usuarios finales son hispanohablantes.
- El codigo en ingles es mas universal para futura participacion de otros devs y mejor compatibilidad con linters/keywords.

### Consecuencias
- Algunos campos de BD estan en español (`nombre`, `apellidos`, `descripcion`) — heredados del CRM, mantenemos consistencia. La proxima generacion de tablas si se añade puede valorar pasar todo a ingles.

---

## Decisiones diferidas (no se toman en MVP)

| Tema | Cuando decidir |
|------|----------------|
| Multi-tenancy real (multi-hotel) | Cuando el cliente pida onboarding de un segundo hotel |
| Pasarela de pago Stripe/MercadoPago | Mes 2-3 post-launch, segun pedido del cliente |
| App movil PWA con push notifications | Cuando el personal pida usar el sistema en movil habitualmente |
| Reservas online publicas (booking engine) | Cuando el hotel quiera vender directo desde su web |
| Integracion con OTAs (channel manager) | Solo si el cliente lo pide explicitamente y se cotiza aparte |
| Analytics avanzado (BI dashboards) | Cuando el volumen de datos lo justifique (>1 año de operacion) |
| IA (predictive pricing, score IA, deteccion fraude) | Fase 3 del producto, cuando tengamos historico |
