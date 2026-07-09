// Manual de usuario integrado en la plataforma.
// Cada capitulo tiene un anchor. La columna izquierda permite navegacion
// rapida y resalta el activo segun scroll.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Bed, CalendarBlank, UserCircle, CurrencyCircleDollar, ChartLineUp,
  Gear, ClipboardText, Question, House, ListBullets, Keyboard,
  Lifebuoy, BookOpen,
} from '@phosphor-icons/react';
import { PageHeader } from '../../../shared/components/ui/PageHeader';

interface Section {
  id: string;
  title: string;
  icon: typeof Bed;
  body: JSX.Element;
}

const SECTIONS: Section[] = [
  {
    id: 'inicio',
    title: 'Antes de empezar',
    icon: BookOpen,
    body: (
      <>
        <h3>¿Quien puede entrar y que puede hacer cada rol?</h3>
        <table>
          <thead><tr><th>Rol</th><th>Que hace en la practica</th></tr></thead>
          <tbody>
            <tr><td><b>superadmin</b></td><td>Configura el sistema entero. Unico que crea/edita/desactiva usuarios y cambia contrasenas. Acceso a todo.</td></tr>
            <tr><td><b>admin</b></td><td>Manda la operacion: tipos de habitacion, tarifas, reportes ejecutivos, conciliacion bancaria. No gestiona usuarios.</td></tr>
            <tr><td><b>recepcion</b></td><td>Dia a dia con el huesped: crea reservas, hace check-in / check-out, registra pagos, atiende clientes.</td></tr>
            <tr><td><b>limpieza</b></td><td>Solo ve las habitaciones pendientes de limpieza y las marca como disponibles cuando terminan.</td></tr>
            <tr><td><b>contabilidad</b></td><td>ERP del hotel: ingresos/egresos, conciliacion, cierre de caja, reportes financieros. No toca la operacion.</td></tr>
          </tbody>
        </table>

        <h3>Iniciar sesion</h3>
        <ol>
          <li>Abre el navegador en la URL del hotel.</li>
          <li>Email + contrasena (te las da el superadmin).</li>
          <li>Click <b>Iniciar sesion</b>.</li>
        </ol>
        <p>Si la contrasena no funciona, pidele al superadmin que la resetee desde <b>Configuracion → Usuarios → Cambiar pass</b>.</p>

        <h3>Cerrar sesion</h3>
        <p>Esquina inferior izquierda → click sobre tu nombre → icono de logout (flecha que sale).</p>

        <h3>Cambiar tu propia contrasena</h3>
        <p>Esquina inferior izquierda → <b>Configuracion → Mi perfil</b> → escribe la nueva contrasena → <b>Guardar</b>.</p>

        <h3>Tema claro/oscuro</h3>
        <p>Esquina inferior izquierda → <b>Modo claro</b> / <b>Modo oscuro</b>. Se guarda en tu navegador.</p>
      </>
    ),
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: House,
    body: (
      <>
        <p>Primer panel al entrar. Contiene:</p>
        <ul>
          <li><b>KPIs del dia:</b> llegadas, salidas, % ocupacion, pagos pendientes, habitaciones para limpiar.</li>
          <li><b>Llegadas de hoy:</b> los huespedes que entran. Click → detalle de su reserva.</li>
          <li><b>Salidas de hoy:</b> los que se van. Saldo pendiente en rojo si aplica.</li>
          <li><b>Habitaciones en limpieza</b> con tiempo en ese estado.</li>
          <li><b>Cumpleanos del dia:</b> clientes que cumplen anos hoy.</li>
          <li><b>Inbox de pagos por confirmar:</b> Pago Movil/Zelle pendientes de validacion bancaria.</li>
          <li><b>Reservas por cobrar</b> (proximas 48h sin pago registrado).</li>
          <li><b>Tablero de habitaciones en vivo.</b></li>
        </ul>
        <p>Botones rapidos: <b>Nueva reserva</b>, <b>Registrar pago</b>, <b>Check-in</b>.</p>
      </>
    ),
  },
  {
    id: 'habitaciones',
    title: 'Habitaciones',
    icon: Bed,
    body: (
      <>
        <h3>Panel</h3>
        <p>Vista grid con todas las cabanas. Cada tarjeta muestra numero, tipo y estado (color).</p>
        <p><b>Estados:</b></p>
        <ul>
          <li><b className="text-emerald-600">disponible</b> — lista para nuevo huesped</li>
          <li><b className="text-blue-600">ocupada</b> — huesped dentro</li>
          <li><b className="text-amber-600">limpieza</b> — pendiente de aseo tras checkout</li>
          <li><b className="text-orange-600">mantenimiento</b> — falla reportada</li>
          <li><b className="text-muted-foreground">fuera_servicio</b> — no disponible</li>
        </ul>
        <p>Click sobre una cabana → cambiar estado. Editar (admin/superadmin): numero, tipo, foto, notas.</p>
        <p><b>Filtros:</b> por estado y busqueda por numero.</p>

        <h3>Tipos y tarifas</h3>
        <p>Solo admin/superadmin. Lista de tipos de cabana (matrimonial sencilla/grande/doble y cabanas de 3 a 7 personas) con tarifas dia/semana/mes y capacidad.</p>
        <p>Crear: nombre, slug interno, descripcion, capacidad, tarifa en <b>USD</b> y opcional en <b>Bs</b> por cada periodo, moneda, amenities. Si no rellenas el precio en Bs, el sistema convierte automaticamente usando la tasa BCV del dia.</p>
        <p>Editar: cambia precios sin afectar reservas confirmadas (cada reserva guarda su tarifa aplicada).</p>

        <h3>Limpieza</h3>
        <p>Vista filtrada de habitaciones en estado <b>limpieza</b>. Pensado para el personal:</p>
        <ol>
          <li>Ve cuartos pendientes.</li>
          <li>Click → <b>Marcar como disponible</b> cuando termina.</li>
          <li>El sistema cierra la orden de limpieza automaticamente.</li>
        </ol>
      </>
    ),
  },
  {
    id: 'reservas',
    title: 'Reservas',
    icon: CalendarBlank,
    body: (
      <>
        <h3>Lista</h3>
        <p>Tabla con todas las reservas. Columnas: codigo (BK-YYYY-NNNN), huesped, habitacion, fechas, importe, estado, pago.</p>
        <p><b>Estados:</b> pendiente · confirmada · en_curso · finalizada · cancelada · no_show.</p>
        <p>Filtros: estado, rango de fechas, busqueda por codigo.</p>

        <h3>Crear reserva</h3>
        <p>Boton <b>Nueva reserva</b> o tecla <kbd>N</kbd>.</p>
        <ol>
          <li><b>Huesped:</b> buscar por documento/nombre. Si no existe, crearlo inline.</li>
          <li><b>Habitacion:</b> elegir periodo (dia/semana/mes) + rango → aparecen solo las disponibles. Tarifa se calcula sola.</li>
          <li><b>Huespedes:</b> no puede exceder capacidad.</li>
          <li><b>Descuento:</b> opcional, % o monto fijo.</li>
          <li><b>Pago inicial:</b> opcional, queda enlazado a la reserva.</li>
          <li><b>Notas.</b></li>
        </ol>
        <p>El sistema valida que la habitacion no este tomada en ese rango.</p>

        <h3>Detalle</h3>
        <p>Click sobre una fila. Veras datos del huesped, resumen, botones segun estado: <b>Confirmar</b>, <b>Check-in</b>, <b>Cancelar</b>, <b>No-show</b>, <b>Mover</b>. Historial de pagos. Boton <b>Registrar pago</b>.</p>

        <h3>Calendario</h3>
        <p>Vista mensual. Cada barra es una reserva. Click → detalle.</p>

        <h3>Timeline (Gantt)</h3>
        <p>Cada fila es una habitacion, cada barra una reserva. Drag &amp; drop para mover entre habitaciones o ajustar fechas.</p>
      </>
    ),
  },
  {
    id: 'huespedes',
    title: 'Huespedes',
    icon: UserCircle,
    body: (
      <>
        <h3>Lista</h3>
        <p>Tabla con nombre, documento, telefono, total estancias y total gastado (acumulado confirmado).</p>
        <p>Busqueda por nombre/documento/email/telefono.</p>

        <h3>Crear / editar huesped</h3>
        <p>Campos:</p>
        <ul>
          <li>Nombres, apellidos</li>
          <li>Tipo de documento (cedula, pasaporte, DNI, licencia, otro) + numero unico</li>
          <li>Email, telefono</li>
          <li>Fecha de nacimiento (alimenta cumpleanos del dashboard)</li>
          <li>Nacionalidad, direccion</li>
          <li><b>Placa de vehiculo</b> por defecto</li>
          <li><b>¿Como nos conocio?</b> instagram, facebook, google, recomendacion, calle, recurrente, otro</li>
          <li>Acepta marketing, notas internas</li>
        </ul>

        <h3>Detalle</h3>
        <p>Click sobre una fila. Veras datos completos, timeline de estancias, estado de cuenta consolidado (cargos vs pagos), botones <b>Editar</b> y <b>Registrar pago suelto</b>.</p>
      </>
    ),
  },
  {
    id: 'checkin',
    title: 'Check-in y check-out',
    icon: ClipboardText,
    body: (
      <>
        <h3>Check-in</h3>
        <p>Desde detalle de reserva en estado <b>confirmada</b> o <b>pendiente</b> → boton <b>Check-in</b>.</p>
        <ol>
          <li>Confirmar identidad del huesped.</li>
          <li>Si hay saldo pendiente, el sistema avisa y pide confirmacion (puedes cobrarlo en el mismo flujo).</li>
          <li>Subir foto/PDF del documento (opcional pero recomendado).</li>
          <li>Capturar firma (opcional).</li>
          <li>Acompanantes: nombre + documento de cada uno (hasta el numero de huespedes registrado).</li>
          <li>Observaciones (opcional).</li>
          <li><b>Confirmar check-in.</b></li>
        </ol>
        <p>Automatico: reserva → <b>en_curso</b>, habitacion → <b>ocupada</b>, audit log.</p>

        <h3>Check-out</h3>
        <p>Desde detalle de reserva en estado <b>en_curso</b> → boton <b>Check-out</b>.</p>
        <ol>
          <li>Revisar saldo pendiente. Si hay, cobrar antes.</li>
          <li>Observaciones para limpieza (ej: "grifo flojo").</li>
          <li><b>Confirmar check-out.</b></li>
        </ol>
        <p>Automatico: reserva → <b>finalizada</b>, habitacion → <b>limpieza</b>, se crea orden de limpieza, audit log.</p>
      </>
    ),
  },
  {
    id: 'pagos',
    title: 'Pagos',
    icon: CurrencyCircleDollar,
    body: (
      <>
        <h3>Lista de pagos</h3>
        <p>Columnas: monto, metodo, referencia, estado (confirmado / por confirmar / rechazado), fecha, reserva o huesped.</p>
        <p>Filtros: estado, metodo, busqueda por referencia, rango de fechas.</p>
        <p>Click sobre un pago → ver detalle, confirmar o rechazar.</p>

        <h3>Registrar pago</h3>
        <p>Boton flotante <b>Registrar pago</b> o tecla <kbd>P</kbd>.</p>
        <ol>
          <li><b>Para que es:</b> buscar reserva por codigo o huesped por nombre/documento.</li>
          <li><b>Monto y moneda</b> (USD por defecto, Bs si cobras en bolivares).</li>
          <li><b>Metodo:</b> Efectivo USD/Bs, Tarjeta/Punto venta, Transferencia, Pago Movil, Zelle, PayPal, Otro.</li>
          <li><b>Tasa de cambio</b> si cobras en Bs (precarga BCV del dia).</li>
          <li><b>Comprobante:</b> subir foto/captura.</li>
          <li><b>Estado:</b> efectivo/tarjeta quedan confirmados; Pago Movil/Zelle/transferencia quedan <b>por confirmar</b>.</li>
          <li><b>Notas.</b></li>
        </ol>

        <h3>Conciliacion bancaria</h3>
        <p>Para contabilidad/admin. Sube el extracto del banco → lista movimientos → empareja contra pagos pendientes (manual o sugerencias automaticas).</p>
        <p><b>Auto-confirmar matches con alta confianza</b> para procesar varios de golpe.</p>

        <h3>Cierre de caja</h3>
        <p>Al final del turno. Define rango → totales por metodo y moneda → notas → <b>Cerrar turno</b> (codigo CC-YYYY-NNNN, snapshot inmutable).</p>

        <h3>Configuracion</h3>
        <p>Tasa BCV diaria (precarga los cobros en Bs) y datos del hotel para Pago Movil (banco, cedula, telefono, titular).</p>
      </>
    ),
  },
  {
    id: 'finanzas',
    title: 'Finanzas',
    icon: ChartLineUp,
    body: (
      <>
        <h3>Ingresos / Egresos (ledger)</h3>
        <p>Para contabilidad/admin. Lista asientos contables. Cada asiento tiene codigo (LG-YYYY-NNNN), tipo, categoria, descripcion, monto, fecha, estado.</p>
        <p><b>Crear asiento manual:</b> tipo (ingreso/egreso), categoria, fecha, descripcion, monto, moneda, metodo, opcional enlazar a reserva/huesped, <b>subir comprobante</b> (obligatorio en egresos).</p>
        <p><b>Importante:</b> los asientos son inmutables. Si te equivocas, se hace un <b>asiento inverso</b> (boton <b>Anular</b>).</p>
        <p>Los cobros confirmados generan ingresos automaticamente.</p>

        <h3>Reportes</h3>
        <p>Atajos: <b>Hoy</b>, <b>Esta semana</b>, <b>Este mes</b>, <b>Este ano</b>.</p>
        <p>Indicadores:</p>
        <ul>
          <li><b>Ocupacion %</b> — habitaciones-noche vendidas vs disponibles.</li>
          <li><b>ADR</b> (Average Daily Rate) — tarifa promedio por noche vendida.</li>
          <li><b>RevPAR</b> — ingreso por habitacion disponible.</li>
          <li><b>Top tipos</b> por ingresos.</li>
          <li><b>Ingresos vs egresos</b> con grafico.</li>
          <li><b>Por metodo de pago.</b></li>
          <li><b>Top clientes</b> por gasto.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'usuarios',
    title: 'Configuracion → Usuarios',
    icon: Gear,
    body: (
      <>
        <p><b>Solo superadmin.</b></p>

        <h3>Crear usuario</h3>
        <p>Boton <b>Nuevo usuario</b>. Completas:</p>
        <ol>
          <li>Nombre completo.</li>
          <li>Email (sera su usuario para login).</li>
          <li>Rol.</li>
          <li><b>Contrasena</b> (minimo 8 caracteres). Se la das al usuario en mano/WhatsApp.</li>
          <li><b>Crear usuario.</b> Ya puede entrar.</li>
        </ol>
        <p>Buena practica: pidele al usuario que la cambie desde <b>Mi perfil</b> en su primer login.</p>

        <h3>Cambiar contrasena</h3>
        <p>Boton <b>Cambiar pass</b> al lado del usuario → escribes la nueva → se actualiza al instante.</p>

        <h3>Desactivar / reactivar</h3>
        <p><b>Desactivar:</b> no podra iniciar sesion, historial intacto. <b>Reactivar:</b> vuelve a poder entrar.</p>
        <p>Los usuarios no se borran fisicamente, solo se desactivan (para no perder el rastro en audit log).</p>
      </>
    ),
  },
  {
    id: 'audit',
    title: 'Audit log',
    icon: ListBullets,
    body: (
      <>
        <p>Solo superadmin/admin. Registro de todas las acciones sensibles: logins, cambios de rol/estado, creacion/cancelacion de reservas, pagos confirmados/rechazados, anulaciones.</p>
        <p>Cada entrada: quien, que hizo, sobre que, antes/despues (JSON), IP, user agent.</p>
        <p>Filtros: usuario, accion, entidad, rango de fechas.</p>
      </>
    ),
  },
  {
    id: 'atajos',
    title: 'Atajos de teclado',
    icon: Keyboard,
    body: (
      <>
        <table>
          <thead><tr><th>Tecla</th><th>Accion</th></tr></thead>
          <tbody>
            <tr><td><kbd>Ctrl</kbd> + <kbd>K</kbd></td><td>Buscador rapido (habitaciones, reservas, huespedes)</td></tr>
            <tr><td><kbd>N</kbd></td><td>Nueva reserva</td></tr>
            <tr><td><kbd>P</kbd></td><td>Registrar pago</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Cerrar dialog actual</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'Preguntas frecuentes',
    icon: Question,
    body: (
      <>
        <h3>Una habitacion esta marcada como ocupada pero el huesped ya se fue.</h3>
        <p>Ve al detalle de la reserva y haz el check-out manual.</p>

        <h3>¿Puedo editar una reserva ya confirmada?</h3>
        <p>Si, pero limitado: huespedes, notas, mover habitacion/fechas. No puedes cambiar tarifa — para eso cancela y crea nueva.</p>

        <h3>El huesped pago por Pago Movil pero no aparece en el extracto.</h3>
        <p>El pago queda <b>por confirmar</b> hasta que coincida con el extracto. Puedes confirmarlo manualmente si verificas el SMS del banco.</p>

        <h3>¿Como cobro la mitad ahora y la mitad al check-out?</h3>
        <p>Registra un pago parcial. La reserva pasara a <b>parcial</b>. Cuando registres el resto pasara a <b>pagado</b>. Puedes hacer check-in con saldo pendiente.</p>

        <h3>¿Como aplico un descuento a un cliente recurrente?</h3>
        <p>Al crear la reserva, usa el campo <b>descuento</b> (% o monto fijo). El total se recalcula solo.</p>

        <h3>¿Quien puede ver los reportes financieros?</h3>
        <p>Admin, superadmin y contabilidad. Recepcion y limpieza no tienen acceso.</p>

        <h3>Olvide mi contrasena.</h3>
        <p>Pidele al superadmin que la resetee desde <b>Configuracion → Usuarios → Cambiar pass</b>.</p>

        <h3>¿Funciona en movil?</h3>
        <p>Si, responsive. Las pantallas operativas (limpieza, registrar pago, check-in) son las mas optimizadas para movil.</p>
      </>
    ),
  },
  {
    id: 'soporte',
    title: 'Soporte',
    icon: Lifebuoy,
    body: (
      <>
        <ul>
          <li><b>Desarrollo:</b> Buggin.dev — contacto@buggin.dev — +58 414 927 4827</li>
          <li><b>Propietario:</b> Manuel Casas</li>
        </ul>
        <p>Cuando reportes un problema, incluye:</p>
        <ol>
          <li>Que intentabas hacer.</li>
          <li>Que paso (mensaje de error si hay).</li>
          <li>Email/usuario con el que entraste.</li>
          <li>Captura de pantalla si es posible.</li>
        </ol>
      </>
    ),
  },
];

export default function HelpPage() {
  const location = useLocation();
  const [active, setActive] = useState<string>(SECTIONS[0]!.id);
  const refs = useRef<Map<string, HTMLElement>>(new Map());

  // Si llega con hash (#dashboard), hacer scroll a esa seccion al cargar.
  useEffect(() => {
    const hash = location.hash?.slice(1);
    if (hash && refs.current.has(hash)) {
      refs.current.get(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(hash);
    }
  }, [location.hash]);

  // IntersectionObserver para resaltar la seccion visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0]!.target.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    refs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function scrollTo(id: string) {
    const el = refs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${id}`);
    }
  }

  const toc = useMemo(() => SECTIONS, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manual de usuario"
        subtitle="Guia rapida del Sistema Hotelero. Click en cualquier capitulo para saltar."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* TOC izquierda */}
        <nav className="lg:sticky lg:top-4 self-start">
          <div className="bg-card rounded-2xl border border-border p-3 max-h-[calc(100vh-120px)] overflow-y-auto">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 mb-2">Indice</p>
            <ul className="space-y-0.5">
              {toc.map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(s.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] text-left transition-all ${
                        active === s.id
                          ? 'bg-primary/10 text-primary font-bold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Icon size={14} weight={active === s.id ? 'duotone' : 'regular'} className="flex-shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Contenido */}
        <div className="space-y-6 min-w-0">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <section
                key={s.id}
                id={s.id}
                ref={(el) => {
                  if (el) refs.current.set(s.id, el);
                }}
                className="bg-card rounded-3xl border border-border p-6 md:p-8 scroll-mt-4"
              >
                <header className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Icon size={20} weight="duotone" />
                  </div>
                  <h2 className="text-xl font-extrabold tracking-tight">{s.title}</h2>
                </header>
                <div className="prose prose-sm dark:prose-invert max-w-none
                  prose-headings:font-bold prose-headings:tracking-tight
                  prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
                  prose-p:my-2 prose-p:text-[13.5px] prose-p:leading-relaxed
                  prose-ul:my-2 prose-ul:text-[13.5px] prose-ol:my-2 prose-ol:text-[13.5px]
                  prose-li:my-0.5
                  prose-table:text-[12.5px] prose-table:my-3
                  prose-th:font-bold prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-left
                  prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-border
                  prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px]
                  prose-strong:text-foreground"
                >
                  {s.body}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
