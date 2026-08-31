// Alta guiada del alojamiento — a pantalla completa.
//
// Va fuera del layout de la aplicacion a proposito: con el menu lateral y el
// boton flotante de cobrar alrededor, se le enseña al usuario la operacion de un
// hotel que todavia no existe.
//
// Criterios:
// - Cinco pasos cortos. Solo el nombre es obligatorio; el resto trae valores
//   razonables puestos, porque quien acaba de registrarse aun no sabe que necesita.
// - NADA sobre planes ni precios aqui. Quien esta configurando su alojamiento no
//   quiere que le vendan: el limite solo aparece si intenta pasarse, y entonces
//   si tiene sentido explicarselo.
// - Los modulos que no marque no apareceran en el menu.
//
// Todo se crea en UNA llamada: por partes, un fallo a mitad dejaria el hotel sin
// habitaciones y el usuario no sabria que le falta.

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../../shared/components/ui/button';
import { Input } from '../../../shared/components/ui/input';
import { Label } from '../../../shared/components/ui/label';
import { ApiError } from '../../../shared/api/client';
import { APP_NAME, APP_LOGO } from '../../../shared/lib/brand';
import { PLANS } from '../planes';
import { MONEDAS, monedaPorCodigo } from '../monedas';
import {
  createHotelOnboarding, activarHotelSiSePuede,
  type TipoAlojamiento, type TipoUnidad,
} from '../api/hotels.api';

// ---------------------------------------------------------------------------
// Iconografia propia: trazo fino y coherente, en vez de flechas de libreria.
// ---------------------------------------------------------------------------

function Flecha({ dir = 'der', className = '' }: { dir?: 'izq' | 'der'; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-3.5 w-3.5 ${dir === 'izq' ? 'rotate-180' : ''} ${className}`}
    >
      <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
    </svg>
  );
}

function Tic({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-3 w-3 ${className}`}
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------

const TIPOS_ALOJAMIENTO: Array<{ valor: TipoAlojamiento; label: string; unidad: string }> = [
  { valor: 'hotel', label: 'Hotel', unidad: 'habitaciones' },
  { valor: 'posada', label: 'Posada', unidad: 'habitaciones' },
  { valor: 'cabanas', label: 'Cabañas', unidad: 'cabañas' },
  { valor: 'apartamentos', label: 'Apartamentos', unidad: 'apartamentos' },
  { valor: 'hostal', label: 'Hostal', unidad: 'habitaciones' },
];

const METODOS = [
  { valor: 'efectivo_usd', label: 'Efectivo en divisas' },
  { valor: 'efectivo_bs', label: 'Efectivo local' },
  { valor: 'pago_movil', label: 'Pago móvil' },
  { valor: 'zelle', label: 'Zelle' },
  { valor: 'transferencia', label: 'Transferencia' },
  { valor: 'punto_venta', label: 'Punto de venta' },
  { valor: 'tarjeta', label: 'Tarjeta internacional' },
  { valor: 'paypal', label: 'PayPal' },
];

/** Lo que el sistema sabe hacer, agrupado. Lo esencial no se puede desactivar. */
/** Modulos que van siempre, marque lo que marque: sin ellos no hay sistema. */
const MODULOS_FIJOS = ['reservas', 'checkin', 'huespedes', 'pagos'];

const MODULOS = [
  {
    grupo: 'Operación diaria',
    items: [
      { valor: 'reservas', label: 'Reservas y calendario', desc: 'Alta de reservas, timeline de ocupación y aviso de solapes.', fijo: true },
      { valor: 'checkin', label: 'Check-in y check-out', desc: 'Registro de entrada con documento y firma.', fijo: true },
      { valor: 'huespedes', label: 'Huéspedes', desc: 'Ficha, historial de estancias y datos de contacto.', fijo: true },
      { valor: 'limpieza', label: 'Limpieza', desc: 'Vista móvil para el personal, con la unidad en cuanto sale alguien.' },
      { valor: 'mantenimiento', label: 'Mantenimiento', desc: 'Órdenes con coste y bloqueo de la unidad mientras dura.' },
    ],
  },
  {
    grupo: 'Dinero',
    items: [
      { valor: 'pagos', label: 'Cobros', desc: 'Pagos en varias monedas, cada uno con su tasa guardada.', fijo: true },
      { valor: 'caja', label: 'Cierre de caja', desc: 'Arqueo por turno con desglose por método.' },
      { valor: 'contabilidad', label: 'Ingresos y egresos', desc: 'Libro contable con comprobantes adjuntos.' },
      { valor: 'conciliacion', label: 'Conciliación bancaria', desc: 'Cruce del extracto del banco con los cobros registrados.' },
      { valor: 'reportes', label: 'Reportes', desc: 'Ocupación, ADR, RevPAR e ingresos por método.' },
    ],
  },
  {
    grupo: 'Extras',
    items: [
      { valor: 'desayunos', label: 'Desayunos', desc: 'Pedidos por unidad y liquidación al restaurante.' },
      { valor: 'asistencia', label: 'Asistencia de personal', desc: 'Fichajes y horas trabajadas del equipo.' },
      { valor: 'planta', label: 'Planta eléctrica', desc: 'Registro de arranques y consumo de combustible.' },
    ],
  },
];

const PASOS = ['Alojamiento', 'Unidades', 'Cobros', 'Módulos', 'Resumen'];

/** Tope real del sistema. Solo se menciona si se supera. */
const LIMITE_UNIDADES = Math.max(...PLANS.map((p) => p.maxHabitaciones));

export default function OnboardingPage() {
  const [paso, setPaso] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoAlojamiento>('hotel');
  const [moneda, setMoneda] = useState('USD');
  const [iva, setIva] = useState('16');
  const [tipos, setTipos] = useState<TipoUnidad[]>([
    { nombre: 'Individual', capacidad: 1, tarifa: 25, cantidad: 2 },
    { nombre: 'Doble', capacidad: 2, tarifa: 40, cantidad: 4 },
  ]);
  const [metodos, setMetodos] = useState<string[]>([]);
  // Vacio a proposito: solo se activa lo que el usuario marque. Los modulos
  // fijos se añaden al enviar, no aqui, para no mezclarlos con su eleccion.
  const [modulos, setModulos] = useState<string[]>([]);

  const unidadNombre = TIPOS_ALOJAMIENTO.find((t) => t.valor === tipo)?.unidad ?? 'habitaciones';
  const total = tipos.reduce((s, t) => s + (Number(t.cantidad) || 0), 0);
  const excede = total > LIMITE_UNIDADES;
  const m = monedaPorCodigo(moneda);

  function alternar(lista: string[], set: (v: string[]) => void, valor: string) {
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  }

  function siguiente() {
    if (paso === 0 && nombre.trim().length < 2) {
      toast.error('Escribe el nombre de tu alojamiento');
      return;
    }
    if (paso === 1 && excede) {
      toast.error(`De momento el sistema admite hasta ${LIMITE_UNIDADES} unidades`);
      return;
    }
    setPaso((p) => Math.min(PASOS.length - 1, p + 1));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ivaNum = Number(iva);
    if (!Number.isFinite(ivaNum) || ivaNum < 0 || ivaNum > 100) {
      toast.error('El IVA debe estar entre 0 y 100');
      return;
    }
    if (excede) {
      toast.error(`De momento el sistema admite hasta ${LIMITE_UNIDADES} unidades`);
      return;
    }

    setEnviando(true);
    try {
      const hotelId = await createHotelOnboarding({
        nombre: nombre.trim(),
        tipo,
        moneda_base: moneda,
        iva_pct: ivaNum,
        tipos: tipos.filter((t) => t.nombre.trim() !== ''),
        metodos,
        // Los fijos se suman aqui: el menu los necesita, pero no forman parte
        // de lo que el usuario decidio.
        modulos: [...new Set([...MODULOS_FIJOS, ...modulos])],
      });
      // Si la activacion falla no se corta el flujo: el hotel ya existe y, al
      // ser el unico del usuario, la base lo resuelve sola.
      await activarHotelSiSePuede(hotelId);
      toast.success('Tu alojamiento está listo');
      window.location.href = '/sh/';
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo crear el alojamiento');
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-6">
          <img src={APP_LOGO} alt="" className="h-7 w-7 rounded-lg" />
          <span className="text-sm font-bold tracking-tight">{APP_NAME}</span>
          <Link
            to="/bienvenido"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Flecha dir="izq" />
            Salir
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Configura tu alojamiento</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Cinco pasos cortos. Todo se puede cambiar después.
          </p>
        </div>

        <Progreso paso={paso} onIr={setPaso} />

        <form onSubmit={handleSubmit} className="mt-5 rounded-2xl border border-border bg-card p-5 sm:p-7">
          {paso === 0 && (
            <Seccion titulo="¿Qué tienes?" descripcion="Con esto ajustamos el vocabulario de toda la aplicación.">
              <div className="space-y-1.5">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Posada Los Robles"
                  autoFocus
                />
              </div>

              <fieldset className="mt-6">
                <legend className="mb-2.5 text-sm font-medium">Tipo de alojamiento</legend>
                <div className="flex flex-wrap gap-2">
                  {TIPOS_ALOJAMIENTO.map((t) => (
                    <Chip key={t.valor} activo={tipo === t.valor} onClick={() => setTipo(t.valor)}>
                      {t.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              {/* La moneda va antes de pedir tarifas: al reves se escribe un
                  numero sin saber en que unidad. */}
              {/* Chips y no tarjetas: doce tarjetas ocupaban cuatro filas y
                  obligaban a hacer scroll en el primer paso. El pais se lee en
                  el title, que es donde se busca cuando hay duda. */}
              <fieldset className="mt-5">
                <legend className="mb-2.5 text-sm font-medium">Moneda de tus tarifas</legend>
                <div className="flex flex-wrap gap-1.5">
                  {MONEDAS.map((mon) => {
                    const activa = moneda === mon.codigo;
                    return (
                      <button
                        key={mon.codigo}
                        type="button"
                        title={mon.nombre + ' · ' + mon.pais}
                        onClick={() => setMoneda(mon.codigo)}
                        aria-pressed={activa}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                          activa
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                        }`}
                      >
                        <span className={`text-[11px] font-bold ${activa ? 'text-primary' : ''}`}>
                          {mon.simbolo}
                        </span>
                        {mon.codigo}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {m.nombre} de {m.pais}. Podrás cobrar en cualquier otra.
                </p>
              </fieldset>

              <div className="mt-5 max-w-[10rem] space-y-1.5">
                <Label htmlFor="iva">IVA (%)</Label>
                <NumeroLimpio id="iva" valor={iva} onChange={setIva} min={0} max={100} paso={0.5} />
              </div>
            </Seccion>
          )}

          {paso === 1 && (
            <Seccion
              titulo={`Tus ${unidadNombre}`}
              descripcion="Añade los tipos que tengas con su tarifa por noche. Se crean numeradas, y podrás añadir más desde dentro."
            >
              <div className="space-y-4">
                {tipos.map((t, i) => (
                  <div key={i} className="rounded-xl border border-border p-3.5">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr,5.5rem,7rem,5.5rem]">
                      <div className="col-span-2 space-y-1 sm:col-span-1">
                        <Label htmlFor={`tipo-${i}`} className="text-[11px]">Nombre</Label>
                        <Input
                          id={`tipo-${i}`}
                          value={t.nombre}
                          onChange={(e) => {
                            const c = [...tipos];
                            c[i] = { ...t, nombre: e.target.value };
                            setTipos(c);
                          }}
                          placeholder="Doble"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Personas</Label>
                        <NumeroLimpio
                          valor={String(t.capacidad)}
                          onChange={(v) => {
                            const c = [...tipos];
                            c[i] = { ...t, capacidad: Number(v) };
                            setTipos(c);
                          }}
                          min={1}
                          max={20}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Tarifa ({m.codigo})</Label>
                        <NumeroLimpio
                          valor={String(t.tarifa)}
                          onChange={(v) => {
                            const c = [...tipos];
                            c[i] = { ...t, tarifa: Number(v) };
                            setTipos(c);
                          }}
                          min={0}
                          paso={0.5}
                          prefijo={m.simbolo}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Cuántas</Label>
                        <NumeroLimpio
                          valor={String(t.cantidad)}
                          onChange={(v) => {
                            const c = [...tipos];
                            c[i] = { ...t, cantidad: Number(v) };
                            setTipos(c);
                          }}
                          min={0}
                          max={200}
                        />
                      </div>
                    </div>

                    {tipos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setTipos(tipos.filter((_, j) => j !== i))}
                        className="mt-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-destructive"
                      >
                        Quitar este tipo
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setTipos([...tipos, { nombre: '', capacidad: 2, tarifa: 0, cantidad: 1 }])}
              >
                Añadir tipo
              </Button>

              {total > 0 && !excede && (
                <p className="mt-5 text-[13px] text-muted-foreground">
                  <strong className="font-bold tabular-nums text-foreground">{total}</strong>{' '}
                  {unidadNombre} en total.
                </p>
              )}

              {/* Bloqueante. Solo aparece si se pasa: nada de vender un plan a
                  quien todavia esta montando su alojamiento. */}
              {excede && (
                <div className="mt-5 rounded-xl border border-amber-400/50 bg-amber-50 p-4 dark:bg-amber-950/20">
                  <p className="text-[13px] font-bold">
                    Has puesto {total} {unidadNombre}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    De momento el sistema admite hasta {LIMITE_UNIDADES}. Si tienes más, escríbenos
                    y lo vemos: preferimos hablarlo antes que dejarte a medias.
                  </p>
                </div>
              )}
            </Seccion>
          )}

          {paso === 2 && (
            <Seccion titulo="¿Cómo cobras?" descripcion="Solo aparecerán estos métodos al registrar un pago. Puedes cambiarlos cuando quieras.">
              <div className="flex flex-wrap gap-2">
                {METODOS.map((met) => (
                  <Chip
                    key={met.valor}
                    activo={metodos.includes(met.valor)}
                    onClick={() => alternar(metodos, setMetodos, met.valor)}
                  >
                    {met.label}
                  </Chip>
                ))}
              </div>
              {metodos.length === 0 && (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  Sin ningún método marcado tendrás que elegirlo a mano en cada cobro.
                </p>
              )}
            </Seccion>
          )}

          {paso === 3 && (
            <Seccion titulo="¿Qué necesitas?" descripcion="Lo que no marques no aparecerá en el menú. Se activa cuando quieras.">
              {/* Dos columnas y descripcion solo al pasar por encima: con trece
                  opciones en fichas altas, este paso no cabia en pantalla. */}
              <div className="space-y-5">
                {MODULOS.map((g) => (
                  <div key={g.grupo}>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {g.grupo}
                    </p>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {g.items.map((mod) => {
                        const fijo = 'fijo' in mod && mod.fijo === true;
                        const activo = fijo || modulos.includes(mod.valor);
                        return (
                          <li key={mod.valor}>
                            <button
                              type="button"
                              disabled={fijo}
                              title={mod.desc}
                              onClick={() => alternar(modulos, setModulos, mod.valor)}
                              aria-pressed={activo}
                              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                                activo ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40'
                              } ${fijo ? 'cursor-default opacity-60' : ''}`}
                            >
                              <span
                                aria-hidden="true"
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  activo
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-muted-foreground/40'
                                }`}
                              >
                                {activo && <Tic />}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                                {mod.label}
                              </span>
                              {fijo && (
                                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  fijo
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {paso === 4 && (
            <Resumen
              nombre={nombre}
              tipoLabel={TIPOS_ALOJAMIENTO.find((t) => t.valor === tipo)?.label ?? ''}
              unidadNombre={unidadNombre}
              total={total}
              tipos={tipos.filter((t) => t.nombre.trim())}
              moneda={m}
              iva={iva}
              metodos={metodos}
              modulos={modulos}
            />
          )}

          <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
            {paso > 0 && (
              <Button type="button" variant="outline" onClick={() => setPaso((p) => p - 1)}>
                <Flecha dir="izq" className="mr-1.5" />
                Atrás
              </Button>
            )}

            <div className="ml-auto flex items-center gap-4">
              {paso > 0 && paso < PASOS.length - 1 && (
                <button
                  type="button"
                  onClick={() => setPaso(PASOS.length - 1)}
                  className="text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Configurar después
                </button>
              )}
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {paso + 1} / {PASOS.length}
              </span>
            </div>

            {paso < PASOS.length - 1 ? (
              <Button type="button" onClick={siguiente}>
                Continuar
                <Flecha className="ml-1.5" />
              </Button>
            ) : (
              <Button type="submit" disabled={enviando || excede}>
                {enviando ? 'Creando...' : 'Crear mi alojamiento'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Campo numerico sin los controles del navegador.
 *
 * Los `type="number"` nativos pintan unas flechitas diminutas, distintas en cada
 * navegador, imposibles de acertar con el dedo y que ademas se disparan con la
 * rueda del raton al hacer scroll. Aqui se ocultan y se ponen botones propios
 * con area tactil de verdad.
 */
function NumeroLimpio({
  id,
  valor,
  onChange,
  min = 0,
  max,
  paso = 1,
  prefijo,
}: {
  id?: string;
  valor: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  paso?: number;
  prefijo?: string;
}) {
  const num = Number(valor) || 0;
  const aplicar = (v: number) => {
    const acotado = Math.min(max ?? Infinity, Math.max(min, v));
    onChange(String(Number(acotado.toFixed(2))));
  };

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      {prefijo && (
        <span className="flex items-center pl-2.5 text-[12px] font-semibold text-muted-foreground">
          {prefijo}
        </span>
      )}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={valor}
        min={min}
        max={max}
        step={paso}
        onChange={(e) => onChange(e.target.value)}
        // Sin esto, la rueda del raton cambia el valor al pasar por encima
        // mientras se hace scroll: un clasico de los formularios largos.
        onWheel={(e) => e.currentTarget.blur()}
        className="w-full min-w-0 bg-transparent px-2.5 py-2 text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <div className="flex flex-col border-l border-input">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Aumentar"
          onClick={() => aplicar(num + paso)}
          className="flex h-1/2 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 2.5v7M2.5 6h7" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Disminuir"
          onClick={() => aplicar(num - paso)}
          className="flex h-1/2 w-7 items-center justify-center border-t border-input text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 6h7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Progreso({ paso, onIr }: { paso: number; onIr: (p: number) => void }) {
  return (
    <ol className="flex items-center gap-1.5">
      {PASOS.map((nombre, i) => {
        const hecho = i < paso;
        const actual = i === paso;
        return (
          <li key={nombre} className="flex-1">
            <button
              type="button"
              disabled={i > paso}
              onClick={() => onIr(i)}
              aria-current={actual ? 'step' : undefined}
              className="w-full text-left disabled:cursor-default"
            >
              <span
                aria-hidden="true"
                className={`block h-1 rounded-full transition-colors duration-500 ${
                  hecho || actual ? 'bg-primary' : 'bg-border'
                }`}
              />
              <span
                className={`mt-1.5 hidden text-[11px] font-semibold transition-colors sm:block ${
                  actual ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {nombre}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">{titulo}</h2>
      <p className="mb-5 mt-1 text-[13px] leading-snug text-muted-foreground">{descripcion}</p>
      {children}
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${
        activo
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {activo && <Tic className="text-primary" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

/** Resumen final: el detalle real de lo que se va a crear, no solo recuentos. */
function Resumen({
  nombre,
  tipoLabel,
  unidadNombre,
  total,
  tipos,
  moneda,
  iva,
  metodos,
  modulos,
}: {
  nombre: string;
  tipoLabel: string;
  unidadNombre: string;
  total: number;
  tipos: TipoUnidad[];
  moneda: { codigo: string; simbolo: string };
  iva: string;
  metodos: string[];
  modulos: string[];
}) {
  const nombresMetodos = METODOS.filter((x) => metodos.includes(x.valor)).map((x) => x.label);
  const todos = MODULOS.flatMap((g) => g.items);

  // Se separan a proposito: mezclarlos hacia que el usuario viera en su resumen
  // cosas que no habia marcado y pensara que se le habian colado.
  const base = todos.filter((x) => 'fijo' in x && x.fijo === true).map((x) => x.label);
  const elegidos = todos
    .filter((x) => !('fijo' in x && x.fijo === true) && modulos.includes(x.valor))
    .map((x) => x.label);

  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">{nombre.trim() || 'Tu alojamiento'}</h2>
      <p className="mb-6 mt-1 text-[13px] text-muted-foreground">
        {tipoLabel} · {total} {unidadNombre} · tarifas en {moneda.codigo} · IVA {iva} %
      </p>

      <div className="space-y-5">
        <Bloque titulo={`Tus ${unidadNombre}`}>
          {tipos.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Ninguna todavía. Podrás añadirlas desde dentro.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {tipos.map((t, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="text-[13px] font-semibold">{t.nombre}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {t.capacidad} {t.capacidad === 1 ? 'persona' : 'personas'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    · {t.cantidad} {t.cantidad === 1 ? 'unidad' : 'unidades'}
                  </span>
                  <span className="ml-auto text-[13px] font-bold tabular-nums">
                    {moneda.simbolo} {t.tarifa}
                  </span>
                  <span className="text-[11px] text-muted-foreground">/noche</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque titulo="Cobros">
          {nombresMetodos.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Los elegirás en cada pago.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {nombresMetodos.map((n) => (
                <span key={n} className="rounded-md border border-border px-2 py-1 text-[12px]">
                  {n}
                </span>
              ))}
            </div>
          )}
        </Bloque>

        <Bloque titulo="Lo que has activado">
          {elegidos.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Nada extra. Puedes activar lo que quieras desde dentro cuando lo necesites.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {elegidos.map((n) => (
                <span
                  key={n}
                  className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-[12px] font-medium"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </Bloque>

        <Bloque titulo="Incluido siempre">
          <div className="flex flex-wrap gap-1.5">
            {base.map((n) => (
              <span
                key={n}
                className="rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground"
              >
                {n}
              </span>
            ))}
          </div>
        </Bloque>
      </div>

      <p className="mt-6 text-center text-[12px] text-muted-foreground">
        Empiezas con 30 días de {APP_NAME} completo. Sin tarjeta.
      </p>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {titulo}
      </p>
      {children}
    </div>
  );
}
