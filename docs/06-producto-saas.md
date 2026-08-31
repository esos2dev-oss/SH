# 06 · De sistema a producto: recomendaciones para el SaaS

> Estado: propuesta abierta. Escrito el 30 de agosto de 2026, tras levantar el
> proyecto entero desde cero por primera vez.
>
> Contexto: el sistema deja de ser un desarrollo para un cliente unico (El Pinar)
> y pasa a venderse a hoteles como producto, con **un mes de prueba** y funciones
> limitadas durante ese periodo. Cobro previsto con **Stripe**.

---

## Resumen en una frase

El producto funciona, pero hoy es **un sistema para un hotel**, no una plataforma
para muchos: no existe el concepto de "cliente" en la base de datos, y las reglas
de seguridad no separan los datos de un hotel de los de otro. Todo lo demas
—planes, limites, Stripe, prueba de un mes— se apoya en resolver eso primero.

---

## 1 · Lo que ya juega a favor

Conviene decirlo antes de la lista de pendientes, porque no se parte de cero:

- **El producto esta hecho.** Reservas, check-in/out, limpieza, mantenimiento,
  desayunos, asistencia, caja, conciliacion bancaria, ERP contable, reportes y
  auditoria. Eso es mucho mas de lo que suele tener un PMS que empieza a venderse.
- **Multi-moneda real**, con tasa BCV y conversion a moneda base. Es una ventaja
  competitiva concreta en el mercado venezolano y no es facil de copiar.
- **Roles y permisos** ya existen y estan aplicados en base de datos (RLS), no
  solo en la interfaz. La base sobre la que construir el aislamiento por cliente
  ya esta puesta.
- **Auditoria** con `before`/`after`, IP y user agent. Para vender a hoteles con
  varios empleados esto es un argumento de venta, no un detalle tecnico.
- **Tests**: 90 pruebas en `main` (14 ficheros). No es cobertura completa, pero
  es un habito instalado.
- **`settings` ya es configurable por hotel**: `hotel.nombre`, `hotel.iva_pct`,
  `hotel.moneda_base`, precio y moneda del desayuno. El mecanismo existe; hoy
  la interfaz simplemente no lo usa.

---

## 2 · Bloqueantes, por orden

### 2.1 · Multi-tenancy con pertenencia N:N — CRITICO

**El modelo.** Un usuario puede pertenecer a varios hoteles y un hotel tiene
varios usuarios. Un dueño con tres posadas entra una vez y cambia entre ellas;
una recepcionista puede trabajar en dos hoteles del mismo grupo. Relacion muchos
a muchos, con **un rol distinto en cada hotel**.

**Hoy no existe nada de esto.** Ninguna de las 22 tablas tiene `hotel_id`, y las
politicas RLS filtran solo por rol:

```sql
rooms    | p_rooms_select    | {authenticated} | true
bookings | p_bookings_select | {authenticated} | has_role('superadmin','admin',...)
```

`p_rooms_select` es literalmente `true`. Con un solo hotel es correcto. Con dos,
**el recepcionista del Hotel A ve las reservas, los huespedes y la caja del
Hotel B**. No es un fallo sutil: es el primer dia de produccion. Y no se arregla
filtrando en el frontend: mientras la regla de base de datos diga `true`,
cualquiera con un token consulta la API directamente y lo lee todo.

#### El rol deja de ser una propiedad de la persona

Este es el punto que mas codigo mueve, y es facil no verlo hasta que es tarde.
Hoy el rol vive en `profiles.role`, **un solo valor por persona**:

```sql
has_role(roles) := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true AND role = ANY(roles)
);
```

Con pertenencia N:N esa premisa se cae: la misma persona es `admin` en un hotel y
`recepcion` en otro. El rol pasa a ser una propiedad **de la relacion**
usuario-hotel, no del usuario.

Consecuencia: `has_role()` y `current_role()` hay que reescribirlas para que
resuelvan contra el **hotel activo**, y con ellas **todas las politicas RLS del
sistema**, porque todas las llaman. `profiles.role` se queda, como mucho, para
distinguir al personal de la plataforma (vosotros) de los clientes.

#### Piezas necesarias

1. **`hotels`** — id, nombre, plan, estado de suscripcion, fin de prueba,
   `stripe_customer_id`, `stripe_subscription_id`.
2. **`hotel_members`** — la tabla que materializa el N:N:
   `(hotel_id, user_id, role, invited_by, joined_at)`, clave primaria compuesta
   `(hotel_id, user_id)`. Aqui vive el rol.
3. **`hotel_id`** en todas las tablas de negocio: `rooms`, `room_types`,
   `bookings`, `customers`, `booking_payments`, `ledger_entries`, `cash_closures`,
   `check_ins`, `cleaning_orders`, `maintenance_orders`, `breakfast_orders`,
   `staff_attendance`, `planta_events`, `receipts`, `settings`, `code_sequences`,
   `exchange_rates`, `audit_log`, `bank_statements`.
4. **Hotel activo en la sesion.** Con N:N no basta con "el hotel del usuario":
   hay que saber en cual esta trabajando ahora. Dos opciones:
   - *Claim en el JWT* (`app_metadata.active_hotel`), rapido de leer en RLS pero
     obliga a refrescar el token al cambiar de hotel.
   - *Parametro de sesion* (`set_config('app.hotel_id', ...)`) enviado por el
     cliente en cada conexion. Mas flexible, pero **hay que validar siempre**
     que el usuario pertenece a ese hotel, o cambiar de hotel se convierte en
     "escribe el id que quieras y entra".

   Sea cual sea, la comprobacion de pertenencia va en base de datos. Nunca fiarse
   del id que manda el cliente.
5. **Politicas RLS** con dos condiciones, siempre:

   ```sql
   USING (
     hotel_id = current_hotel_id()                    -- sobre que datos
     AND has_role_in_hotel('admin','recepcion')       -- que puede hacer aqui
   )
   ```

   El hotel dice *sobre que datos*; el rol dice *que puede hacer*. Sin las dos,
   hay fuga o hay bloqueo.
6. **Indices por `hotel_id`** en las tablas grandes (`bookings`,
   `booking_payments`, `audit_log`). Sin ellos, las consultas se degradan segun
   entren clientes.
7. **`code_sequences` por hotel.** Hoy los codigos `BK-2026-0001` son globales:
   dos hoteles compartirian la numeracion de sus reservas y asientos contables.
   Para un contable eso es inaceptable, y ademas revela cuantas reservas tiene el
   vecino.
8. **Storage aislado por ruta** (`{hotel_id}/...`) con politicas acordes. Un
   comprobante de pago lleva datos personales y bancarios.
9. **Invitaciones.** Con N:N hace falta el flujo de "invitar a alguien a mi
   hotel": invitacion por email, aceptacion, y alta en `hotel_members` con rol.
   Ya existe `admin-create-user`, pero crea usuarios sueltos, no miembros.

#### Detalles que muerden luego

- **El ultimo dueño.** Impedir que un hotel se quede sin ningun `owner`, o queda
  huerfano y sin nadie que pueda pagarlo ni invitar.
- **Un email, varios hoteles.** El alta debe distinguir "crear cuenta nueva" de
  "esta persona ya existe, añadela a este hotel". Si no, cuentas duplicadas.
- **Selector de hotel** en la interfaz, y que la app recuerde el ultimo usado.
- **Auditoria por hotel**: `audit_log` tambien lleva `hotel_id`, o un hotel
  acaba viendo la bitacora de otro.
- **Migracion de lo que ya hay**: los datos actuales son de un hotel real. Hay
  que crear su fila en `hotels` y rellenar `hotel_id` en todo antes de poner las
  columnas como `NOT NULL`.

**Coste realista:** es la pieza mas cara del plan y toca todo el sistema, RLS
incluida. Pero hacerla con clientes dentro cuesta varias veces mas, y una fuga de
datos entre hoteles es un incidente del que un producto joven no se recupera.

### 2.2 · Quitar la marca del cliente — BARATO

"El Pinar" esta escrito a mano en **cuatro ficheros del frontend** y tres
migraciones:

| Fichero | Que hay |
|---|---|
| `frontend/index.html` | titulo, descripcion y favicon `logo-pinar.png` |
| `frontend/src/layouts/AppLayout.tsx` | logo + nombre |
| `frontend/src/shared/components/layout/Sidebar.tsx` | logo + nombre |
| `frontend/src/modules/auth/pages/LoginPage.tsx` | logo + nombre (dos veces) |

La solucion no es borrarlo y poner otro literal, sino **leerlo de `settings`**,
que ya tiene la clave `hotel.nombre`. Cada hotel vera el suyo, que es lo que un
SaaS necesita. Como fallback, el nombre del producto.

Ademas, `hotel.nombre` vale hoy `"TODO — completar"`: en cuanto se muestre en
pantalla, hay que exigirlo en el alta del hotel.

**Marca blanca como funcion de pago.** El logo propio del hotel encaja de forma
natural como funcion de plan superior: en el plan basico se ve la marca del
producto, en el plan de pago el hotel sube su logo. Se implementa una vez y
sirve de argumento comercial.

Las tres migraciones (`habitaciones_reales`, `precios_eur_y_tipos_reales`,
`seed_100_records_demo`) contienen las 17 cabañas reales de El Pinar. **No deben
formar parte del producto**: son datos de un cliente. Su sitio es un seed de
demostracion aparte, con datos genericos.

### 2.3 · Planes, limites y prueba de un mes

Nada de esto existe todavia. Decisiones a tomar antes de programar:

**Que se limita durante la prueba.** La eleccion importa mas de lo que parece.
Limitar por *tiempo* y no por *datos* es lo mas honesto: el hotel usa el sistema
completo un mes y decide con criterio. Si ademas se limita el numero de
habitaciones o se ocultan modulos, la prueba no demuestra nada y el hotel no
sabe que esta comprando.

Sugerencia concreta: **prueba completa de 30 dias, sin recortes**, y limitar solo
lo que cuesta dinero real (envio de emails masivos, almacenamiento de
comprobantes) o lo que solo tiene sentido en plan alto (marca blanca,
usuarios ilimitados, integraciones).

**Que pasa al terminar la prueba.** Es la decision de producto mas delicada:

- **Nunca borrar datos.** Un hotel que no paga a tiempo y pierde su libro de
  reservas no vuelve, y lo cuenta.
- Modo **solo lectura**: puede consultar y exportar, no crear reservas. Presiona
  a pagar sin destruir nada.
- Exportacion completa siempre disponible (CSV/PDF). Ademas de ser lo correcto,
  en Europa es una obligacion legal (portabilidad de datos).
- Retencion definida y avisada: por ejemplo, datos conservados 90 dias tras la
  baja y luego eliminados, avisando por email antes.

**Como se aplican los limites.** En base de datos, no en la interfaz. Si el
limite vive solo en React, se salta llamando a la API. Lo mismo que el
aislamiento: la regla tiene que estar donde estan los datos.

### 2.4 · Stripe

No hay nada implementado todavia (`grep` de "stripe" no devuelve una sola linea
de codigo). Arquitectura recomendada, alineada con lo que ya hace el proyecto:

1. **Stripe Checkout** para el alta. No construir formularios de tarjeta propios:
   evita cargar con el cumplimiento PCI y funciona mejor.
2. **Webhook en Edge Function** para `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted` e
   `invoice.payment_failed`. Ese webhook es la **unica fuente de verdad** del
   estado de la suscripcion: nunca marcar un hotel como "pagado" desde el
   frontend tras una redireccion, porque el usuario puede no volver o manipular
   la vuelta.
3. **Verificar la firma del webhook** con `stripe.webhooks.constructEvent` y el
   secreto. Sin eso, cualquiera que conozca la URL activa suscripciones gratis.
4. **Idempotencia**: Stripe reintenta. Guardar el `event.id` procesado y
   descartar duplicados, o una caida temporal genera cobros o altas repetidas.
5. **Claves**: `STRIPE_SECRET_KEY` y el secreto del webhook **solo** en el
   servidor. En el frontend, unicamente la clave publicable. Cualquier variable
   `VITE_*` acaba en el bundle publico: lo comprobamos en este proyecto y las
   variables `VITE_` estan efectivamente incrustadas en el JS compilado.
6. **Periodo de prueba en Stripe** (`trial_period_days: 30`), no como fecha
   calculada a mano. Que Stripe lleve el calendario evita discrepancias entre lo
   que cobra y lo que el sistema cree.
7. **Trial sin tarjeta** vs **con tarjeta**: sin tarjeta entra mas gente y
   convierte peor; con tarjeta entra menos y convierte mejor. Para un producto
   nuevo y desconocido, empezar **sin tarjeta** suele ser mejor: el problema
   ahora es que nadie lo conoce, no filtrar curiosos.
8. **Impuestos**: si se factura a hoteles en varios paises, mirar Stripe Tax
   pronto. Rehacer la facturacion despues es doloroso.

---

## 3 · Lo que falta y no es obvio

Ordenado por lo que mas duele si se descubre tarde.

### 3.1 · Alta autonoma de hoteles

Hoy los usuarios se crean con una funcion de administrador, uno a uno, y el
registro publico esta desactivado. Para vender hace falta que un hotel pueda
registrarse solo: crear cuenta, crear su hotel, definir sus tipos de habitacion
y sus habitaciones, y empezar. Sin eso, cada cliente nuevo es trabajo manual
vuestro y el producto no escala.

Incluye un asistente de primeros pasos: nombre del hotel, moneda base, IVA,
habitaciones. Son los mismos datos que ya existen en `settings`.

### 3.2 · Copias de seguridad y recuperacion

No hay nada documentado. Con datos de un solo cliente es un riesgo asumido; con
datos de pago de decenas de hoteles es negligencia. Hace falta: copias
automaticas, **prueba real de restauracion** (una copia que nunca se ha
restaurado no es una copia), y un objetivo declarado de cuanto se puede perder.

### 3.3 · Integracion continua

No hay `.github/workflows`. Los 90 tests de `main` solo corren si alguien se
acuerda. Con dos personas tocando el mismo codigo —y ya ha pasado— eso falla.
Un flujo minimo que ejecute `npm test` y el typecheck en cada push cuesta media
hora y evita justo la clase de choque que provoco el PR #1.

Recordatorio: el script `lint` esta roto (`tsc -b --noEmit` es invalido con
proyectos referenciados). Arreglarlo antes de meterlo en CI.

### 3.4 · Aspectos legales

Vender a empresas en Europa y Venezuela obliga a cosas que no son codigo pero
bloquean la venta: terminos del servicio, politica de privacidad, contrato de
encargado de tratamiento (el hotel es responsable de los datos de sus huespedes;
vosotros sois el encargado), y ubicacion declarada de los datos. Un hotel con
asesoria juridica lo preguntara en la primera reunion.

### 3.5 · Emails transaccionales

Hoy el correo es solo el buzon local de desarrollo. Un SaaS necesita: bienvenida,
verificacion, recuperacion de contraseña, aviso de fin de prueba (a 7 dias, a 1
dia), fallo de cobro y recibo. El aviso de fin de prueba es, ademas, una de las
palancas de conversion mas eficaces que existen.

### 3.6 · Observabilidad

Sin registro de errores centralizado no os enterareis de los fallos: os los
contara el cliente, o no os los contara y se ira. Con Sentry ya presente en las
dependencias del backend archivado, la pieza esta medio hecha.

Ademas hace falta metrica de producto: cuantos hoteles en prueba, cuantos
convierten, en que pantalla se atascan. Sin eso, las decisiones de producto son
opiniones.

### 3.7 · Rendimiento con datos reales

Las pruebas van con 40 reservas. Un hotel de 17 habitaciones genera unas 6.000 al
año, y el sistema debe seguir respondiendo con varios hoteles y varios años. La
vista de ocupacion y el timeline son las candidatas a degradarse primero. Merece
una prueba con datos sinteticos abundantes antes de vender, no despues.

---

## 4 · Riesgos que se arrastran

Estos no son del producto nuevo, vienen de antes, y conviene cerrarlos antes de
construir encima:

1. **El repositorio no reconstruye la base de datos.** Se comprobo hoy: ni `main`
   ni la rama de julio arrancan desde cero. `main` fallaba en el endurecimiento
   de seguridad (`current_exchange_rate` no existe); la rama de julio, en el
   enum `restaurante` que se aplico a mano en remoto y nunca se commiteo. Ambas
   quedaron parcheadas, pero el sintoma de fondo es que **el esquema real solo
   existe en produccion**. Un SaaS necesita poder crear un entorno limpio a
   voluntad, y eso hoy no se podia.
2. **El PR #1 sigue sin integrar**, con 11 conflictos reales y una decision
   pendiente (rutas en ingles o en español). Cuanto mas se tarde, mas cara sale.
3. **Un token de acceso personal de Supabase** vive en las variables de entorno
   del equipo de desarrollo. Si se abandona Supabase, debe revocarse.

---

## 5 · Orden sugerido

1. **Limpiar la marca** y hacer que el nombre salga de `settings`. Barato, y
   convierte el sistema en producto a ojos de cualquiera que lo vea.
2. **Cerrar el PR #1** y dejar una sola rama viva. Construir el SaaS sobre dos
   ramas divergentes multiplica el trabajo.
3. **Integracion continua** con los tests que ya existen. Media hora, protege
   todo lo demas.
4. **Multi-tenancy**: `hotels`, `hotel_id`, politicas RLS y aislamiento de
   ficheros. La pieza grande, y todo lo de negocio depende de ella.
5. **Planes, limites y estado de suscripcion** en base de datos.
6. **Stripe**: Checkout, webhook firmado e idempotente, prueba de 30 dias.
7. **Alta autonoma** y asistente de primeros pasos.
8. **Emails del ciclo de vida**, con el aviso de fin de prueba como prioridad.
9. **Copias de seguridad probadas** y registro de errores.

Los pasos 1 a 3 se pueden hacer esta semana. El 4 es el proyecto de verdad.

---

## 6 · Precio

### 6.1 · Que cobra el mercado (agosto 2026)

**Internacionales**, todos por habitacion y mes:

| Producto | Precio | Notas |
|---|---|---|
| Mews | 8–15 USD/hab core; 15–25+ con modulos | precio a medida, no publicado |
| Cloudbeds | desde ~15 USD/hab | minimo mensual por propiedad |
| Little Hotelier | desde ~15 USD/hab | pensado para menos de 30 habitaciones |
| Gama de entrada | 1–5 USD/hab | funcionalidad reducida |

Un dato revelador: **una propiedad de 12 habitaciones acaba pagando cerca de
25 USD por habitacion con un minimo de ~300 USD/mes**, porque los minimos por
propiedad castigan justo a los pequeños.

**Latinoamerica**, mas barato y con tendencia a tarifa plana:

| Producto | Precio |
|---|---|
| Sentaury | desde 50 USD/mes |
| Mercado peruano | desde S/100/mes (~27–30 USD) |
| Software Hotelero (Mexico) | pago unico ~16.000 MXN (licencia perpetua) |

### 6.2 · Por habitacion o tarifa plana

**Tarifa plana por hotel.** Las fuentes coinciden en que para 10–20 habitaciones
la tarifa fija es mas conveniente y predecible, y que los pequeños prefieren
previsibilidad a escalado por volumen.

Ademas, el precio por habitacion tiene un efecto perverso: penaliza justo al
cliente que mas crece contigo, y obliga a explicar la factura cada vez que el
hotel abre una habitacion. Con tarifa plana por tramos, el hotel sabe lo que
paga y solo cambia de precio cuando cambia de liga.

### 6.3 · Precios recomendados

Tres tramos, tarifa plana mensual por hotel, en **USD**:

| Plan | Hasta | Precio/mes | Anual (2 meses gratis) |
|---|---|---|---|
| **Esencial** | 12 habitaciones | **19 USD** | 190 USD |
| **Profesional** | 30 habitaciones | **39 USD** | 390 USD |
| **Grupo** | 80 habitaciones | **79 USD** | 790 USD |

Economico, pero no regalado: sigue estando **muy por encima** de la gama de
entrada (1–5 USD/hab, funcionalidad recortada) y **muy por debajo** del
internacional. Es el tramo donde el hotel no se lo piensa y el producto se
sostiene.

Con pertenencia N:N, **se cobra por hotel, no por cuenta**: el valor escala con
el hotel, no con el numero de personas que entran. Un dueño con tres posadas
paga tres suscripciones — con **20% de descuento a partir del segundo hotel**,
que premia al que crece contigo y hace muy incomodo cambiarse de sistema.

Los usuarios **no se cobran aparte**. Cobrar por usuario en un hotel empuja a
compartir credenciales, y eso destruye justo lo que hace valioso al producto:
la auditoria de quien hizo que.

### 6.4 · Por que estos numeros

**Contra el internacional.** Una posada de 17 habitaciones:

- Cloudbeds o Little Hotelier: 17 × 15 = **255 USD/mes**
- Este sistema, plan Profesional: **59 USD/mes**

Cuatro veces mas barato, y con funciones que ellos **no tienen**: bolivares con
tasa BCV, Pago Movil, Zelle y conciliacion bancaria. Esa comparacion se explica
en una frase y se entiende sin ser tecnico.

**El anclaje que cierra ventas.** Una posada que cobra 40–60 USD la noche:

> El sistema cuesta **una noche de una habitacion al mes**.

Ese es el argumento. No hay que justificar nada mas: un solo sobreventa evitado,
un descuadre de caja detectado o una hora de administracion ahorrada a la semana
ya lo paga. Y para el hotelero es una decision de cabeza, no de bolsillo.

**Por que no mas barato.** La tentacion de poner 9 o 15 USD es fuerte y es un
error:

- Un precio muy bajo atrae clientes que no valoran el producto, dan mas soporte
  y se van igual.
- No sostiene el coste real (servidores, copias de seguridad, soporte, Stripe).
- **En SaaS es facil bajar precios y muy dificil subirlos.** Empezar en 29 y
  bajar a 19 si no entra nadie es viable; empezar en 15 y subir a 39 con
  clientes dentro genera bajas y mala sangre.
- Un precio demasiado bajo comunica "esto es un experimento". A un hotel que va
  a meter ahi su contabilidad, eso le da miedo, no confianza.

Si hace falta agresividad comercial, mejor **descuento de lanzamiento explicito
y temporal** ("50% los primeros 6 meses para los 20 primeros hoteles") que un
precio de lista bajo. El descuento caduca; el precio de lista se queda.

### 6.5 · Moneda y cobro

- **Precios de lista en USD.** Con la inflacion del bolivar, cualquier otra cosa
  obliga a revisar tarifas constantemente.
- **Aceptar pago en bolivares** al cambio del dia. El sistema ya sabe hacer esa
  conversion: es literalmente su especialidad. Un hotel que no puede pagar con
  tarjeta internacional no deberia quedarse fuera.
- **Facturacion anual con dos meses gratis**: mejora la caja desde el principio
  y reduce las bajas, que es el problema numero uno de un SaaS joven.

### 6.6 · Que limitar por plan

Los tramos ya se diferencian por tamaño. Si hace falta mas separacion, lo que
tiene sentido reservar a planes altos:

- **Marca blanca** (logo propio del hotel) — encaja de forma natural.
- **Varios hoteles bajo una cuenta** con vista consolidada.
- **Retencion de auditoria**: 6 meses en Esencial, ilimitada en Profesional.
- **Almacenamiento de comprobantes**, que tiene coste real.

Lo que **no** conviene limitar: numero de usuarios, numero de reservas, ni los
modulos operativos. Recortar ahi hace que el hotel no pueda trabajar, y un PMS
a medias no es un PMS.

---

## 7 · Una recomendacion de producto, no tecnica

El sistema tiene una funcion que casi ningun competidor internacional trae:
**pagos en bolivares con tasa BCV, Pago Movil, Zelle y conciliacion bancaria**.
Los PMS grandes no cubren bien ese mercado.

Merece la pena que eso sea el centro del mensaje comercial y no un apartado mas
de la lista. Un hotel venezolano que hoy lleva la caja en papel o en una hoja de
calculo entiende de inmediato el valor de cuadrar los cobros en dos monedas. Y
ese hotel es mucho mas facil de convencer que uno que ya paga por otro sistema.
