# Manual de Usuario — Sistema Hotelero

> Plataforma web para operar el hotel desde un único panel: habitaciones, reservas, check-in, pagos, contabilidad y reportes.
> Acceso: **http://31.97.211.55/sh/**

---

## 1. Antes de empezar

### 1.1. ¿Quién puede entrar y qué puede hacer cada rol?

| Rol | Qué hace en la práctica |
|------|------------------------|
| **superadmin** | Configura el sistema entero. Es el único que crea, edita y desactiva usuarios y cambia contraseñas. Tiene acceso a todo lo demás. |
| **admin** | Manda la operación: tipos de habitación, tarifas, promociones, reportes ejecutivos, conciliación bancaria. No gestiona usuarios. |
| **recepción** | Día a día con el huésped: crea reservas, hace check-in / check-out, registra pagos, atiende clientes. |
| **limpieza** | Solo ve las habitaciones pendientes de limpieza y las marca como disponibles cuando terminan. |
| **contabilidad** | ERP del hotel: ingresos y egresos, conciliación bancaria, cierre de caja, reportes financieros. No toca la operación. |

### 1.2. Cómo iniciar sesión

1. Abre el navegador en **http://31.97.211.55/sh/**.
2. Te lleva a la pantalla de login.
3. Email + contraseña (te las da el superadmin).
4. Click **Iniciar sesión**.

Si la contraseña no funciona, pídele al superadmin que la resetee desde **Configuración → Usuarios → Cambiar pass**.

### 1.3. Cerrar sesión

Esquina inferior izquierda → click sobre tu nombre/avatar → ícono de logout (la flecha que sale).

### 1.4. Cambiar tu propia contraseña

Esquina inferior izquierda → click **Configuración** → **Mi perfil** → escribe la nueva contraseña → **Guardar**. Te pedirá iniciar sesión de nuevo.

### 1.5. Tema claro/oscuro

Esquina inferior izquierda → **Modo claro** / **Modo oscuro**. Se guarda en tu navegador.

---

## 2. Dashboard (pantalla de inicio)

Es el primer panel que ve cualquiera al entrar. Contiene:

- **Indicadores del día (KPIs):** llegadas, salidas, % ocupación, pagos pendientes, habitaciones para limpiar.
- **Llegadas de hoy:** los huéspedes que entran. Click sobre cualquiera → ir directo al detalle de su reserva.
- **Salidas de hoy:** los que se van. Si tienen saldo pendiente sale el monto en rojo.
- **Habitaciones pendientes de limpieza** con el tiempo que llevan en ese estado.
- **Cumpleaños del día:** clientes que cumplen años hoy (útil para detalle).
- **Inbox de pagos por confirmar:** pagos móvil / Zelle que esperan validación contra el banco.
- **Reservas por cobrar** (próximas 48h sin un solo pago registrado).
- **Tablero de habitaciones en vivo** con el estado de cada una.

Botones rápidos arriba: **Nueva reserva**, **Registrar pago**, **Check-in**.

---

## 3. Habitaciones

Acceso: barra izquierda → **Habitaciones**.

Sub-secciones:

### 3.1. Panel
Vista grid con todas las habitaciones del hotel. Cada tarjeta muestra:
- Número
- Tipo (Sencilla / Doble / Suite)
- Estado actual con color: 🟢 disponible · 🔵 ocupada · 🟡 limpieza · 🟠 mantenimiento · ⚪ fuera servicio
- Planta

**Acciones por tarjeta:**
- Click sobre la habitación → cambiar estado (recepción/limpieza/admin)
- Editar (admin/superadmin): cambiar número, tipo, planta, foto, notas

**Filtros arriba:** por estado y búsqueda por número.

Botón **Nueva habitación** (admin/superadmin).

### 3.2. Tipos y tarifas
Lista de los tipos de habitación con sus tarifas por día/semana/mes y capacidad. Solo admin/superadmin.

- Crear un tipo: nombre, slug interno, descripción, capacidad, tarifa día/semana/mes, moneda, amenities.
- Editar: cambia precios sin afectar reservas ya confirmadas (cada reserva guarda su tarifa aplicada).
- Eliminar: solo si ningún cuarto activo lo usa.

### 3.3. Limpieza
Lista filtrada de habitaciones en estado **limpieza**. Pensado para que el personal de limpieza:
1. Vea qué cuartos tiene pendientes.
2. Click sobre un cuarto → **Marcar como disponible** cuando termina.
3. El sistema cierra automáticamente la orden de limpieza asociada.

---

## 4. Reservas

Acceso: **Reservas** en la barra izquierda.

### 4.1. Lista
Tabla con todas las reservas. Columnas: código (BK-YYYY-NNNN), huésped, habitación, fechas, importe, estado, pago.

Estados posibles:
- **pendiente** — recién creada, sin confirmar
- **confirmada** — pago inicial recibido o confirmada manualmente
- **en_curso** — el huésped ya hizo check-in
- **finalizada** — completó check-out
- **cancelada** — no se hospedó (se guarda el motivo)
- **no_show** — no se presentó

Filtros: estado, rango de fechas, búsqueda por código.

Click sobre una reserva → **Detalle**.

### 4.2. Crear reserva
Botón **Nueva reserva** (arriba a la derecha) o tecla **N**.

Pasos:
1. **Huésped:** buscar por documento/nombre. Si no existe, click "Crear nuevo huésped" y rellenar inline.
2. **Habitación:** elegir periodo (día/semana/mes) + rango → aparecen solo las disponibles para esas fechas. La tarifa se calcula sola.
3. **Huéspedes:** número de personas (no puede exceder la capacidad de la habitación).
4. **Descuento:** opcional, % o monto fijo.
5. **Placa del vehículo:** opcional.
6. **Pago inicial:** opcional. Si lo registras aquí, queda enlazado a la reserva.
7. **Notas:** observaciones libres.

El sistema **valida que la habitación no esté tomada** en ese rango. Si lo está, te avisa con el código de la reserva que solapa.

### 4.3. Detalle de una reserva
Click en cualquier fila. Verás:
- Datos del huésped y resumen (fechas, importe, saldo).
- Botones según estado: **Confirmar**, **Check-in**, **Cancelar**, **No-show**, **Mover** (cambiar habitación o fechas).
- Historial de pagos. Botón **Registrar pago** para añadir uno nuevo.
- Subir comprobante a un pago existente.

### 4.4. Calendario
**Reservas → Calendario.** Vista mensual con las reservas. Cada barra representa una reserva. Click para ir al detalle.

### 4.5. Timeline (vista Gantt)
**Reservas → Timeline.** Cada fila es una habitación, cada barra una reserva. Drag & drop para mover reservas entre habitaciones o ajustar fechas. Útil para reorganizar el día.

---

## 5. Huéspedes (clientes)

Acceso: **Huéspedes** en la barra izquierda.

### 5.1. Lista
Tabla con todos los huéspedes. Muestra: nombre, documento, teléfono, total de estancias y total gastado (acumulado de pagos confirmados).

Filtros: búsqueda por nombre/documento/email/teléfono.

### 5.2. Crear / editar huésped
Botón **Nuevo huésped** (o se crea inline desde una reserva).

Campos:
- Nombres, apellidos
- Tipo de documento: cédula, pasaporte, DNI, licencia, otro
- Número de documento (único)
- Email, teléfono
- Fecha de nacimiento (alimenta los cumpleaños del dashboard)
- Nacionalidad, dirección
- **Placa de vehículo** (por defecto, una reserva puede sobreescribirla)
- **¿Cómo nos conoció?** Instagram, Facebook, Google, recomendación, calle, recurrente, otro
- Acepta marketing (sí/no)
- Notas internas

### 5.3. Detalle de un huésped
Click sobre cualquier fila. Verás:
- Datos completos.
- Timeline de estancias (todas las reservas pasadas y futuras).
- Estado de cuenta consolidado (cargos vs pagos por reserva).
- Botón **Editar**, **Registrar pago suelto** (no asociado a reserva).

---

## 6. Check-in y check-out

### 6.1. Check-in
Desde el detalle de una reserva en estado **confirmada** o **pendiente** → botón **Check-in**.

Pasos:
1. Confirmar identidad del huésped.
2. Si hay **saldo pendiente**, el sistema avisa y pide confirmación explícita (puedes cobrarlo en ese momento desde el mismo flujo).
3. Subir foto/PDF del documento de identidad (opcional pero recomendado).
4. Capturar firma del huésped (opcional).
5. Acompañantes: rellenar nombre + documento de cada acompañante (hasta el número de huéspedes registrado).
6. Observaciones (opcional).
7. **Confirmar check-in.**

Lo que pasa automáticamente:
- La reserva pasa a **en_curso**.
- La habitación pasa a **ocupada**.
- Queda registrado en el audit log.

### 6.2. Check-out
Desde el detalle de una reserva en estado **en_curso** → botón **Check-out**.

1. Revisar que no haya saldo pendiente. Si lo hay, lo cobras antes.
2. Observaciones opcionales para limpieza (ej: "huésped reportó grifo flojo").
3. **Confirmar check-out.**

Automático:
- Reserva → **finalizada**.
- Habitación → **limpieza** (no disponible directamente).
- Se crea **orden de limpieza** en cola.
- Audit log.

---

## 7. Pagos (Pagos en la barra izquierda)

### 7.1. Lista de pagos
Tabla con todos los pagos registrados. Columnas: monto, método, referencia, estado (confirmado / por confirmar / rechazado), fecha, reserva o huésped asociado.

Filtros: estado, método, búsqueda por referencia, rango de fechas.

Click sobre un pago → ver detalle, confirmar o rechazar.

### 7.2. Registrar pago (botón flotante azul **Registrar pago** o tecla **P**)

Dialog rápido:
1. **Para qué es el pago:** buscar reserva por código o huésped por nombre/documento.
2. **Monto** y **moneda** (USD por defecto, Bs si lo cobras en bolívares).
3. **Método de pago:**
   - Efectivo USD / Efectivo Bs
   - Tarjeta de débito o crédito (punto de venta)
   - Transferencia
   - **Pago Móvil** (banco + teléfono + cédula + referencia)
   - **Zelle** (email + referencia)
   - PayPal, Otro
4. **Tasa de cambio** si el cobro es en Bs (por defecto carga la BCV del día desde Configuración).
5. **Comprobante:** subir foto/captura del pago.
6. **Estado:** los pagos en efectivo/tarjeta quedan **confirmados**; pago móvil/Zelle/transferencia quedan **por confirmar** hasta validar contra el banco.
7. **Notas** opcionales.

### 7.3. Conciliación bancaria
**Pagos → Conciliación bancaria.** Para contabilidad/admin.

1. Sube el extracto del banco (PDF o CSV).
2. El sistema lista los movimientos.
3. Para cada movimiento sin emparejar, puede sugerirte el pago al que corresponde (match por referencia/monto/fecha).
4. Confirmas el match o lo emparejas manualmente.
5. Botón **Auto-confirmar matches con alta confianza** para pasar varios de golpe a confirmado.

> Nota: el parser automático de extractos está en desarrollo; por ahora la importación funciona en modo manual.

### 7.4. Cierre de caja
**Pagos → Cierre de caja.** Para recepción y contabilidad al final del turno.

1. Define el rango del turno (desde / hasta) — por defecto desde la apertura.
2. Vista de **totales por método y por moneda**: cuánto confirmado, cuánto por confirmar.
3. Notas del turno (efectivo entregado, novedades).
4. **Cerrar turno** → genera código (CC-YYYY-NNNN), guarda snapshot inmutable.

### 7.5. Configuración de pagos
**Pagos → Configuración.** Para admin/superadmin.

- **Tasa BCV diaria** que se aplica por defecto a los cobros en Bs (puedes guardar el histórico).
- **Datos del hotel para Pago Móvil:** banco, cédula, teléfono, titular — son los que el huésped debe usar para enviarte el pago.

---

## 8. Finanzas

### 8.1. Ingresos / Egresos (ledger)
**Finanzas → Ingresos / Egresos.** Para contabilidad/admin.

Lista todos los asientos contables. Cada asiento tiene código (LG-YYYY-NNNN), tipo (ingreso/egreso), categoría, descripción, monto, fecha, estado.

**Crear asiento manual:**
- Click **Nuevo asiento**.
- Tipo: ingreso o egreso.
- Categoría: alojamiento, servicios extra, restauración, nómina, servicios públicos, suministros, mantenimiento, impuestos, otros…
- Fecha, descripción, monto, moneda.
- Método de pago (si aplica).
- Opcional: enlazar a una reserva/huésped específico.
- **Subir comprobante** (imagen o PDF). Obligatorio para egresos.

**Importante:** los asientos son **inmutables**. Si te equivocas, no se editan: se hace un **asiento inverso** (botón **Anular**) que cancela contablemente al original.

Los cobros confirmados de reservas generan ingresos automáticamente.

### 8.2. Reportes
**Finanzas → Reportes.**

Atajos: **Hoy** · **Esta semana** · **Este mes** · **Este año**.

Indicadores principales:
- **Ocupación %** — qué porcentaje de noches/habitaciones estuvieron ocupadas.
- **ADR (Average Daily Rate)** — tarifa promedio cobrada por noche vendida.
- **RevPAR** — ingreso por habitación disponible (incluye las vacías).
- **Top tipos de habitación** por ingresos.
- **Ingresos vs egresos** por periodo, con gráfico de evolución.
- **Por método de pago:** cuánto entró en cada moneda y método.
- **Top clientes** por gasto.

Export a CSV (en desarrollo).

---

## 9. Configuración → Usuarios (solo superadmin)

### 9.1. Lista
Tabla con los usuarios del sistema: nombre, email, rol, estado activo, último login.

### 9.2. Crear usuario
Botón **Nuevo usuario**:
1. Nombre completo.
2. Email (será también su usuario para login).
3. Rol.
4. **Contraseña** (mínimo 8 caracteres). Se la das tú al usuario en mano/WhatsApp/etc.
5. **Crear usuario** → ya puede iniciar sesión.

> Buena práctica: pídele al usuario que cambie su contraseña en su primer login desde **Configuración → Mi perfil**.

### 9.3. Cambiar contraseña de un usuario
Botón **Cambiar pass** al lado del usuario → escribes la nueva contraseña → se actualiza al instante.

### 9.4. Desactivar / reactivar
Botón **Desactivar** → no podrá iniciar sesión, pero su historial queda intacto.
Botón **Reactivar** → vuelve a poder entrar.

> Los usuarios no se borran físicamente. Solo se desactivan, para no perder el rastro en el audit log.

---

## 10. Audit log (registro de actividad)

**Configuración → Audit log.** Solo superadmin/admin.

Lista de todas las acciones sensibles registradas:
- Logins / logouts
- Cambios de estado en habitaciones
- Creación / cancelación de reservas
- Cambios de rol o desactivación de usuarios
- Pagos confirmados / rechazados
- Anulaciones contables

Filtros: por usuario, por acción, por entidad (room/booking/payment...), por rango de fechas.

Cada entrada guarda: quién, qué hizo, sobre qué, antes/después (JSON), IP y user agent.

---

## 11. Atajos de teclado

| Tecla | Acción |
|-------|--------|
| **Ctrl + K** | Abrir buscador rápido (busca habitaciones, reservas, huéspedes) |
| **N** | Nueva reserva |
| **P** | Registrar pago |
| **Esc** | Cerrar dialog actual |

---

## 12. Preguntas frecuentes

**¿Qué hago si una habitación está marcada como ocupada pero el huésped ya se fue?**
Ve al detalle de la reserva y haz el check-out manual. La habitación pasará a limpieza automáticamente.

**¿Puedo editar una reserva ya confirmada?**
Sí, pero limitado: huéspedes, notas, mover habitación/fechas. No puedes cambiar tarifa aplicada — para eso cancela y crea nueva.

**Un huésped me pagó por Pago Móvil pero no aparece en el extracto del banco.**
El pago queda en estado **por confirmar** hasta que coincida con el extracto. Puedes confirmarlo manualmente desde el detalle del pago si verificas tú el SMS del banco.

**¿Cómo cobro la mitad ahora y la mitad al check-out?**
Registra un pago parcial. La reserva pasará a estado **parcial**. Cuando registres el resto pasará a **pagado**. Puedes hacer check-in con saldo pendiente — el sistema te avisa pero te deja continuar.

**¿Cómo aplico un descuento a un cliente recurrente?**
Al crear la reserva, usa el campo **descuento** (puedes elegir % o monto fijo). El sistema recalcula el importe total automáticamente.

**¿Quién puede ver los reportes financieros?**
Admin, superadmin y contabilidad. Recepción y limpieza no tienen acceso.

**Olvidé mi contraseña.**
Pídele al superadmin que la resetee desde **Configuración → Usuarios → Cambiar pass**.

**¿El sistema funciona en móvil?**
Sí, está pensado responsive. Las pantallas operativas (limpieza, registrar pago, check-in) son las más optimizadas para móvil.

---

## 13. Soporte

Para reportes de errores o sugerencias:
- **Desarrollo:** Buggin.dev — contacto@buggin.dev — +58 414 927 4827
- **Propietario:** Manuel Casas

Cuando reportes un problema, incluye:
1. Qué intentabas hacer
2. Qué pasó (mensaje de error si hay)
3. Email/usuario con el que entraste
4. Captura de pantalla si es posible
