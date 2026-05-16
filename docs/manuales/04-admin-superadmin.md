# Manual de Admin / Superadmin

Esta guia es para los roles **admin** y **superadmin**. Tienes acceso casi total. Las diferencias entre ambos:

| Capacidad | admin | superadmin |
|---|---|---|
| Operacion completa (reservas, pagos, etc.) | ✓ | ✓ |
| Configuracion (tarifas, promos, plantillas) | ✓ | ✓ |
| Reportes | ✓ | ✓ |
| Conciliacion bancaria | ✓ | ✓ |
| Audit log | ✓ | ✓ |
| **Gestion de usuarios** | — | ✓ |
| Cambiar rol de un usuario | — | ✓ |
| Crear / desactivar otros admins | — | ✓ |

---

## Setup inicial del hotel (primera vez)

Sigue este orden la primera vez que abres el sistema:

### 1. Datos del hotel
Menu **Pagos > Configuracion**:
- Tasa Bs/USD del dia (BCV).
- Banco para Pago Movil receptor.
- Cedula juridica / RIF del hotel.
- Telefono asociado al pago movil.
- Razon social.

Estos datos se usan en plantillas de WhatsApp y en la conversion automatica de pagos en bolivares.

### 2. Tipos de habitacion
Menu **Habitaciones > Tipos y tarifas**:
- Para cada tipo: nombre, capacidad, **tarifa por dia**, tarifa por semana (opcional), tarifa por mes (opcional), moneda, amenities, descripcion.

### 3. Habitaciones individuales
Menu **Habitaciones > Panel**:
- Para cada habitacion: numero, planta, tipo (de los creados arriba), notas internas.

### 4. Plantillas WhatsApp
Menu **Marketing > Plantillas WhatsApp**:
- Vienen 4 plantillas por defecto (confirmacion reserva, recordatorio check-in, datos pago movil, agradecimiento).
- Edita el cuerpo de cada una para tu marca. Click en una variable del panel derecho para insertarla.

### 5. Plantillas email
Menu **Marketing > Plantillas Email**:
- Configura las plantillas de bienvenida, post-estancia, cumpleaños, recuperacion.

### 6. Promociones (opcional)
Menu **Marketing > Promociones**:
- Crea codigos de descuento si planeas usarlos.

### 7. Crear usuarios (solo superadmin)
Menu **Admin > Usuarios**:
- Para cada empleado: nombre, email, rol (recepcion / limpieza / contabilidad / admin).
- El sistema genera un **set-password token** y envia un email (si Resend esta configurado).
- Si Resend NO esta configurado, copia manualmente el token y pasaselo al usuario por canal seguro.

---

## Gestion diaria

### Tasa BCV
Cambiala **cada dia** al inicio del turno. Menu **Pagos > Configuracion** → seccion "Tasa de cambio" → ingresa la nueva tasa → **Guardar**.

Los pagos del dia usaran esa tasa automaticamente para calcular el monto en USD (moneda base).

### Resolucion de incidencias

- **Pago rechazado por error** → no hay forma de "reactivar" un pago rechazado. Recepcion debe registrar uno nuevo.
- **Reserva con datos incorrectos** → puedes editarla mientras este en estado `pendiente` o `confirmada`. Una vez `en_curso` (huesped ya hizo check-in) los datos quedan fijos.
- **Cancelar una reserva** → desde el detalle, boton **Cancelar**. Pide motivo. La habitacion vuelve a disponible si era la actual.
- **Recuperar un comprobante** → cada pago tiene un `receipt_url` opcional. Si lo subiste, esta en R2 y se puede ver desde el detalle del pago.

---

## Auditoria

Menu **Admin > Audit log**. Cada accion sensible deja un registro con:

- Quien (user_id)
- Que (create / update / delete / status_change / login / logout / export / permission_change)
- Sobre que entidad (bookings, payments, customers, users, etc.)
- ID de la entidad
- **before** y **after** en JSON (que cambio)
- IP y user-agent
- Fecha y hora

Filtros por:
- Usuario
- Tipo de accion
- Entidad
- Rango de fechas

Click en una entrada → modal con el diff completo.

> El audit log es **inmutable**. No hay forma de borrar entradas. Si tienes que justificar algo legalmente, este es tu registro.

---

## Reportes ejecutivos

Menu **Finanzas > Reportes**. Ver [03-contabilidad.md](03-contabilidad.md#reportes-financieros) para el detalle.

Recomendado al final del mes:
1. Selecciona el rango (1 al ultimo del mes).
2. Revisa KPIs (ocupacion, ADR, RevPAR).
3. Compara con el mes anterior.
4. Exporta CSV para el contador.

---

## Seguridad

### Rotacion de credenciales

Si un empleado se va:
1. Menu **Admin > Usuarios**.
2. Encuentra al usuario → **Desactivar**.
3. Su sesion sigue valida hasta que expire (15 min access token). El refresh token tambien queda revocado, asi que no puede renovar.

> No borres usuarios. Desactivar es lo correcto para preservar referencias en bookings, ledger, audit log.

### Cambio de contrasena propia
Menu **Mi perfil** → **Cambiar contrasena**. Requiere la contrasena actual.

### Reset de contrasena de otro usuario
Solo superadmin:
1. Menu **Admin > Usuarios**.
2. Encuentra al usuario → **Resetear contrasena**.
3. El sistema invalida la actual y genera un nuevo `set_password_token` (24h).
4. Envia el link al usuario.

---

## Mantenimiento del sistema

### Backups
El sistema NO hace backup automatico por si solo. Configurarlo en el VPS de produccion:
```cron
0 3 * * * pg_dump sh_db | gzip > /backups/sh_$(date +\%F).sql.gz
```
Y retencion de 14 dias minimo.

### Migrar a una version nueva
1. Pull del codigo nuevo.
2. `npm install` en backend y frontend.
3. `npm run migrate` en backend (aplica migraciones nuevas si las hay).
4. `npm run build` en frontend.
5. Reiniciar el servicio (PM2: `pm2 restart sh-api`).

### Aplicar nuevas plantillas / categorias
Los seeds (`backend/seeds/*.sql`) usan `ON CONFLICT DO NOTHING`, asi que puedes correr `npm run seed` de nuevo y solo se agregan los nuevos sin pisar los editados.

### Reiniciar el servicio
- En dev: Ctrl+C en la ventana del backend y volver a `npm run dev`.
- En prod: `pm2 restart sh-api`.

### Logs
- Backend: stdout (pino estructurado). En produccion van a archivo via PM2.
- Frontend: consola del navegador.
- Errores criticos: Sentry (si esta configurado en `.env`).

---

## Lo que NO debes hacer

- **NO** edites directamente la base de datos. Pasa siempre por la API o pierdes audit log e invariantes.
- **NO** borres asientos del ledger. Anulalos con asiento inverso.
- **NO** uses el usuario `postgres` para conexion de aplicacion en prod. Usa `sh_user`.
- **NO** subas el `.env` al repositorio. El `.gitignore` ya lo protege pero verifica.
- **NO** habilites CORS con `*` en produccion. Configura dominios especificos.
- **NO** desactives RLS si no entiendes que estas haciendo.

---

## Soporte y contacto

Para reportar bugs o pedir features: ver el repositorio Git del proyecto.

Para emergencias (sistema caido, datos perdidos): contactar al equipo de desarrollo.
