import { useState, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bed, Eye, EyeSlash, Check, X } from '@phosphor-icons/react';
import { setPassword as setPasswordApi } from '../api/auth.api';
import { ApiError } from '../../../shared/api/client';

const RULES = [
  { id: 'length', label: 'Minimo 8 caracteres', test: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'Al menos una mayuscula', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'Al menos una minuscula', test: (v: string) => /[a-z]/.test(v) },
  { id: 'number', label: 'Al menos un numero', test: (v: string) => /\d/.test(v) },
  { id: 'match', label: 'Las contrasenas coinciden', test: (v: string, c: string) => v.length > 0 && v === c },
];

export default function SetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [password, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const checks = useMemo(
    () => RULES.map((r) => ({ ...r, passed: r.test(password, confirm) })),
    [password, confirm],
  );
  const allPassed = checks.every((c) => c.passed);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allPassed || !token) return;
    setLoading(true);
    setError(null);
    try {
      await setPasswordApi(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar la contrasena');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="w-full max-w-[420px] px-4">
        <div className="bg-card rounded-3xl shadow-[0_20px_25px_-5px_rgb(0_0_0/0.06),0_8px_10px_-6px_rgb(0_0_0/0.04)] border border-border p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500 text-white mb-6 shadow-lg shadow-emerald-500/20">
              <Bed size={28} weight="duotone" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Establece tu contrasena</h1>
            <p className="text-muted-foreground text-sm mt-2">Crea una contrasena segura para acceder al sistema</p>
          </div>

          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-emerald-600" weight="bold" />
              </div>
              <h2 className="text-lg font-bold">Contrasena guardada</h2>
              <p className="text-muted-foreground text-sm mt-2">Redirigiendo al login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Password */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
                  Nueva contrasena
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPwd(e.target.value)}
                    placeholder="Minimo 8 caracteres"
                    autoFocus
                    className="w-full h-11 px-4 pr-11 rounded-xl border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
                  Confirmar contrasena
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repite la contrasena"
                    className="w-full h-11 px-4 pr-11 rounded-xl border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirm ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Validation Checklist */}
              <div className="bg-muted rounded-2xl p-4 space-y-2.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Requisitos</p>
                {checks.map((check) => (
                  <div key={check.id} className="flex items-center gap-2.5 text-xs">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        check.passed ? 'bg-emerald-500' : 'bg-border'
                      }`}
                    >
                      {check.passed ? (
                        <Check size={10} weight="bold" className="text-white" />
                      ) : (
                        <X size={10} weight="bold" className="text-muted-foreground" />
                      )}
                    </div>
                    <span
                      className={`font-medium transition-colors ${
                        check.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                      }`}
                    >
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!allPassed || loading || !token}
                className="w-full h-12 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Guardando...
                  </span>
                ) : (
                  'Guardar contrasena'
                )}
              </button>
            </form>
          )}
        </div>

        {!token && (
          <p className="text-center text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-4 py-2 mt-4 font-medium border border-amber-200 dark:border-amber-800">
            Token no detectado — esta pagina normalmente se accede desde el email de invitacion.
          </p>
        )}
      </div>
    </div>
  );
}
