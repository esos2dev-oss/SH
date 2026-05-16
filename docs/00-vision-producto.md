# 00 — Vision del Producto

> **Fuente:** `Propuesta_SistemaHotelero_Buggin_v3.pdf` (abril 2026, v1.0).
> Este documento es un resumen redactado en mis palabras para servir como ancla de alcance del MVP.

---

## 1. Que es

**Sistema Hotelero (SH)** es una plataforma web responsive (PWA) para que un hotel opere su gestion diaria desde un unico panel. Combina cuatro grandes capacidades:

1. **Operativa hotelera** — habitaciones con estado en tiempo real, reservas/alquileres con calculo automatico, check-in digital de huespedes.
2. **Gestion de huespedes** — registro de clientes con datos personales, historial de estancias y segmentacion para marketing.
3. **ERP contable ligero** — ingresos y egresos con comprobantes adjuntos (imagen/PDF), conciliacion visual y reportes financieros exportables.
4. **Email marketing** — campañas automatizadas por eventos (bienvenida, post-estancia, recuperacion) y promociones con codigos.

No es un PMS comercial (tipo Cloudbeds o Mews). Es una solucion **a medida**, mas barata, sin integraciones con OTAs en el MVP, donde el codigo y los datos son propiedad del cliente.

---

## 2. Para quien

- **Cliente directo:** un hotel/hostal pequeño-mediano que hoy gestiona sus habitaciones con Excel, papel o un sistema obsoleto.
- **Usuarios finales del sistema:**
  - **Administrador/dueño** — vision global, finanzas, configuracion, gestion de usuarios.
  - **Recepcion** — reservas, check-in, cobros, atencion al huesped.
  - **Limpieza** — solo cambia estado de habitaciones (limpia, fuera de servicio).
  - **Contabilidad** — registra ingresos/egresos, sube comprobantes, genera reportes.

Tamaño esperado: 1 hotel, hasta ~50 habitaciones, hasta ~10 usuarios concurrentes. Si en el futuro se necesita multi-hotel, se añadira con un FK `hotel_id` y RLS por hotel — ahora se diseña pensando en ello pero no se implementa multi-tenant.

---

## 3. Que problema resuelve

| Dolor actual del hotel | Solucion en SH |
|------------------------|----------------|
| No saben en tiempo real cuantas habitaciones estan disponibles | Panel con estado actualizado, indicador de % ocupacion, vista por planta |
| Reservas en cuaderno o Excel, errores de doble booking | Validacion automatica de no solapamiento al crear reserva |
| Calculo manual de tarifas y descuentos por temporada | Tarifas configuradas por tipo de habitacion + periodo (dia/semana/mes) + reglas de descuento |
| Comprobantes de pago dispersos en WhatsApp y papel | Subida directa a la operacion, archivado, busqueda |
| Reportes financieros mensuales hechos a mano | Reportes automatizados con export CSV/PDF |
| Sin comunicacion sistematica con clientes | Email marketing por evento, plantillas reutilizables |
| No saben quien hizo que cambio | Audit log con bitacora de acciones |

---

## 4. Alcance del MVP (incluido)

### Modulo: Gestion de habitaciones
- CRUD de tipos de habitacion (sencilla, doble, suite, etc.) con tarifa por dia/semana/mes y capacidad
- CRUD de habitaciones individuales con numero, planta, tipo, estado actual
- Estado en tiempo real: `disponible`, `ocupada`, `limpieza`, `mantenimiento`, `fuera_servicio`
- Indicador global de ocupacion (% del hotel) y vista filtrada por planta o tipo
- Cambio de estado con auditoria automatica

### Modulo: Reservas / alquileres
- Reserva por **dia, semana o mes** con calculo automatico del importe total
- Validacion de no solapamiento de fechas en la misma habitacion
- Aplicacion de descuentos por promocion (codigo) o ajuste manual con justificacion
- Estados: `pendiente`, `confirmada`, `en_curso`, `finalizada`, `cancelada`, `no_show`
- Vista calendario y vista lista con filtros (fecha, estado, cliente, habitacion)

### Modulo: Huespedes
- Registro digital al check-in: nombre, documento de identidad (foto/PDF), contacto, fecha de nacimiento, nacionalidad
- Historial de estancias por cliente: fechas, habitaciones, gastos, observaciones
- Preferencias y notas internas del personal
- Segmentacion automatica: VIP (mas de N estancias), inactivos (90+ dias), cumpleaños del mes

### Modulo: Check-in digital
- Flujo guiado al ingresar el huesped: validar datos, capturar firma opcional, registrar hora
- Pasa la habitacion a `ocupada` automaticamente
- Check-out simetrico: pasa habitacion a `limpieza` y reserva a `finalizada`

### Modulo: ERP — ingresos / egresos
- Registro contable con categorias personalizables por hotel
- Comprobantes adjuntos en imagen o PDF (a R2) por cada egreso
- Conciliacion visual: relacionar pago de reserva con ingreso registrado
- Soporte multi-moneda basico (moneda del hotel configurable)
- Asientos inmutables — correcciones via asiento inverso

### Modulo: Reportes financieros
- Reportes diario, semanal, mensual con totales por categoria
- Comparacion entre periodos
- Export a CSV y PDF

### Modulo: Email marketing
- Plantillas editables con variables (nombre cliente, fechas, etc.)
- Campañas automatizadas por eventos:
  - **bienvenida** — al registrar el cliente
  - **post_estancia** — 24h despues del check-out
  - **fecha_especial** — cumpleaños del cliente
  - **recuperacion** — 90 dias sin estancia
- Metricas basicas: total enviados, abiertos (via webhook Resend)

### Modulo: Promociones
- Codigos de descuento con vigencia (fecha_inicio, fecha_fin)
- Tipo: porcentaje (0-100%) o monto fijo
- Reglas en JSON: minimo de noches, tipo de habitacion, dias de la semana
- Limite de usos opcional

### Modulo: Multiusuario + roles
- 5 roles: superadmin, admin, recepcion, limpieza, contabilidad
- Solo el superadmin crea/desactiva usuarios
- Cada rol ve solo lo que necesita (RLS + filtros UI)

### Modulo: Audit log
- Bitacora de quien hizo que y cuando
- Acciones registradas: login, cambios de rol, cambios de estado de habitacion, creacion/cancelacion de reservas, ediciones de ledger, subidas/borrados de comprobantes
- Solo admin/superadmin acceden al log

### Estandares transversales
- TypeScript estricto end-to-end
- Row Level Security activo en tablas sensibles
- CI/CD con validacion antes de produccion
- Backups diarios automatizados, retencion 14 dias
- Sentry para errores en produccion
- Logs estructurados con pino

---

## 5. Fuera del alcance del MVP

> Cualquiera de estos puntos se puede añadir mas adelante via plan de mantenimiento mensual o cotizacion separada.

- App movil nativa iOS/Android publicada en stores (el MVP es web responsive / PWA)
- Integraciones con OTAs (Booking.com, Airbnb, Expedia, etc.)
- Pasarela de pago en linea (Stripe, MercadoPago) — los pagos se registran manualmente en el MVP
- Multi-hotel / multi-tenant — diseñado para añadirse despues, no se implementa ahora
- Migracion masiva de datos historicos desde otro sistema
- Facturacion electronica con autoridades fiscales (SUNAT, AEAT, etc.)
- Channel manager / sync de inventario con OTAs
- Modulo de housekeeping avanzado (ordenes de tareas, inventario de minibar, etc.)
- Modulo de point-of-sale para restaurante o bar del hotel
- Reservas online publicas (motor de booking en web del hotel)
- Reportes BI avanzados / dashboards configurables por usuario
- IA / ML (prediccion de ocupacion, pricing dinamico, deteccion de fraude)
- Constitucion legal del negocio, contratos, asesoria fiscal
- Campañas de marketing pagadas, diseño de marca, produccion de contenido

---

## 6. Restricciones y supuestos

### Restricciones
- **Presupuesto:** USD 200 desarrollo MVP, $15/mes mantenimiento — el alcance esta calibrado para ese presupuesto
- **Plazo:** 2-3 semanas de desarrollo (depende tambien de disponibilidad del cliente para validar Discovery)
- **Infraestructura:** un solo VPS KVM1 de €18/mes — no se contempla cluster, balanceo de carga ni alta disponibilidad
- **Equipo:** un desarrollador fullstack (Buggin.dev). No hay diseñador dedicado, no hay tester dedicado

### Supuestos
- El cliente entrega informacion del hotel (tipos de habitacion, tarifas, listado inicial de habitaciones, datos de marca) a tiempo en Fase 01
- El hotel tiene conexion a internet estable — el MVP requiere conectividad para funcionar
- Los usuarios del hotel tienen un nivel basico de manejo de aplicaciones web (recepcion, contabilidad)
- Idioma de la UI: español neutro
- Moneda principal: configurable, una sola por hotel (no multi-moneda en interfaz)

---

## 7. Criterios de exito del MVP

El MVP se considera exitoso si al cierre de Fase 05:

1. El recepcionista puede crear una reserva, hacer check-in y check-out completos sin intervencion del desarrollador
2. El admin/dueño ve la ocupacion en tiempo real y puede generar el reporte financiero del mes
3. El contador registra ingresos y egresos con comprobantes adjuntos sin errores
4. El sistema envia automaticamente al menos 3 tipos de campañas por evento (bienvenida, post-estancia, recuperacion)
5. Los 5 roles funcionan correctamente con sus restricciones
6. El backup diario esta funcionando y se ha probado al menos un restore
7. Sentry esta capturando errores en produccion
8. La documentacion para el personal del hotel esta entregada

---

## 8. Vision a 12 meses (post-MVP)

Lo que probablemente venga despues, vendido como mejoras incluidas en el plan mensual o como cotizaciones aparte:

- Pasarela de pago integrada (Stripe / MercadoPago) — esperado en mes 2-3
- Reservas online publicas (motor en web del hotel) — esperado en mes 4-6
- Integracion con Booking.com via channel manager — cotizacion aparte
- App movil PWA instalable con notificaciones push — incluida en mantenimiento
- Multi-hotel para cadenas pequeñas — cotizacion aparte
- Reportes BI con dashboards personalizables — incluido en mantenimiento

Estas evoluciones se documentan en su propio ADR cuando se decidan.
