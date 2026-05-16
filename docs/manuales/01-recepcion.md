# Manual de recepcion

Esta guia es para el personal de recepcion. Cubre el dia a dia: revisar el panel, llegadas, salidas, cobros, check-in, check-out.

---

## Vista general

Al entrar al sistema veras el **Panel del dia** con tres columnas:

| Columna | Que contiene |
|---|---|
| **Izquierda** | Llegadas y salidas previstas para hoy, habitaciones en limpieza, cumpleanios. |
| **Centro** | Tablero con TODAS las habitaciones y su estado actual (color). |
| **Derecha** | Inbox: pagos por confirmar, reservas sin pago en las proximas 24h. |

Arriba aparecen los KPIs: llegadas/salidas del dia, ocupacion, limpiezas pendientes, pagos por confirmar y un boton grande **Registrar pago**.

---

## Atajos de teclado

| Tecla | Accion |
|---|---|
| **Ctrl + K** o **/** | Abrir busqueda global (command palette) |
| **P** | Registrar pago en cualquier pantalla |
| **N** | Nueva reserva |
| **Esc** | Cerrar dialogo |

---

## Tareas diarias

### 1. Recibir un huesped que llega

1. En el **Panel del dia**, columna izquierda, busca al huesped en **Llegadas**.
2. Click en la tarjeta - te lleva al detalle de la reserva.
3. Si la tarjeta dice "Pendiente X Bs" - click en **Cobrar →** para registrar el pago antes del check-in.
4. Click en **Hacer check-in** (boton verde).
5. Sube foto del documento de identidad. Firma (opcional).
6. Observaciones internas (si aplica).
7. **Confirmar check-in**.
8. La habitacion pasa automaticamente a "ocupada" (azul en el tablero).

### 2. Hacer check-out

1. En el **Panel del dia**, columna izquierda, busca al huesped en **Salidas**.
2. Click en la tarjeta - detalle de reserva.
3. Click en **Check-out**.
4. **Si hay saldo pendiente**: el sistema NO te deja confirmar hasta cobrar. Click en **Cobrar saldo** y registra el pago.
5. Observaciones de salida (estado de la habitacion, cargos extras, etc.).
6. **Confirmar check-out**.
7. La habitacion pasa a "limpieza" (amarillo). El equipo de limpieza lo vera en su pantalla.

### 3. Registrar un pago

Hay **tres formas** de llegar al dialogo:

- Presiona la tecla **P** desde cualquier pantalla.
- Click en el boton flotante **Registrar pago** (esquina inferior derecha).
- Desde una reserva, boton **Registrar pago** en la seccion de pagos.

Pasos del dialogo:

1. **Selecciona el metodo**: Pago Movil, Transferencia, Efectivo Bs/USD, Zelle, Punto de Venta, Tarjeta, otro.
2. **Selecciona la reserva o huesped**: escribe el codigo de reserva, numero de habitacion, cedula, nombre o telefono. Aparecen sugerencias.
3. **Datos especificos del metodo**:
   - **Pago Movil**: banco emisor, cedula del titular, telefono, referencia (los 6+ digitos).
   - **Transferencia**: banco origen, banco destino, referencia.
   - **Zelle**: email del titular.
   - **Tarjeta** / **Punto de venta**: ultimos 4 digitos, voucher, lote.
4. **Monto y moneda**: si pones VES (Bs), el sistema muestra el equivalente en USD usando la tasa BCV configurada.
5. **Fecha**: por defecto ahora, editable.
6. **Notas** opcional.
7. **Guardar pago**.

> Pago Movil y Transferencia entran como **"por confirmar"**. Recepcion o contabilidad debe confirmarlos despues comparando contra el extracto del banco. Efectivo, POS, Zelle y tarjeta entran como confirmados directamente.

### 4. Confirmar / rechazar un pago

En el **Inbox** del Panel del dia (columna derecha) ves los pagos por confirmar.

- **Confirmar**: si revisaste la captura/extracto y todo coincide. El pago se contabiliza en el ledger y suma al pagado de la reserva.
- **Rechazar**: si no encuentras la referencia o el monto no coincide. Pides motivo. El asiento contable se anula automaticamente.

Tambien puedes ir a **Pagos > Lista de pagos** con filtro "Por confirmar" y operar masivamente.

### 5. Crear una reserva

Atajo: tecla **N** o menu **Reservas > Nueva**.

1. Busca el huesped por cedula/nombre. Si no existe, **crear inline**.
2. Selecciona habitacion. Si la habitacion ya esta reservada en las fechas, el sistema bloquea.
3. Fechas de entrada y salida.
4. Periodo: dia / semana / mes. La tarifa se toma del tipo de habitacion.
5. Si tienes codigo de promocion, ingresalo. El descuento se aplica al total.
6. (Opcional) **Guardar y registrar primer pago** abre el dialogo de pago precargado.

### 6. Buscar un huesped, reserva, pago

Presiona **Ctrl+K** o **/**. Escribe cualquier cosa: nombre, cedula, telefono, codigo de reserva, numero de habitacion, referencia de pago. Aparecen resultados navegables con flechas; **Enter** para ir.

---

## Lectura del tablero de habitaciones

Cada tarjeta del tablero muestra:

- **Numero de habitacion** grande.
- **Tipo** debajo.
- **Estado** (color):
  - Verde = disponible
  - Azul = ocupada
  - Amarillo = limpieza
  - Naranja = mantenimiento
  - Rojo = fuera de servicio
- Si esta ocupada: nombre del huesped y **hasta cuando** ("Hasta jueves 12:00").
- Si hay saldo pendiente: aparece en ambar.

Click en una tarjeta te lleva al detalle.

---

## Vista timeline

**Reservas > Timeline**: vista tipo Gantt. Habitaciones en filas, dias en columnas. Cada barra es una reserva de un color segun su estado.

- Click en barra: detalle de reserva.
- Click en hueco vacio: crear reserva precargada con esa habitacion y fecha.
- Cambia el rango con los botones (7 dias, 2 semanas, 30 dias).
- Filtros por estado y planta.

---

## Notificaciones

Arriba a la derecha hay una **campanita**. Cuando hay alertas activas muestra un numero en rojo (criticas) o ambar (advertencias).

Click para ver:

- Pagos por confirmar
- Check-outs vencidos (huespedes que debieron salir y siguen en curso)
- Habitaciones en limpieza mas de 60 minutos
- Reservas sin pago en proximas 12h
- Mantenimientos pendientes

Click en cualquier alerta te lleva al item.

Las notificaciones se actualizan automaticamente cada 30 segundos.

---

## Cierre de turno

Al final del turno: menu **Pagos > Cierre de caja**.

1. **Desde**: hora de apertura (el sistema precarga la hora del ultimo cierre).
2. El sistema muestra todos los pagos registrados por **ti** en ese periodo, agrupados por metodo y moneda.
3. Si hay pagos por confirmar pendientes, los veras destacados en ambar - es bueno conciliarlos antes de cerrar pero no es obligatorio.
4. Notas del turno (opcional).
5. **Cerrar turno** - genera un registro `CC-YYYY-NNNN` inmutable con tu firma y los totales.
6. **Imprimir** para entregar al supervisor.

Despues del cierre puedes seguir trabajando: el siguiente turno arranca desde el momento del cierre.

---

## Que NO puedes hacer (rol recepcion)

- No puedes ver ni editar tarifas/promociones (es de admin).
- No puedes editar plantillas WhatsApp/Email (admin).
- No puedes ver el audit log.
- No puedes subir extractos bancarios para conciliacion (admin/contabilidad).
- No puedes editar pagos despues de crearlos (solo confirmar/rechazar pendientes).
