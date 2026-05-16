# 04 — Plan de Fases

> 5 fases secuenciales segun la propuesta tecnica.
> Duracion estimada total: 2–3 semanas calendario.
> Cada fase tiene tareas concretas, criterios de aceptacion verificables y orden de implementacion.

---

## Vista global

| Fase | Nombre | Duracion | % inversion | Hito de pago |
|------|--------|----------|-------------|--------------|
| 01 | Discovery & Diseño | 2 dias | 15% ($30) | — |
| 02 | Setup & Arquitectura | 1 dia | 10% ($20) | Anticipo 40% al firmar |
| 03 | Nucleo Operativo | 5–7 dias | 35% ($70) | Hito 2: 30% al cierre |
| 04 | ERP & Marketing | 4–5 dias | 25% ($50) | — |
| 05 | QA & Despliegue | 2 dias | 15% ($30) | Hito 3: 30% al cierre |

---

## Fase 01 — Discovery & Diseño (2 dias)

### Objetivo
Validar alcance, capturar informacion del hotel y entregar un prototipo navegable + esquema BD aprobado.

### Tareas

| # | Tarea | Quien | Salida |
|---|-------|-------|--------|
| 1.1 | Reunion kickoff con cliente: confirmar alcance, identidad de marca, moneda, idioma, datos del hotel | Buggin + cliente | Acta de reunion |
| 1.2 | Recolectar listado real de habitaciones, tipos, tarifas, fotos disponibles | Cliente | CSV/foto |
| 1.3 | Definir politica de cancelacion, horas de check-in/check-out, reglas de promocion habituales | Cliente | Documento de politicas |
| 1.4 | Validar el schema BD de `docs/01-esquema-base-datos.md` con el cliente. Ajustar si surge algo del dominio | Buggin | Schema final aprobado |
| 1.5 | Validar lista de modulos y endpoints (`docs/02`, `docs/03`) con el cliente | Buggin | Confirmacion |
| 1.6 | Diseñar mockups de las 5 pantallas criticas (Dashboard ocupacion, Lista reservas, Calendario, Check-in, ERP) en Figma o herramienta equivalente | Buggin | Figma URL |
| 1.7 | Confirmar paleta y tipografia de marca (basico — admin del hotel decide colores) | Buggin + cliente | Tokens en `docs/06` (creado en fase 04) |
| 1.8 | Entregar para revision: prototipo navegable + schema + flujos | Buggin | Deliverable |

### Criterios de aceptacion

- [ ] Cliente firma alcance MVP por escrito (whatsapp/email vale)
- [ ] Cliente entrega listado de habitaciones reales o acuerda usar datos demo para empezar
- [ ] Schema BD aprobado (sin nuevos modulos imprevistos)
- [ ] Prototipo Figma con flujo: login → dashboard → reservas → check-in → ledger
- [ ] Acceso al canal de WhatsApp para validaciones rapidas activado

### Salidas concretas
- `docs/00-vision-producto.md` actualizado con datos reales del hotel
- `docs/01-esquema-base-datos.md` validado
- Link Figma con mockups
- Anticipo del 40% ($80) cobrado para arrancar Fase 02

---

## Fase 02 — Setup & Arquitectura (1 dia)

### Objetivo
Tener el proyecto base corriendo: backend + frontend + BD + auth multiusuario funcional + entorno de preview accesible.

### Tareas

| # | Tarea | Salida |
|---|-------|--------|
| 2.1 | `git init`, primer commit, repo en GitHub privado | repo URL |
| 2.2 | Scaffolding backend: TS, Express, pg, Zod, pino, vitest, dotenv | `backend/` con `npm run dev` funcional |
| 2.3 | Scaffolding frontend: Vite + React + TS + Tailwind + shadcn/ui init | `frontend/` con `npm run dev` y un Hello World |
| 2.4 | Crear PostgreSQL local (db `sh_db`, usuario `sh_user`) | Conexion verificada |
| 2.5 | Aplicar migraciones 001–012 (estructura, ENUMs, RLS, triggers) | Tablas creadas, verificadas con `\dt` |
| 2.6 | Aplicar seeds (admin inicial, room_types base, ledger_categories, email_templates, settings) | Login funcional |
| 2.7 | Implementar modulo `auth` completo: login, logout, refresh, set-password | Endpoints probados con Postman/Insomnia |
| 2.8 | Implementar modulo `users` minimo: GET /me, GET /users (SA), PATCH /users/:id | Endpoints probados |
| 2.9 | Implementar middlewares: verifyToken, roleGuard, errorHandler, requestId, rateLimit en login | Tests basicos |
| 2.10 | Frontend: AuthContext, AuthLayout, AppLayout, Sidebar, LoginPage, SetPasswordPage, ProtectedRoute, RoleRoute | Login + sidebar visible |
| 2.11 | Configurar VPS preview: Nginx + PM2 + Postgres + .env produccion + backup cron | URL preview accesible |
| 2.12 | Pipeline CI/CD basico: GitHub Actions deploy via SSH al cierre de cada fase | Action verde |
| 2.13 | Sentry conectado (backend + frontend) | Evento de prueba capturado |

### Criterios de aceptacion

- [ ] `npm run dev` corre backend y frontend sin errores
- [ ] `npm run migrate` aplica todas las migraciones desde cero
- [ ] El admin inicial puede hacer login con contraseña temporal
- [ ] El admin puede invitar a otro usuario (via API por ahora)
- [ ] El layout autenticado se ve con sidebar y rutas protegidas
- [ ] La URL del entorno de preview esta documentada y accesible
- [ ] Sentry recibe eventos de prueba

### Salidas concretas
- Repo Git con tags `v0.1-setup`
- URL preview: `https://<vps-ip>/sh/`
- Credenciales del admin inicial entregadas al cliente

---

## Fase 03 — Nucleo Operativo (5–7 dias)

### Objetivo
Operar el hotel: gestionar habitaciones, reservas, clientes, hacer check-in/check-out. Esta es la fase mas grande del MVP.

### Subfases

#### 3.1 Habitaciones (1.5 dias)
- Backend: modulos `room-types` y `rooms` completos (CRUD + endpoint `/occupancy`)
- Frontend: paginas `RoomTypesPage`, `RoomsPage` con grid + filtros + dialog crear/editar
- Cambio de estado por habitacion (badge clickeable con dropdown segun rol)
- Componente `RoomCard` reutilizable + `RoomStatusBadge`
- Indicador global de ocupacion en Dashboard (placeholder, integrado en 3.5)

#### 3.2 Clientes (1 dia)
- Backend: modulo `customers` completo + endpoint `/timeline`
- Frontend: `CustomersPage` (tabla + filtros + segmentos), `CustomerDetailPage` (tabs: info, historial, emails)
- Form Zod compartida (frontend y backend)

#### 3.3 Reservas (2 dias)
- Backend: modulo `bookings` completo
  - Calculo automatico de importe en transaccion
  - Validacion de no solapamiento (ademas del constraint EXCLUDE)
  - Endpoint `/availability` para chequear disponibilidad antes de crear
  - Endpoint `/calendar` para vista calendario
  - Estados (`confirm`, `cancel`, `no-show`) en transaccion + audit
- Backend: modulo `booking-payments` (creacion + sync con ledger)
- Frontend: `BookingsPage` (lista + filtros), `BookingsCalendarPage` (mes/semana con react-day-picker custom)
- Frontend: `BookingFormDialog` con steps (cliente → habitacion → fechas → resumen + promo code)
- Frontend: `BookingDetailPage` con tabs (info, pagos, check-in)

#### 3.4 Check-in / Check-out (1 dia)
- Backend: modulo `check-ins` completo + upload R2 (documento, firma)
- Frontend: `CheckInPage` flow guiado: validar booking → captura firma con `react-signature-canvas` → upload doc → confirmar
- Frontend: boton check-out desde detalle de booking

#### 3.5 Dashboard de ocupacion (0.5 dia)
- KPIs: % ocupacion actual, reservas hoy, ingresos del dia, alertas (limpieza pendiente, no-shows)
- Grafica de ocupacion por planta (Recharts)
- Lista de proximos check-ins/check-outs

### Criterios de aceptacion

- [ ] Recepcion crea reserva con calculo automatico correcto (verificado manual)
- [ ] El sistema rechaza reservas que pisen otra reserva activa en la misma habitacion
- [ ] Promotion code valido aplica descuento; invalido rechaza con mensaje claro
- [ ] Check-in marca habitacion `ocupada`; check-out marca `limpieza`
- [ ] Limpieza puede pasar habitacion de `limpieza` → `disponible` (y solo eso)
- [ ] Dashboard muestra ocupacion actualizada en tiempo real (refresh manual basta)
- [ ] Cliente registrado tiene historial visible al volver
- [ ] Roles funcionan: contabilidad NO puede crear reservas, limpieza NO ve clientes

### Demo de cierre
- Recepcion crea cliente + reserva + check-in en vivo con el cliente mirando
- Habitacion cambia de estado correctamente
- Hito de pago: 30% ($60) al cierre

---

## Fase 04 — ERP & Marketing (4–5 dias)

### Objetivo
Cerrar el ciclo financiero (ingresos/egresos con comprobantes, reportes), automatizar comunicacion (email marketing por eventos) y promociones.

### Subfases

#### 4.1 ERP — Ledger + Recibos (1.5 dias)
- Backend: modulos `ledger`, `ledger-categories`, `receipts` completos
- Backend: endpoint `/ledger/summary` con agregaciones por categoria/dia/semana/mes
- Frontend: `LedgerPage` con tabla + filtros + KPIs arriba
- Frontend: `LedgerNewPage` o dialog con upload de comprobante en mismo flujo (multipart)
- Frontend: vista de detalle de entry con receipts adjuntos (presigned URL)

#### 4.2 Reportes financieros (1 dia)
- Backend: endpoints `/reports/financial`, `/reports/financial.csv`, `/reports/financial.pdf` (libreria pdfkit)
- Backend: `/reports/occupancy`, `/reports/customers`
- Frontend: `ReportsPage` con selector de periodo + grafica (Recharts barras + linea) + boton export
- Comparacion entre periodos (ej: "este mes vs mes pasado")

#### 4.3 Promociones (1 dia)
- Backend: modulo `promotions` completo + endpoint `/validate`
- Frontend: `PromotionsPage` (lista + form con `condiciones` builder)
- Integracion en `BookingFormDialog`: input de codigo → validacion → aplicar descuento

#### 4.4 Email Marketing (1.5 dias)
- Backend: modulo `email-templates` y `email-campaigns` completos
- Backend: integracion con Resend (send + webhook delivered/opened/bounced)
- Backend: cron jobs en `jobs/`:
  - `bienvenida` — al crear customer, se dispara inmediato
  - `post-estancia` — cron horario, busca check-outs hace 24h
  - `cumpleanios` — cron diario 09:00, busca cumpleaños del dia
  - `recuperacion` — cron diario, busca customers con 90+ dias sin estancia
- Frontend: `EmailTemplatesPage` con editor (Mustache + preview)
- Frontend: `CampaignsPage` con lista + crear campaña manual con segmento + stats

#### 4.5 Audit log (0.5 dia)
- Backend: modulo `audit-log` (los services ya escriben durante 03 y 04)
- Frontend: `AuditLogPage` con tabla + filtros + dialog con before/after JSON

### Criterios de aceptacion

- [ ] Contabilidad registra egreso con comprobante PDF; el comprobante es accesible
- [ ] Reporte mensual muestra ingresos/egresos correctos vs base de datos
- [ ] Export PDF y CSV abren correctamente en Excel y lectores PDF
- [ ] Email de bienvenida llega al crear un customer real
- [ ] Email post-estancia se envia 24h despues del check-out (verificado en preview)
- [ ] Promo code aplica descuento correcto al crear reserva
- [ ] Audit log muestra entradas reales por las acciones hechas en demo
- [ ] Webhook Resend actualiza estado de `email_logs` (delivered/opened)

### Demo de cierre
- Contador registra 3 egresos + un ingreso, sube comprobantes, genera reporte mensual y lo exporta
- Admin crea promocion, recepcion la usa en una reserva
- Email de bienvenida visible en bandeja del cliente de prueba

---

## Fase 05 — QA & Despliegue (2 dias)

### Objetivo
Pruebas integrales, deploy productivo en VPS, capacitacion al personal y entrega de documentacion.

### Tareas

#### 5.1 QA integral (0.75 dia)
- Tests E2E manuales con checklist por rol (5 roles × 3-5 acciones criticas cada uno)
- Test de carga basico: 100 reservas concurrentes (con autocannon o k6)
- Verificacion de RLS: usuario con rol `limpieza` solo ve lo que debe
- Auditoria de seguridad basica: helmet activo, CORS estricto, rate limit funcional, secrets en .env
- Verificacion de backups: ejecutar restore de un backup en BD de prueba
- Verificacion de Sentry: forzar un error y validar que llega

#### 5.2 Despliegue produccion (0.5 dia)
- Apuntar dominio o IP del VPS productivo
- HTTPS con Let's Encrypt (certbot)
- PM2 con `ecosystem.config.cjs` y autostart en boot
- Cron job de backup: `pg_dump` diario 03:00 + retencion 14 dias + verificacion size > 0
- Cron job de cleanup: borrar `user_sessions` expiradas semanalmente
- Migrar BD productiva con `npm run migrate` y `npm run seed`
- Crear superadmin real del cliente

#### 5.3 Capacitacion al personal (0.5 dia)
- Reunion con cada rol (recepcion, limpieza, contabilidad) — 30 min cada una
- Walkthrough en vivo con datos reales del hotel
- Resolver preguntas del personal
- Grabar la sesion (con permiso) para futura referencia

#### 5.4 Documentacion final (0.25 dia)
- Manual de usuario por rol (PDF, ~10 paginas):
  - Rol superadmin/admin
  - Rol recepcion
  - Rol limpieza
  - Rol contabilidad
- Procedimiento de recuperacion: restore desde backup, reiniciar PM2, etc.
- README final con datos del entorno productivo (IP, credenciales en gestor de secretos del cliente)

### Criterios de aceptacion

- [ ] Sistema accesible en URL productiva con HTTPS
- [ ] Los 5 roles probados con checklist completo, sin bugs criticos
- [ ] Backup diario funcionando + un restore probado
- [ ] Sentry capturando errores en produccion
- [ ] Personal del hotel capacitado y manuales entregados
- [ ] Cliente confirma que puede operar autonomamente
- [ ] Pago final del 30% ($60) cobrado

### Salidas concretas
- URL productiva con HTTPS
- 4 manuales PDF en `docs/manuales/`
- Documento de procedimientos de operacion en `docs/06-operacion.md`
- Tag git `v1.0.0`
- 14 dias de soporte post-deploy con bug fixes incluidos comienzan a contar

---

## Riesgos identificados y mitigacion

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|--------------|---------|------------|
| Cliente no entrega listado real de habitaciones | Media | Alto retraso | Arrancar con datos demo, importar al final |
| Cliente añade scope durante desarrollo | Alta | Retraso/sobrecoste | Documentar scope en Fase 01 firmado, plan mensual cubre cambios menores |
| Resend bloquea por reputacion del dominio | Baja | Alto | Configurar SPF/DKIM en Fase 02, verificar dominio en Resend |
| RLS mal configurado deja exposicion | Media | Critico | Tests dedicados de RLS por rol en Fase 05 |
| Backup nunca se prueba y un dia falla | Media | Critico | Restore manual obligatorio en Fase 05 |
| Constraint EXCLUDE de bookings da falsos positivos | Baja | Medio | Tests con casos limite (timezone, microsegundos) en Fase 03 |
| Cron de email-events falla silenciosamente | Media | Medio | Logs estructurados + alerta Sentry si no se ejecuta |

---

## Orden de implementacion sugerido (cronologico)

```
Dia 1-2  | Fase 01 — Discovery
Dia 3    | Fase 02 — Setup
Dia 4-5  | Fase 03.1 — Habitaciones + 03.2 Clientes
Dia 6-7  | Fase 03.3 — Reservas
Dia 8    | Fase 03.4 — Check-in/Check-out
Dia 9    | Fase 03.5 — Dashboard + buffer
Dia 10-11| Fase 04.1 ERP + 04.2 Reportes
Dia 12   | Fase 04.3 Promociones
Dia 13-14| Fase 04.4 Email + 04.5 Audit
Dia 15   | Fase 05.1 QA + 05.2 Deploy
Dia 16   | Fase 05.3 Capacitacion + 05.4 Docs
```

15-16 dias laborables = ~3 semanas calendario (incluyendo idas y vueltas con cliente).

---

## Comunicacion durante el proyecto (segun propuesta)

- Reuniones de avance semanales (30 min)
- Demo funcional al cierre de cada fase
- Entorno preview accesible desde Fase 02
- Canal directo WhatsApp para validaciones rapidas
