# Manuales de usuario — Sistema Hotelero

Documentacion completa por rol y guia de inicio rapido.

## Indice

| # | Documento | Para quien |
|---|---|---|
| 00 | [Inicio rapido](00-inicio-rapido.md) | Cualquiera que instala el sistema |
| 01 | [Manual de recepcion](01-recepcion.md) | Personal de recepcion / front desk |
| 02 | [Manual de limpieza](02-limpieza.md) | Personal de housekeeping |
| 03 | [Manual de contabilidad](03-contabilidad.md) | Contador / administrador financiero |
| 04 | [Manual de admin/superadmin](04-admin-superadmin.md) | Dueño del hotel / IT |

## Por funcionalidad

### Pagos
- Como cobrar rapido → [Recepcion §3](01-recepcion.md#3-registrar-un-pago)
- Conciliar contra el banco → [Contabilidad §2](03-contabilidad.md#2-subir-extracto-bancario-para-conciliacion-masiva)
- Cierre de turno → [Recepcion - Cierre de turno](01-recepcion.md#cierre-de-turno)

### Reservas
- Crear una reserva en menos de 30 segundos → [Recepcion §5](01-recepcion.md#5-crear-una-reserva)
- Ver la vista timeline → [Recepcion - Vista timeline](01-recepcion.md#vista-timeline)
- Cancelar una reserva → [Admin - Resolucion de incidencias](04-admin-superadmin.md#resolucion-de-incidencias)

### Limpieza
- Marcar habitacion como lista → [Limpieza §1](02-limpieza.md#1-terminar-una-limpieza)
- Reportar un problema → [Limpieza §2](02-limpieza.md#2-reportar-un-problema-en-una-habitacion)

### Reportes y KPIs
- KPIs hoteleros (ADR, RevPAR, ocupacion) → [Contabilidad - Reportes](03-contabilidad.md#kpis-hoteleros-arriba)
- Exportar a CSV → [Contabilidad - Exportar](03-contabilidad.md#exportar-a-csv)

### Configuracion del hotel
- Setup inicial paso a paso → [Admin §1-7](04-admin-superadmin.md#setup-inicial-del-hotel-primera-vez)
- Tasa BCV → [Admin - Tasa BCV](04-admin-superadmin.md#tasa-bcv)
- Plantillas WhatsApp → [Admin §4](04-admin-superadmin.md#4-plantillas-whatsapp)

## Atajos de teclado (global)

| Tecla | Accion |
|---|---|
| `Ctrl+K` o `/` | Command palette: busca habitacion, reserva, huesped, pago o acciones |
| `P` | Registrar pago (desde cualquier pantalla) |
| `N` | Nueva reserva |
| `?` | Mostrar todos los atajos |
| `Esc` | Cerrar dialogo |
| `↑` `↓` | Navegar resultados |
| `Enter` | Abrir / confirmar |

## Documentacion tecnica

Para desarrolladores (no para usuarios finales):

- [Vision del producto](../00-vision-producto.md)
- [Esquema de BD](../01-esquema-base-datos.md)
- [Estructura del proyecto](../02-estructura-proyecto.md)
- [Endpoints API](../03-api-endpoints.md)
- [Plan de fases](../04-plan-fases.md)
- [Decisiones tecnicas](../05-decisiones-tecnicas.md)
- [Operacion](../06-operacion.md) (cuando se cree, post-deploy)
