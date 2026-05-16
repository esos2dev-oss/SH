# 03 — Endpoints REST API

> Referencia completa de la API REST del Sistema Hotelero.
> Base URL: `/sh/api` (Nginx redirige al puerto 3002 del backend).

---

## Tabla de contenidos

1. [Convenciones generales](#convenciones-generales)
2. [Health](#health)
3. [Auth](#auth)
4. [Users](#users)
5. [Rooms](#rooms)
6. [Room Types](#room-types)
7. [Customers](#customers)
8. [Bookings](#bookings)
9. [Booking Payments](#booking-payments)
10. [Check-Ins](#check-ins)
11. [Ledger](#ledger)
12. [Ledger Categories](#ledger-categories)
13. [Receipts](#receipts)
14. [Reports](#reports)
15. [Promotions](#promotions)
16. [Email Templates](#email-templates)
17. [Email Campaigns](#email-campaigns)
18. [Audit Log](#audit-log)
19. [Settings](#settings)
20. [Webhooks](#webhooks)

---

## Convenciones generales

### Base URL y puertos

| Entorno | URL del frontend | URL del API |
|---------|------------------|-------------|
| Local | `http://localhost:5173/sh/` | `http://localhost:3002/api/*` |
| Produccion | `https://<vps-ip>/sh/` | `https://<vps-ip>/sh/api/*` |

### Formato de respuesta

```jsonc
// Exito
{
  "success": true,
  "data": { ... },
  "pagination": {        // solo en listados paginados
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}

// Error
{
  "success": false,
  "error": "Descripcion en español del error",
  "code": "VALIDATION_ERROR"
}
```

### Codigos de error

| Code | HTTP | Significado |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Body/query/params invalidos |
| `UNAUTHORIZED` | 401 | Falta token o invalido |
| `FORBIDDEN` | 403 | Rol insuficiente |
| `NOT_FOUND` | 404 | Recurso no existe |
| `CONFLICT` | 409 | Conflicto (email duplicado, solapamiento de booking, etc.) |
| `RATE_LIMITED` | 429 | Demasiadas peticiones |
| `INTERNAL_ERROR` | 500 | Error inesperado |

### Autenticacion

| Mecanismo | Detalle |
|-----------|---------|
| Access token | Header `Authorization: Bearer <jwt>`. TTL 15 min |
| Refresh token | Cookie httpOnly, Secure, SameSite=Strict. TTL 7 dias |

### Paginacion

Todos los listados aceptan:

| Param | Default | Max |
|-------|---------|-----|
| `page` | 1 | — |
| `limit` | 20 | 100 |
| `sort` | depende del recurso | — |
| `order` | `desc` | `asc` o `desc` |

### Filtros comunes

`?search=texto` — busqueda libre (nombre, codigo, etc.)
`?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD` — rango de fechas
`?active=true` — solo activos

### Roles (notacion)

`SA` = superadmin, `A` = admin, `R` = recepcion, `L` = limpieza, `C` = contabilidad.
`Auth` = cualquier autenticado. `Public` = sin auth.

---

## Health

### `GET /api/health`

| Auth | Roles |
|------|-------|
| Public | — |

**Response 200:**
```json
{ "status": "ok", "timestamp": "2026-05-09T12:00:00Z", "version": "1.0.0", "uptime": 1234 }
```

> No usa el wrapper estandar — compatible con health checks convencionales.

---

## Auth

### `POST /api/auth/login`

**Roles:** Public.

**Body:**
```json
{ "email": "admin@hotel.com", "password": "secret123" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": { "id": 1, "nombre": "Manuel", "email": "admin@hotel.com", "role": "superadmin" }
  }
}
```

**Cookie set:** `refresh_token` (httpOnly).

**Errores:** `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `RATE_LIMITED`.

### `POST /api/auth/logout`

**Roles:** Auth. Revoca el refresh token actual y limpia cookie.

**Response 200:** `{ "success": true, "data": null }`

### `POST /api/auth/refresh`

**Roles:** Public (lee cookie). Devuelve nuevo access token y rota refresh token.

**Response 200:** `{ "success": true, "data": { "accessToken": "...", "user": { ... } } }`

### `POST /api/auth/set-password`

**Roles:** Public. Establece password con token de invitacion.

**Body:** `{ "token": "...", "password": "nuevo_password" }`

### `POST /api/auth/forgot-password`

**Roles:** Public. Envia email con link de reset.

**Body:** `{ "email": "..." }`. Siempre responde 200 (no revela si existe).

### `POST /api/auth/change-password`

**Roles:** Auth.

**Body:** `{ "currentPassword": "...", "newPassword": "..." }`

---

## Users

> Solo superadmin gestiona usuarios. Admin ve la lista pero no edita.

### `GET /api/users`

**Roles:** SA, A. Filtros: `?role=&active=&search=`.

### `POST /api/users`

**Roles:** SA. Crea usuario y envia email con `set_password_token`.

**Body:** `{ "nombre": "...", "email": "...", "role": "recepcion" }`

### `GET /api/users/:id`

**Roles:** SA, A.

### `PATCH /api/users/:id`

**Roles:** SA. Cambiar nombre/email/rol/active.

### `DELETE /api/users/:id`

**Roles:** SA. Soft delete (`active = false`).

### `POST /api/users/:id/resend-invite`

**Roles:** SA. Re-genera `set_password_token` y reenvia email.

### `GET /api/users/me`

**Roles:** Auth. Devuelve el usuario actual.

---

## Rooms

### `GET /api/rooms`

**Roles:** Auth. Filtros: `?status=&room_type_id=&planta=&search=`.

**Response 200:**
```jsonc
{
  "success": true,
  "data": [
    {
      "id": 1,
      "numero": "101",
      "planta": "1",
      "status": "disponible",
      "roomType": { "id": 1, "nombre": "Sencilla", "tarifa_dia": 50.00 },
      "currentBooking": null
    }
  ],
  "pagination": { "total": 30, "page": 1, "limit": 20, "totalPages": 2 }
}
```

### `GET /api/rooms/occupancy`

**Roles:** Auth. Resumen actual de ocupacion.

**Response 200:**
```jsonc
{
  "success": true,
  "data": {
    "total": 30,
    "byStatus": { "disponible": 12, "ocupada": 15, "limpieza": 2, "mantenimiento": 1, "fuera_servicio": 0 },
    "occupancyRate": 0.50,
    "byPlanta": [
      { "planta": "1", "total": 10, "ocupada": 6, "occupancyRate": 0.6 }
    ],
    "byRoomType": [
      { "roomTypeId": 1, "nombre": "Sencilla", "total": 15, "ocupada": 8 }
    ]
  }
}
```

### `POST /api/rooms`

**Roles:** SA, A.

**Body:** `{ "numero": "201", "room_type_id": 1, "planta": "2", "status": "disponible" }`

### `GET /api/rooms/:id`

**Roles:** Auth. Incluye historial de bookings recientes.

### `PATCH /api/rooms/:id`

**Roles:** SA, A. (`numero`, `room_type_id`, `planta`, `notas`, `photo_url`)

### `PATCH /api/rooms/:id/status`

**Roles:** SA, A, R, L. (Limpieza solo puede pasar a `disponible` desde `limpieza`).

**Body:** `{ "status": "disponible", "notas": "..." }`

### `DELETE /api/rooms/:id`

**Roles:** SA. Soft delete. Falla con `CONFLICT` si tiene reservas activas.

### `POST /api/rooms/:id/photo`

**Roles:** SA, A. multipart/form-data, sube a R2.

---

## Room Types

### `GET /api/room-types`

**Roles:** Auth.

### `POST /api/room-types`

**Roles:** SA, A.

**Body:**
```json
{
  "nombre": "Suite",
  "descripcion": "...",
  "capacidad": 4,
  "tarifa_dia": 200.00,
  "tarifa_semana": 1200.00,
  "tarifa_mes": 4500.00,
  "moneda": "USD",
  "amenities": ["wifi", "tv", "minibar"]
}
```

### `GET /api/room-types/:id`, `PATCH /api/room-types/:id`, `DELETE /api/room-types/:id`

**Roles:** SA, A. Delete es soft, falla si hay rooms asociadas.

---

## Customers

### `GET /api/customers`

**Roles:** SA, A, R, C. Filtros: `?search=&doc_kind=&accepts_marketing=&segment=`.

`segment` puede ser: `vip` (>3 estancias), `inactivos` (90+ dias), `birthdays_month`.

### `POST /api/customers`

**Roles:** SA, A, R.

**Body:**
```json
{
  "nombres": "Maria",
  "apellidos": "Lopez",
  "doc_kind": "dni",
  "doc_numero": "12345678",
  "email": "maria@example.com",
  "telefono": "+58 414 ...",
  "fecha_nacimiento": "1990-05-15",
  "nacionalidad": "Venezuela",
  "accepts_marketing": true
}
```

### `GET /api/customers/:id`

**Roles:** SA, A, R, C. Incluye historial de bookings y total gastado.

### `PATCH /api/customers/:id`

**Roles:** SA, A, R.

### `DELETE /api/customers/:id`

**Roles:** SA. Soft delete. Falla si tiene bookings activos.

### `GET /api/customers/:id/timeline`

**Roles:** SA, A, R. Estancias + emails enviados + interacciones.

---

## Bookings

### `GET /api/bookings`

**Roles:** SA, A, R, C. Filtros: `?status=&customer_id=&room_id=&dateFrom=&dateTo=&period=&search=`.

### `GET /api/bookings/calendar`

**Roles:** SA, A, R. Devuelve bookings en formato compatible con calendario.

**Query:** `?dateFrom=2026-05-01&dateTo=2026-05-31`

**Response 200:**
```jsonc
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo": "BK-2026-0001",
      "fecha_entrada": "2026-05-10T14:00:00Z",
      "fecha_salida": "2026-05-12T11:00:00Z",
      "status": "confirmada",
      "customer": { "id": 5, "nombre": "Maria Lopez" },
      "room": { "id": 3, "numero": "201" }
    }
  ]
}
```

### `POST /api/bookings`

**Roles:** SA, A, R.

**Body:**
```json
{
  "customer_id": 5,
  "room_id": 3,
  "period": "dia",
  "fecha_entrada": "2026-05-10T14:00:00Z",
  "fecha_salida": "2026-05-12T11:00:00Z",
  "huespedes": 2,
  "promotion_code": "VERANO20",
  "descuento_pct": 0,
  "descuento_monto": 0,
  "notas": "Llega tarde"
}
```

**Logica del backend:**
1. Verifica que `room_id` existe y esta `active`
2. Calcula unidades segun `period` (noches, semanas, meses)
3. Toma `tarifa_aplicada` del `room_type` correspondiente
4. Aplica promotion_code si existe + valido + cumple condiciones
5. Calcula `importe_total = tarifa × unidades − descuento`
6. Inserta booking en transaccion (constraint EXCLUDE bloquea si solapa)
7. Inserta `booking_promotions` si hubo promo
8. Genera `audit_log`

**Errores:** `ROOM_NOT_AVAILABLE`, `INVALID_PROMOTION`, `OVERLAP_CONFLICT`.

### `GET /api/bookings/:id`

**Roles:** SA, A, R, C. Incluye payments, check_in, promotion aplicada, ledger entries asociados.

### `PATCH /api/bookings/:id`

**Roles:** SA, A, R. Restricciones: solo permitidos cambios de notas/huespedes en estado `pendiente`/`confirmada`. Cambio de fechas requiere validar solapamiento.

### `POST /api/bookings/:id/confirm`

**Roles:** SA, A, R. `pendiente` → `confirmada`.

### `POST /api/bookings/:id/cancel`

**Roles:** SA, A, R.

**Body:** `{ "reason": "..." }`. Marca `cancelled_at`, libera ocupacion futura.

### `POST /api/bookings/:id/no-show`

**Roles:** SA, A, R. `confirmada` → `no_show`.

### `GET /api/bookings/availability`

**Roles:** Auth. Consulta de disponibilidad.

**Query:** `?dateFrom=&dateTo=&room_type_id=&huespedes=`

**Response 200:** lista de rooms disponibles en el rango.

---

## Booking Payments

### `GET /api/bookings/:id/payments`

**Roles:** SA, A, R, C.

### `POST /api/bookings/:id/payments`

**Roles:** SA, A, R, C.

**Body:**
```json
{ "monto": 100.00, "method": "tarjeta", "referencia": "TXN12345", "pagado_at": "2026-05-10T15:00:00Z" }
```

**Logica:** Valida `monto + importe_pagado <= importe_total`. Crea `booking_payment`. En la misma transaccion crea `ledger_entry` tipo `ingreso` y los enlaza. Actualiza `payment_status` del booking.

### `DELETE /api/bookings/:id/payments/:paymentId`

**Roles:** SA, A. Solo si no esta conciliado. Crea asiento de reverso en ledger.

---

## Check-Ins

### `POST /api/check-ins`

**Roles:** SA, A, R.

**Body:** multipart/form-data
- `booking_id` (numero)
- `documento` (file, opcional, image|pdf)
- `firma` (file, opcional, image)
- `huespedes_acompaniantes` (JSON string, opcional)
- `observaciones` (string, opcional)

**Logica:** booking debe estar `confirmada`. Pasa booking → `en_curso`, room → `ocupada`. Sube archivos a R2.

### `GET /api/check-ins/:bookingId`

**Roles:** SA, A, R, C.

### `POST /api/check-ins/:bookingId/checkout`

**Roles:** SA, A, R.

**Body:** `{ "observaciones": "..." }`. Marca `hora_salida`, booking → `finalizada`, room → `limpieza`.

### `GET /api/check-ins/:bookingId/documento`

**Roles:** SA, A, R. Devuelve presigned URL del documento (15 min TTL).

---

## Ledger

### `GET /api/ledger`

**Roles:** SA, A, C. Filtros: `?type=&category_id=&dateFrom=&dateTo=&status=&booking_id=&customer_id=&search=`.

### `GET /api/ledger/summary`

**Roles:** SA, A, C. Resumen del periodo.

**Query:** `?dateFrom=&dateTo=&groupBy=day|week|month`

**Response 200:**
```jsonc
{
  "success": true,
  "data": {
    "totals": { "ingresos": 12000.00, "egresos": 4500.00, "neto": 7500.00, "moneda": "USD" },
    "byCategory": [
      { "categoryId": 1, "nombre": "alquiler", "type": "ingreso", "total": 10500.00 }
    ],
    "series": [
      { "period": "2026-05-01", "ingresos": 400, "egresos": 100 }
    ]
  }
}
```

### `POST /api/ledger`

**Roles:** SA, A, C.

**Body:**
```json
{
  "type": "egreso",
  "category_id": 5,
  "fecha": "2026-05-09",
  "descripcion": "Compra suministros limpieza",
  "monto": 120.50,
  "moneda": "USD",
  "method": "efectivo",
  "booking_id": null,
  "customer_id": null
}
```

> Egresos exigen al menos un `receipt` asociado en upload posterior. El cliente puede mandar `?withReceipt=1` y multipart con `receipt_file` para crear ambos en una sola request.

### `GET /api/ledger/:id`, `DELETE /api/ledger/:id`

**Roles:** SA, A, C. Delete crea asiento inverso (no borra fisicamente).

### `POST /api/ledger/:id/conciliar`

**Roles:** SA, A, C. Marca `status = conciliado`.

### `GET /api/ledger/export`

**Roles:** SA, A, C. Export CSV.

**Query:** `?type=&dateFrom=&dateTo=&format=csv|pdf`

---

## Ledger Categories

### `GET /api/ledger-categories`

**Roles:** Auth.

### `POST /api/ledger-categories`, `PATCH /api/ledger-categories/:id`, `DELETE /api/ledger-categories/:id`

**Roles:** SA, A. Delete es soft, falla si hay entries asociadas.

---

## Receipts

### `POST /api/receipts`

**Roles:** SA, A, C. multipart/form-data.

**Body:**
- `ledger_entry_id` (numero)
- `file` (file, image|pdf, max 10 MB)

**Response 201:** `{ "success": true, "data": { "id": 1, "kind": "imagen", "size_bytes": 12345 } }`

### `GET /api/receipts/:id/url`

**Roles:** SA, A, C. Devuelve presigned URL (15 min TTL).

### `DELETE /api/receipts/:id`

**Roles:** SA, A. Soft delete (`active = false`).

---

## Reports

### `GET /api/reports/financial`

**Roles:** SA, A, C.

**Query:** `?period=daily|weekly|monthly&dateFrom=&dateTo=`

**Response 200:**
```jsonc
{
  "success": true,
  "data": {
    "period": "monthly",
    "rangeFrom": "2026-04-01",
    "rangeTo": "2026-04-30",
    "ingresos": { "total": 12000, "byCategory": [...] },
    "egresos": { "total": 4500, "byCategory": [...] },
    "neto": 7500,
    "occupancyAvg": 0.62,
    "bookingsCount": 45
  }
}
```

### `GET /api/reports/financial.csv`

**Roles:** SA, A, C. Devuelve CSV en streaming.

### `GET /api/reports/financial.pdf`

**Roles:** SA, A, C. Devuelve PDF generado server-side (libreria pdfkit o puppeteer-lite).

### `GET /api/reports/occupancy`

**Roles:** SA, A. Detalle de ocupacion historica con grafica.

### `GET /api/reports/customers`

**Roles:** SA, A. Top clientes, segmentos.

---

## Promotions

### `GET /api/promotions`

**Roles:** SA, A. Filtros: `?active=&codigo=&kind=`.

### `POST /api/promotions`

**Roles:** SA, A.

**Body:**
```json
{
  "codigo": "VERANO20",
  "nombre": "Promo Verano",
  "kind": "porcentaje",
  "valor": 20,
  "fecha_inicio": "2026-06-01",
  "fecha_fin": "2026-08-31",
  "max_usos": 100,
  "condiciones": { "min_noches": 3, "room_type_ids": [1, 2] }
}
```

### `GET /api/promotions/:id`, `PATCH /api/promotions/:id`, `DELETE /api/promotions/:id`

**Roles:** SA, A.

### `POST /api/promotions/validate`

**Roles:** Auth. Valida codigo antes de aplicar.

**Body:** `{ "codigo": "VERANO20", "room_id": 3, "fecha_entrada": "...", "fecha_salida": "...", "noches": 3 }`

**Response 200:** `{ "valid": true, "discount_amount": 60.00, "promotion_id": 5 }` o `{ "valid": false, "reason": "Min noches no cumplido" }`.

---

## Email Templates

### `GET /api/email-templates`

**Roles:** SA, A. Filtros: `?event=`.

### `POST /api/email-templates`, `GET /api/email-templates/:id`, `PATCH /api/email-templates/:id`, `DELETE /api/email-templates/:id`

**Roles:** SA, A.

**Body:**
```json
{
  "nombre": "Bienvenida estandar",
  "event": "bienvenida",
  "asunto": "¡Bienvenido al hotel, {{customer.nombres}}!",
  "body_html": "<p>Hola {{customer.nombres}}, te esperamos el {{booking.fecha_entrada}}</p>",
  "body_text": "Hola {{customer.nombres}}...",
  "variables": ["customer.nombres", "booking.fecha_entrada"]
}
```

### `POST /api/email-templates/:id/preview`

**Roles:** SA, A. Renderiza con datos de ejemplo.

---

## Email Campaigns

### `GET /api/email-campaigns`

**Roles:** SA, A. Filtros: `?status=&event=`.

### `POST /api/email-campaigns`

**Roles:** SA, A.

**Body:**
```json
{
  "nombre": "Recuperacion mayo 2026",
  "template_id": 4,
  "event": "manual",
  "segmento": { "type": "inactivos", "dias_min": 90, "accepts_marketing": true },
  "programada_para": "2026-05-15T09:00:00Z"
}
```

### `GET /api/email-campaigns/:id`

**Roles:** SA, A. Incluye stats agregadas.

### `POST /api/email-campaigns/:id/send-now`

**Roles:** SA, A. Dispara envio inmediato.

### `POST /api/email-campaigns/:id/cancel`

**Roles:** SA, A.

### `GET /api/email-campaigns/:id/logs`

**Roles:** SA, A. Lista de envios individuales.

---

## Audit Log

### `GET /api/audit-log`

**Roles:** SA, A. Filtros: `?user_id=&action=&entity=&entity_id=&dateFrom=&dateTo=`.

### `GET /api/audit-log/:id`

**Roles:** SA, A. Incluye `before` y `after` JSON.

---

## Settings

### `GET /api/settings`

**Roles:** Auth. Devuelve todas las claves publicas (oculta secretos).

### `GET /api/settings/:key`

**Roles:** SA, A.

### `PUT /api/settings/:key`

**Roles:** SA, A.

**Body:** `{ "value": <jsonb> }`

---

## Webhooks

### `POST /api/webhooks/resend`

**Roles:** Public (validado via firma HMAC).

Maneja eventos `email.delivered`, `email.opened`, `email.bounced` y actualiza `email_logs`.

**Header:** `Resend-Signature: <hmac>`

---

## Resumen totales

| Modulo | GET | POST | PATCH | PUT | DELETE | Total |
|--------|-----|------|-------|-----|--------|-------|
| Auth | 0 | 5 | 0 | 0 | 0 | 5 |
| Users | 3 | 2 | 1 | 0 | 1 | 7 |
| Rooms | 3 | 2 | 2 | 0 | 1 | 8 |
| Room Types | 2 | 1 | 1 | 0 | 1 | 5 |
| Customers | 3 | 1 | 1 | 0 | 1 | 6 |
| Bookings | 3 | 4 | 1 | 0 | 0 | 8 |
| Booking Payments | 1 | 1 | 0 | 0 | 1 | 3 |
| Check-Ins | 2 | 2 | 0 | 0 | 0 | 4 |
| Ledger | 4 | 2 | 0 | 0 | 1 | 7 |
| Ledger Categories | 1 | 1 | 1 | 0 | 1 | 4 |
| Receipts | 1 | 1 | 0 | 0 | 1 | 3 |
| Reports | 5 | 0 | 0 | 0 | 0 | 5 |
| Promotions | 2 | 2 | 1 | 0 | 1 | 6 |
| Email Templates | 2 | 2 | 1 | 0 | 1 | 6 |
| Email Campaigns | 3 | 3 | 0 | 0 | 0 | 6 |
| Audit Log | 2 | 0 | 0 | 0 | 0 | 2 |
| Settings | 2 | 0 | 0 | 1 | 0 | 3 |
| Webhooks | 0 | 1 | 0 | 0 | 0 | 1 |
| Health | 1 | 0 | 0 | 0 | 0 | 1 |
| **Total** | **40** | **30** | **8** | **1** | **11** | **~90** |

> El total exacto puede variar al implementar — esta tabla es el mapa de referencia.
