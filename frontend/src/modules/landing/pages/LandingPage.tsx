// Landing publica.
//
// ESTRUCTURA
//   1. Hero partido: propuesta a la izquierda, producto real a la derecha.
//   2. Recorrido: lista numerada fija mientras la captura cambia al hacer scroll.
//   3. Por que somos mejores: comparativa concreta contra la competencia real.
//   4. Precio, preguntas y cierre.
//
// LAS IMAGENES SON EL PRODUCTO DE VERDAD. Se generan con
// `node scripts/capturar-producto.mjs` sobre la aplicacion corriendo con datos
// de escaparate (supabase/seeds/escaparate.sql). Nada de mockups dibujados a
// mano: envejecen mal y no convencen a nadie que haya visto un PMS.
//
// MOVIMIENTO
//   - Revelado de entrada escalonado por bloques.
//   - Parallax suave en las capturas: se mueven mas despacio que el texto.
//   - Cifras que cuentan al aparecer.
//   - Todo se desactiva con prefers-reduced-motion.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Minus, Plus, X } from '@phosphor-icons/react';
import { APP_NAME } from '../../../shared/lib/brand';
import { PLANS, PROMO, precioConPromo } from '../../billing/planes';
import { useRevelado, useParallax, useContador } from '../hooks/useLandingMotion';

const IMG = '/sh/producto';

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

function Revela({
  children,
  paso = 0,
  className = '',
}: {
  children: React.ReactNode;
  paso?: number;
  className?: string;
}) {
  const { ref, visible } = useRevelado<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      } ${className}`}
      style={{ transitionDelay: visible ? `${paso * 100}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

/**
 * Captura del producto con marco de ventana.
 *
 * El marco no es adorno: sin el, una captura a sangre se lee como parte de la
 * pagina y no como "esto es la aplicacion".
 */
function Captura({
  nombre,
  alt,
  className = '',
  parallax = 0,
  prioritaria = false,
}: {
  nombre: string;
  alt: string;
  className?: string;
  parallax?: number;
  /** Solo la del hero. Diferir la imagen protagonista retrasa justo lo que
   *  define la sensacion de velocidad; diferir el resto es lo correcto. */
  prioritaria?: boolean;
}) {
  const { ref, progreso } = useParallax<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-foreground/5 ${className}`}
      style={parallax ? { transform: `translate3d(0, ${progreso * parallax * -1}px, 0)` } : undefined}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-secondary/60 px-3 py-2">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-muted-foreground/30" />
      </div>
      {/* Dos ficheros, uno por tema: una captura clara sobre fondo oscuro canta. */}
      <img
        src={`${IMG}/${nombre}-claro.jpg`}
        alt={alt}
        width={2160}
        height={1350}
        loading={prioritaria ? 'eager' : 'lazy'}
        decoding={prioritaria ? 'sync' : 'async'}
        className="block w-full dark:hidden"
      />
      <img
        src={`${IMG}/${nombre}-oscuro.jpg`}
        alt={alt}
        width={2160}
        height={1350}
        loading={prioritaria ? 'eager' : 'lazy'}
        decoding={prioritaria ? 'sync' : 'async'}
        className="hidden w-full dark:block"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Header />
      <main>
        <Hero />
        <Cifras />
        <Recorrido />
        <PorQueMejores />
        <Precio />
        <Preguntas />
        <Final />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
        <span className="text-sm font-bold tracking-tight">{APP_NAME}</span>
        <nav className="ml-auto flex items-center gap-1">
          <a
            href="#comparativa"
            className="hidden rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Comparativa
          </a>
          <a
            href="#precio"
            className="hidden rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Precio
          </a>
          <Link
            to="/login"
            className="rounded-md px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Entrar
          </Link>
          <Link
            to="/nuevo-hotel"
            className="ml-1 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Probar gratis
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------

/**
 * Primer vistazo.
 *
 * Centrado y con el producto a lo ancho debajo, en vez del clasico partido en
 * dos: la captura se ve al triple de tamaño y se lee de verdad, que es lo que
 * tiene que pasar en los primeros tres segundos.
 *
 * Fondo: un halo del color de marca detras del titular, muy tenue. Sustituye a
 * la reticula de cuadros, que competia con la interfaz de la captura — dos
 * mallas de lineas en la misma pantalla se pelean.
 *
 * Sobre la captura van tres anotaciones flotantes que señalan lo que el sistema
 * hace solo. Sin ellas, el visitante ve "un panel bonito" y no sabe donde mirar.
 */
function Hero() {
  const { ref, progreso } = useParallax<HTMLDivElement>();

  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Halo de marca. Un unico foco, no un degradado de esquina a esquina. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-[38rem]"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 40%, hsl(var(--primary) / 0.16), transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-0 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          {PROMO.activa && (
            <Revela>
              <p className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-[12px] font-semibold">
                <span className="text-primary">
                  {PROMO.descuento * 100} % de descuento
                </span>
                <span className="text-muted-foreground">
                  los primeros {PROMO.meses} meses · {PROMO.detalle}
                </span>
              </p>
            </Revela>
          )}

          <Revela paso={1}>
            <h1 className="mt-7 text-[2.75rem] font-extrabold leading-[0.94] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Tu hotel deja de vivir
              <span className="mt-1 block bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-transparent">
                en un cuaderno.
              </span>
            </h1>
          </Revela>

          <Revela paso={2}>
            <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              Reservas, check-in, limpieza, cobros y cierre de caja. Con la tasa del BCV
              al día y la conciliación bancaria hecha, para que cuadrar el mes deje de
              ser una tarde con la calculadora.
            </p>
          </Revela>

          <Revela paso={3}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/nuevo-hotel"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90 motion-reduce:transition-none"
              >
                Empezar el mes de prueba
                <ArrowRight
                  size={16}
                  weight="bold"
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Link>
              <p className="text-[13px] text-muted-foreground">
                Sin tarjeta · 30 días completos
              </p>
            </div>
          </Revela>
        </div>

        {/* El producto, a lo ancho. */}
        <div ref={ref} className="relative mt-16 sm:mt-20">
          <Revela paso={4}>
            <div
              className="relative"
              style={{ transform: `translate3d(0, ${progreso * -14}px, 0)` }}
            >
              <Captura
                nombre="panel"
                alt="Panel del sistema: 53 % de ocupación, tres llegadas del día y el tablero de las 17 habitaciones con su estado"
                prioritaria
                className="ring-1 ring-foreground/5"
              />

              {/* Se desvanece por abajo para que la captura se funda con la
                  pagina y no quede un corte seco a media interfaz. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background"
              />

              <Anotacion className="left-[3%] top-[26%]" texto="Ocupación calculada sola" dato="53 %" />
              <Anotacion className="right-[4%] top-[8%]" texto="Tasa BCV al día" dato="Bs. 36,50" />
              <Anotacion className="bottom-[24%] left-[26%] hidden sm:flex" texto="Detecta lo que falta cobrar" dato="Pendiente 160,00" />
            </div>
          </Revela>
        </div>
      </div>
    </section>
  );
}

/** Etiqueta flotante que señala una parte concreta de la captura. */
function Anotacion({
  texto,
  dato,
  className = '',
}: {
  texto: string;
  dato: string;
  className?: string;
}) {
  const { ref, visible } = useRevelado<HTMLDivElement>();
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`absolute flex items-center gap-2 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0'
      } ${className}`}
      style={{ transitionDelay: visible ? '700ms' : '0ms' }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span className="text-[11px] font-bold tabular-nums">{dato}</span>
      <span className="hidden text-[11px] text-muted-foreground sm:inline">{texto}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Cifras que cuentan al aparecer. Son las del hotel de la captura: coherentes. */
function Cifras() {
  const datos = [
    { valor: 17, sufijo: '', etiqueta: 'habitaciones gestionadas en la demo' },
    { valor: 53, sufijo: ' %', etiqueta: 'ocupación de hoy, calculada sola' },
    { valor: 3, sufijo: '', etiqueta: 'monedas en la misma caja' },
    { valor: 9, sufijo: '', etiqueta: 'métodos de cobro, del efectivo a Zelle' },
  ];

  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {datos.map((d, i) => (
          <Cifra key={d.etiqueta} {...d} paso={i} />
        ))}
      </div>
    </section>
  );
}

function Cifra({
  valor,
  sufijo,
  etiqueta,
  paso,
}: {
  valor: number;
  sufijo: string;
  etiqueta: string;
  paso: number;
}) {
  const { ref, valor: actual } = useContador(valor);
  return (
    <div className="bg-background px-5 py-8 sm:px-6 sm:py-10" style={{ transitionDelay: `${paso * 80}ms` }}>
      <p className="text-3xl font-extrabold tabular-nums tracking-[-0.03em] sm:text-4xl">
        <span ref={ref}>{Math.round(actual)}</span>
        {sufijo}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

const PASOS = [
  {
    n: '01',
    titulo: 'Ves el hotel de un vistazo',
    texto:
      'Quién llega hoy, quién debe la mitad, qué habitación está en limpieza y cuánto llevas cobrado. Sin abrir un cuaderno.',
    imagen: 'panel',
    alt: 'Panel con llegadas del día, ocupación y tablero de habitaciones por estado',
  },
  {
    n: '02',
    titulo: 'Colocas una reserva sin solaparla',
    texto:
      'El timeline enseña la ocupación semana a semana. Si dos estancias chocan en la misma habitación, no te deja guardarlas.',
    imagen: 'timeline',
    alt: 'Timeline de ocupación por habitación y día',
  },
  {
    n: '03',
    titulo: 'Cobras en la moneda que traiga el huésped',
    texto:
      'Efectivo, Zelle, pago móvil, punto de venta o transferencia. En bolívares con la tasa del BCV, o en dólares y euros.',
    imagen: 'pagos',
    alt: 'Lista de pagos con método, moneda y estado de confirmación',
  },
  {
    n: '04',
    titulo: 'Cierras la caja y cuadra',
    texto:
      'Cada método con lo suyo y la diferencia a la vista. Si falta algo lo ves esta noche, no a final de mes.',
    imagen: 'cierre-caja',
    alt: 'Pantalla de cierre de caja con el desglose por método de pago',
  },
];

/**
 * Recorrido tipo indice: la lista se queda fija a la izquierda y la captura
 * cambia segun el paso activo. Se sigue el hilo sin perder el contexto.
 */
function Recorrido() {
  const [activo, setActivo] = useState(0);
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const i = refs.current.findIndex((r) => r === visible.target);
        if (i >= 0) setActivo(i);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    refs.current.forEach((r) => r && obs.observe(r));
    return () => obs.disconnect();
  }, []);

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <Revela>
          <h2 className="max-w-2xl text-3xl font-extrabold leading-[1.08] tracking-[-0.028em] sm:text-4xl">
            Un turno completo, sin salir del sistema.
          </h2>
        </Revela>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,0.7fr),minmax(0,1.3fr)] lg:gap-14">
          {/* Indice: en pantalla ancha se queda fijo mientras pasan las capturas. */}
          <ol className="lg:sticky lg:top-28 lg:self-start">
            {PASOS.map((p, i) => {
              const esActivo = i === activo;
              return (
                <li key={p.n} className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                    aria-current={esActivo ? 'step' : undefined}
                    className="block w-full border-l-2 py-4 pl-5 text-left transition-colors duration-500"
                    style={{ borderColor: esActivo ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}
                  >
                    <span
                      className={`text-[11px] font-bold tabular-nums transition-colors duration-500 ${
                        esActivo ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {p.n}
                    </span>
                    <span
                      className={`mt-1 block text-[15px] font-bold leading-snug transition-colors duration-500 ${
                        esActivo ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {p.titulo}
                    </span>
                    <span
                      className={`grid transition-all duration-500 ease-out motion-reduce:transition-none ${
                        esActivo ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <span className="overflow-hidden">
                        <span className="mt-2 block text-[13px] leading-relaxed text-muted-foreground">
                          {p.texto}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="space-y-16 lg:space-y-28">
            {PASOS.map((p, i) => (
              <div
                key={p.n}
                ref={(el) => {
                  refs.current[i] = el;
                }}
              >
                <Revela>
                  <Captura nombre={p.imagen} alt={p.alt} parallax={12} />
                </Revela>
                {/* En movil el indice no se ve: el texto acompaña a su captura. */}
                <div className="mt-4 lg:hidden">
                  <p className="text-[11px] font-bold tabular-nums text-primary">{p.n}</p>
                  <p className="mt-1 text-[15px] font-bold">{p.titulo}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {p.texto}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Por que somos mejores: comparacion concreta, no adjetivos. */
function PorQueMejores() {
  const filas: Array<[string, boolean, string]> = [
    ['Cobros en bolívares con la tasa del BCV al día', false, 'Solo la moneda del país donde facturan'],
    ['Pago móvil y Zelle como métodos de primera', false, 'Tarjeta internacional o transferencia'],
    ['Conciliación del extracto del banco con los cobros', false, 'Módulo aparte, o inexistente'],
    ['Cierre de caja por turno en dos monedas', false, 'Cierre en una sola moneda'],
    ['Usuarios del equipo sin coste adicional', false, 'Por usuario o por habitación'],
    ['Precio para 17 habitaciones', false, 'Desde 255 USD al mes'],
  ];

  return (
    <section id="comparativa" className="scroll-mt-16 border-b border-border bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <Revela>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Por qué somos mejores aquí
          </p>
          <h2 className="mt-6 max-w-2xl text-3xl font-extrabold leading-[1.08] tracking-[-0.028em] sm:text-4xl">
            Los sistemas internacionales no se hicieron para este país.
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-400">
            Asumen un país, una moneda y una tarjeta de crédito. Aquí media caja entra
            por pago móvil y Zelle, la tasa cambia cada mañana y el cierre se hace en dos
            monedas a la vez. Eso no es un añadido: es de lo primero que se construyó.
          </p>
        </Revela>

        <div className="mt-14 overflow-hidden rounded-2xl border border-zinc-800">
          <div className="grid grid-cols-[1fr,auto,auto] gap-x-4 border-b border-zinc-800 bg-zinc-900/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-zinc-500 sm:grid-cols-[1fr,7rem,10rem] sm:px-7">
            <span />
            <span className="text-center text-zinc-100">{APP_NAME}</span>
            <span className="text-center">Cloudbeds · Mews</span>
          </div>

          {filas.map(([texto, _, competencia], i) => (
            <Revela key={texto} paso={i}>
              <div className="grid grid-cols-[1fr,auto,auto] items-center gap-x-4 border-b border-zinc-800 px-5 py-4 last:border-0 sm:grid-cols-[1fr,7rem,10rem] sm:px-7">
                <span className="text-[13px] leading-snug sm:text-sm">{texto}</span>
                <span className="flex justify-center">
                  <Check size={18} weight="bold" className="text-emerald-400" aria-label="Incluido" />
                </span>
                <span className="flex items-center justify-center gap-2 text-center text-[11px] leading-snug text-zinc-500">
                  <X size={14} weight="bold" className="hidden shrink-0 sm:block" aria-hidden="true" />
                  <span className="hidden sm:inline">{competencia}</span>
                  <X size={16} weight="bold" className="sm:hidden" aria-label="No incluido" />
                </span>
              </div>
            </Revela>
          ))}
        </div>

        <Revela paso={2}>
          <div className="mt-10 flex flex-wrap items-end gap-x-12 gap-y-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                17 habitaciones en Cloudbeds
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-zinc-500 line-through">
                255 $
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                Aquí, tarifa plana
              </p>
              <p className="mt-1 text-5xl font-extrabold tabular-nums sm:text-6xl">39 $</p>
            </div>
            <p className="max-w-[16rem] text-[13px] leading-relaxed text-zinc-400">
              Lo que cuesta una noche de una habitación. Con evitar una sobreventa al mes
              ya está pagado.
            </p>
          </div>
        </Revela>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Precio() {
  const [anual, setAnual] = useState(false);
  const ciclos: Array<[string, boolean]> = [['Mensual', false], ['Anual', true]];

  return (
    <section id="precio" className="scroll-mt-16 border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <Revela>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="text-3xl font-extrabold leading-[1.1] tracking-[-0.028em] sm:text-4xl">
              Una tarifa por hotel.
            </h2>
            <div
              role="group"
              aria-label="Ciclo de facturación"
              className="inline-flex rounded-lg border border-border p-0.5"
            >
              {ciclos.map(([txt, val]) => (
                <button
                  key={txt}
                  type="button"
                  onClick={() => setAnual(val)}
                  aria-pressed={anual === val}
                  className={`rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    anual === val
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {txt}
                  {val && <span className="ml-1.5 text-[11px] text-primary">−2 meses</span>}
                </button>
              ))}
            </div>
          </div>
        </Revela>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PLANS.map((plan, i) => {
            const lista = anual ? plan.precioAnio : plan.precioMes;
            const final = precioConPromo(lista);
            const hayPromo = PROMO.activa && final < lista;

            return (
              <Revela key={plan.code} paso={i}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                    plan.destacado
                      ? 'border-primary shadow-lg shadow-primary/10'
                      : 'border-border'
                  }`}
                >
                  {plan.destacado && (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-primary-foreground">
                      Más elegido
                    </span>
                  )}

                  <h3 className="text-base font-bold">{plan.nombre}</h3>
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                    {plan.resumen}
                  </p>

                  <div className="mt-6">
                    {hayPromo && (
                      /* El precio de lista tachado va ARRIBA y en pequeño: el
                         numero que tiene que quedarse en la cabeza es el que se
                         paga, no el que se ahorra. */
                      <p className="flex items-center gap-2">
                        <span className="text-lg font-bold tabular-nums text-muted-foreground line-through">
                          {lista} $
                        </span>
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          −{PROMO.descuento * 100} %
                        </span>
                      </p>
                    )}
                    <p className="flex items-baseline gap-1.5">
                      <span className="text-5xl font-extrabold tabular-nums tracking-[-0.04em]">
                        {final}
                      </span>
                      <span className="text-[13px] font-semibold text-muted-foreground">
                        $/{anual ? 'año' : 'mes'}
                      </span>
                    </p>
                    <p className="mt-1.5 h-8 text-[11px] leading-snug text-muted-foreground">
                      {hayPromo
                        ? `Durante ${PROMO.meses} meses. Después, ${lista} $.`
                        : `Hasta ${plan.maxHabitaciones} habitaciones.`}
                    </p>
                  </div>

                  <Link
                    to="/nuevo-hotel"
                    className={`mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90 ${
                      plan.destacado
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background'
                    }`}
                  >
                    Empezar con {plan.nombre}
                    <ArrowRight size={13} weight="bold" aria-hidden="true" />
                  </Link>

                  <p className="mt-6 border-t border-border pt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    Hasta {plan.maxHabitaciones} habitaciones
                  </p>
                  <ul className="mt-3 flex-1 space-y-2">
                    {plan.incluye.map((item) => (
                      <li key={item} className="flex gap-2 text-[13px] leading-snug">
                        <Check
                          size={13}
                          weight="bold"
                          className="mt-1 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Revela>
            );
          })}
        </div>

        <Revela paso={3}>
          <p className="mt-8 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Los usuarios no se cobran aparte: da de alta a todo tu equipo sin coste
            adicional. Segundo hotel y siguientes, 20 % menos. Puedes pagar en bolívares
            al cambio del día.
            {PROMO.activa && (
              <>
                {' '}
                El precio de lanzamiento se mantiene {PROMO.meses} meses desde el alta y
                está limitado a los {PROMO.plazas} primeros hoteles.
              </>
            )}
          </p>
        </Revela>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Preguntas() {
  const items: Array<[string, string]> = [
    [
      '¿Qué pasa con mis datos si dejo de pagar?',
      'No se borran. La cuenta pasa a solo lectura 30 días, con todo consultable y exportable. Después conservamos la información 90 días más: si vuelves antes, lo recuperas tal cual lo dejaste. Perder el libro de reservas por un recibo devuelto no nos parece una forma decente de tratar a un cliente.',
    ],
    [
      '¿La prueba tiene funciones recortadas?',
      'No. Treinta días con el sistema completo y sin tarjeta. Si te enseñáramos una versión capada, no podrías juzgar lo que compras.',
    ],
    [
      '¿Puedo llevar varios hoteles con una cuenta?',
      'Sí, cambiando entre ellos desde el menú, con un rol distinto en cada uno si hace falta. El segundo y siguientes, 20 % menos.',
    ],
    [
      '¿De dónde sale la tasa de cambio?',
      'Del BCV, sincronizada cada mañana, y también puedes fijarla a mano. Cada cobro guarda la tasa con la que se hizo, así que un cierre de hace meses sigue cuadrando hoy.',
    ],
    [
      '¿Mis datos están separados de los de otros hoteles?',
      'Sí, y no solo en la pantalla: la separación está en la base de datos. Un usuario de otro hotel no puede leer tus reservas ni aunque intente saltarse la aplicación.',
    ],
  ];

  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <Revela>
          <div className="divide-y divide-border border-y border-border">
            {items.map(([q, a]) => (
              <Pregunta key={q} q={q} a={a} />
            ))}
          </div>
        </Revela>
      </div>
    </section>
  );
}

function Pregunta({ q, a }: { q: string; a: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-4 py-5 text-left"
      >
        <span className="flex-1 text-[15px] font-semibold">{q}</span>
        {abierta ? (
          <Minus size={15} weight="bold" className="shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Plus size={15} weight="bold" className="shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
      </button>
      <div
        className={`grid transition-all duration-400 ease-out motion-reduce:transition-none ${
          abierta ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="pb-6 text-[14px] leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Final() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
        <Revela>
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Pruébalo un mes.
            <span className="mt-2 block text-muted-foreground">Decide con tu hotel dentro.</span>
          </h2>
        </Revela>
        <Revela paso={1}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/nuevo-hotel"
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Crear mi hotel
              <ArrowRight
                size={16}
                weight="bold"
                className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
            <Link
              to="/login"
              className="rounded-xl border border-border px-5 py-3 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </Revela>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] font-bold tracking-tight">{APP_NAME}</p>
        <p className="text-[12px] text-muted-foreground">
          © {new Date().getFullYear()} · Gestión hotelera para Venezuela
        </p>
      </div>
    </footer>
  );
}
