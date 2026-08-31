// Login con layout split: panel de marca/features a la izquierda,
// formulario a la derecha. En mobile solo el formulario.

import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation, type Location } from 'react-router-dom';
import {
  Bed, Eye, EyeSlash, EnvelopeSimple, Lock,
  CalendarBlank, CurrencyCircleDollar, ChartLineUp, ShieldCheck,
  ArrowRight, Lightning, Warning,
  ArrowLeft,
} from '@phosphor-icons/react';
import { useAuth } from '../../../contexts/AuthContext';
import { cn } from '../../../shared/lib/cn';
import { APP_NAME, APP_TAGLINE, APP_LOGO } from '../../../shared/lib/brand';

const DEMO_USERS: Array<{ email: string; role: string; description: string; color: string }> = [
  { email: 'admin@local.test', role: 'Superadmin', description: 'Acceso total + gestion usuarios', color: 'bg-violet-500' },
  { email: 'recepcion@local.test', role: 'Recepcion', description: 'Operacion diaria, pagos, check-in', color: 'bg-emerald-500' },
  { email: 'contabilidad@local.test', role: 'Contabilidad', description: 'ERP, conciliacion, reportes', color: 'bg-orange-500' },
  { email: 'limpieza@local.test', role: 'Limpieza', description: 'Solo vista movil de limpieza', color: 'bg-amber-500' },
];

const DEMO_PASSWORD = 'admin123';
const isDevMode = (import.meta.env.MODE ?? 'development') !== 'production';

/**
 * Mensaje presentable para un fallo de autenticacion.
 *
 * fetch rechaza con TypeError cuando no hay servidor, no hay red o CORS lo
 * bloquea, y su mensaje nativo ("Failed to fetch" / "Load failed") no le dice
 * nada a un recepcionista. El login es la unica pantalla a la que llega alguien
 * sin sesion: es justo donde peor sienta un error en ingles y sin contexto.
 */
function mensajeDeError(err: unknown, fallback: string): string {
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return 'No se pudo conectar con el servidor. Revisa tu conexion; si persiste, avisa al administrador.';
  }
  if (err instanceof Error && err.message) {
    if (/invalid login credentials/i.test(err.message)) return 'Email o contrasena incorrectos.';
    if (/email not confirmed/i.test(err.message)) return 'Tu cuenta aun no esta confirmada.';
    return err.message;
  }
  return fallback;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as Location & { state?: { from?: { pathname?: string } } };
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemos, setShowDemos] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Completa todos los campos');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      const from = location.state?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(mensajeDeError(err, 'Credenciales incorrectas'));
    } finally { setLoading(false); }
  }

  async function quickLogin(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
    setLoading(true);
    try {
      await login(demoEmail, DEMO_PASSWORD);
      navigate('/', { replace: true });
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo iniciar sesion demo'));
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Panel izquierdo (branding) — solo desktop */}
      <aside className="relative hidden lg:flex flex-col justify-between w-1/2 xl:w-2/5 bg-gradient-to-br from-primary via-primary to-blue-700 dark:from-primary dark:via-blue-900 dark:to-zinc-950 text-primary-foreground p-12 overflow-hidden">
        <div aria-hidden="true" className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,_rgba(255,255,255,0.08)_1px,_transparent_0)] bg-[length:24px_24px] opacity-50" />

        <div className="relative z-10">
          <Link
            to="/bienvenido"
            className="flex items-center gap-3 mb-12 rounded-xl transition-opacity hover:opacity-80"
          >
            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg overflow-hidden p-1">
              <img src={APP_LOGO} alt="" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight leading-none">{APP_NAME}</p>
              <p className="text-[11px] text-white/70 mt-1">{APP_TAGLINE}</p>
            </div>
          </Link>

          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.05]">
            Tu hotel, <br />
            <span className="text-white/70">en un solo panel.</span>
          </h1>
          <p className="text-white/80 mt-5 text-base max-w-md leading-relaxed">
            Reservas, check-in digital, pagos en bolivares y dolares, conciliacion bancaria, cierre de caja y reportes.
            Todo en una pantalla.
          </p>

          <ul className="mt-10 space-y-4 max-w-md">
            <Feature icon={CalendarBlank} title="Reservas y timeline en tiempo real" desc="Arrastra reservas entre habitaciones. Ve la ocupacion en un vistazo." />
            <Feature icon={CurrencyCircleDollar} title="Pagos Venezuela first" desc="Pago Movil, Zelle, transferencia. Conciliacion bancaria automatica." />
            <Feature icon={ChartLineUp} title="Reportes ejecutivos" desc="Ocupacion, ADR, RevPAR, ingresos por metodo. Export a CSV." />
          </ul>
        </div>

        <div className="relative z-10 text-[11px] text-white/60 flex items-center gap-2">
          <ShieldCheck size={14} weight="duotone" />
          v0.1.0 Fase Beta &middot; &copy; {new Date().getFullYear()}
        </div>
      </aside>

      {/* Panel derecho (formulario) */}
      <main className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background relative">
        <div aria-hidden="true" className="lg:hidden absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,_hsl(var(--primary)/0.15),_transparent_50%)] pointer-events-none" />

        {/* Salida a la landing. En movil el panel de marca no existe, asi que
            sin esto no habria forma de volver salvo el boton del navegador. */}
        <Link
          to="/bienvenido"
          className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:left-8 lg:top-8"
        >
          <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          Volver
        </Link>

        <div className="relative w-full max-w-sm">
          <Link
            to="/bienvenido"
            className="lg:hidden flex items-center justify-center gap-3 mb-8 transition-opacity hover:opacity-80"
          >
            <img src={APP_LOGO} alt="" className="w-14 h-14 rounded-2xl bg-white shadow-lg object-contain p-1" />
            <span className="text-lg font-extrabold tracking-tight">{APP_NAME}</span>
          </Link>

          <div className="space-y-2 mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight">Bienvenido</h2>
            <p className="text-sm text-muted-foreground">Inicia sesion para continuar con la operacion.</p>
          </div>

          <form onSubmit={handleSubmit} aria-label="Formulario de inicio de sesion" className="space-y-4">
            <div>
              <label htmlFor="email" className="text-xs font-semibold text-foreground mb-1.5 block">Email</label>
              <div className="relative">
                <EnvelopeSimple size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@hotel.com"
                  autoComplete="email"
                  autoFocus
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-input bg-background text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="text-xs font-semibold text-foreground mb-1.5 block">Contrasena</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  autoComplete="current-password"
                  className="w-full h-11 pl-10 pr-11 rounded-xl border border-input bg-background text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3.5 py-2.5 font-medium">
                <Warning size={14} weight="fill" className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Iniciando&hellip;
                </>
              ) : (
                <>Iniciar sesion <ArrowRight size={14} weight="bold" /></>
              )}
            </button>
          </form>

          {isDevMode && (
            <div className="mt-6 pt-5 border-t border-border">
              <button
                type="button"
                onClick={() => setShowDemos((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <Lightning size={12} weight="duotone" className="text-amber-500" />
                  Acceso rapido demo
                </span>
                <span className="text-[10px]">{showDemos ? '−' : '+'}</span>
              </button>

              {showDemos && (
                <div className="mt-3 space-y-1.5">
                  {DEMO_USERS.map((u) => (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => void quickLogin(u.email)}
                      disabled={loading}
                      className={cn(
                        'w-full flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all text-left disabled:opacity-50',
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full', u.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold">{u.role}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{u.description}</p>
                      </div>
                      <ArrowRight size={12} className="text-muted-foreground" />
                    </button>
                  ))}
                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    Password de todos: <code className="font-mono bg-muted px-1 rounded">{DEMO_PASSWORD}</code>
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="text-center text-[11px] text-muted-foreground mt-6">
            Sin cuenta? <span className="text-foreground font-semibold">Contacta con el administrador</span>
          </p>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: typeof Bed; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0">
        <Icon size={18} weight="duotone" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-xs text-white/70 mt-0.5">{desc}</p>
      </div>
    </li>
  );
}
