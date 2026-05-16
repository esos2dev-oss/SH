# Manual de contabilidad

Esta guia es para el rol **contabilidad**. Tu enfoque es el cierre financiero: ingresos, egresos, conciliacion bancaria, reportes, exportes.

---

## Acceso

| Menu | Acceso |
|---|---|
| Reservas, Huespedes | Solo lectura (no puedes crear ni editar) |
| **Pagos > Lista** | Confirmar y rechazar pagos |
| **Pagos > Conciliacion bancaria** | Subir extractos, hacer matches |
| **Pagos > Cierre de caja** | Cerrar tu turno y ver cierres de otros usuarios |
| **Pagos > Configuracion** | NO (solo admin) |
| **Finanzas > Ingresos/Egresos** | CRUD completo del ledger |
| **Finanzas > Reportes** | KPIs, exportar CSV |
| Resto | Sin acceso |

---

## Flujo diario

### 1. Confirmar pagos pendientes

Cada mañana revisas los pagos por confirmar:

1. Menu **Pagos > Lista de pagos** → filtro estado: **Por confirmar**.
2. Para cada uno: comparas la **referencia** y el **monto** contra el extracto del banco.
3. Si coincide → boton verde **✓** (confirma). Se contabiliza en el ledger.
4. Si no aparece → boton rojo **✗** (rechaza). Te pide motivo. El asiento contable se anula automaticamente.

### 2. Subir extracto bancario para conciliacion masiva

Si tienes muchos pagos pendientes del dia anterior, en lugar de revisarlos uno a uno:

1. Desde el portal del banco (Banesco, Mercantil, BDV, Provincial, etc.) exporta el estado de cuenta del dia en **CSV o TXT**.
2. Ve a **Pagos > Conciliacion bancaria**.
3. **Banco**: selecciona el que corresponde (Banesco, Mercantil, BDV, Provincial, u "Otro" si es uno no listado — usara detector automatico).
4. **Moneda**: VES o USD segun el banco.
5. **Subir extracto**: selecciona el archivo.
6. El sistema:
   - Parsea las filas y extrae fecha, referencia, monto y tipo (credito/debito).
   - Para cada **credito** intenta encontrar un pago "Por confirmar" con la misma referencia y monto similar (±0.5%) en una ventana de ±3 dias.
   - Te muestra cuantos matchearon automaticamente.
7. Click en el extracto recien subido → veras los movimientos.
8. Para los que NO matchearon: click en **Sugerencias** → el sistema propone pagos candidatos con un score. Si uno es correcto, click en **Match**.
9. Cuando esten todos matcheados: click en **Confirmar matches exactos** → confirma masivamente todos los pagos cuyo match es estricto (misma referencia, mismo monto).

> Los matches manuales **no** confirman automaticamente. Tienes que ir a la lista de pagos y confirmarlos uno a uno (asi mantienes control). El sistema solo confirma masivamente los que tienen match exacto y son sin ambigüedad.

### 3. Registrar ingreso/egreso del ERP

Para gastos del hotel (luz, internet, sueldos, insumos):

1. Menu **Finanzas > Ingresos / Egresos**.
2. **Nuevo asiento**:
   - Tipo: ingreso o egreso.
   - Categoria: alquiler, mantenimiento, sueldos, etc.
   - Fecha, descripcion, monto, moneda.
   - **Sube el comprobante** (factura PDF, recibo en imagen) — obligatorio para egresos.
3. Guardar.

> Los **pagos de reservas** se registran como ingreso AUTOMATICAMENTE en el ledger cuando recepcion los confirma. No los crees manualmente o duplicas.

### 4. Anular un asiento

El ledger es inmutable. Para "anular" un asiento incorrecto:

- **Opcion 1** (preferida si es reciente): crea un **asiento inverso** del mismo monto pero tipo contrario, marcando `reverses_id` en el formulario.
- **Opcion 2** (solo si el pago aun esta pendiente de conciliar): rechaza el pago desde **Pagos > Lista**. Eso anula el ledger automaticamente.

---

## Reportes financieros

Menu **Finanzas > Reportes**.

### KPIs hoteleros (arriba)
- **% Ocupacion**: noches ocupadas / noches disponibles en el rango.
- **ADR** (Average Daily Rate): ingreso por habitacion vendida.
- **RevPAR** (Revenue per Available Room): ingreso por habitacion disponible.
- **Revenue**: total facturado en el rango.

### Por periodo (diario/semanal/mensual)
- Ingresos vs egresos, neto, evolucion temporal.
- Total de reservas en el rango.
- Categorias mas representativas.

### Por metodo de pago
- Cuanto entro por Pago Movil, Zelle, efectivo, etc.
- Confirmados vs por confirmar (por moneda).

### Top tipos de habitacion
- Cuales tipos generan mas revenue.

### Customers
- Top huespedes por gasto historico.
- Segmentacion: VIP (3+ estancias), recientes, inactivos, cumpleanios del mes.

### Exportar a CSV
Boton arriba a la derecha → **Export CSV**. Abre en Excel con encoding UTF-8 (lleva BOM).

---

## Cierre de caja

Igual que recepcion (ver [01-recepcion.md](01-recepcion.md#cierre-de-turno)), pero tu puedes ver los cierres de cualquier usuario en el historial.

---

## Tasa de cambio Bs/USD

**No puedes editarla** — eso es admin. Pero la usas en cada pago en bolivares. Si ves que la tasa esta desactualizada o errada, avisa al admin para que la corrija desde **Pagos > Configuracion**.

Los pagos en VES guardan el `monto_base` en USD calculado con la tasa del momento. Si la tasa cambia despues, los pagos viejos NO se recalculan (eso es contablemente correcto).

---

## Audit log

Si necesitas saber **quien hizo que** y **cuando** (ej. para una conciliacion de fin de mes, o un problema con un pago):

- Menu **Admin > Audit log** (solo si tienes permisos extendidos, normalmente solo admin/superadmin).
- Si no tienes acceso, pidele al admin que extraiga la informacion.

---

## Errores comunes

### "El pago excede el saldo pendiente"
La reserva ya esta pagada completamente (o casi). Revisa el estado de cuenta antes de registrar otro pago.

### "Conversion entre X y Y no soportada"
Solo soportamos VES ↔ USD. Si te llega un pago en EUR u otra moneda, registralo como USD o pide al admin agregar la moneda.

### "No hay tasa de cambio registrada para hoy"
Pide al admin que configure la tasa BCV del dia.

### "Categoria ledger 'alquiler' no encontrada"
Falta el seed. Ejecuta `npm run seed` desde `backend/`.
