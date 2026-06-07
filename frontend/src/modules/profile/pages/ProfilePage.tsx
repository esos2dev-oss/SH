import { useState, useMemo, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Eye, EyeSlash, Check, X, ShieldCheck, Envelope, IdentificationCard } from '@phosphor-icons/react';

import { useAuth } from '../../../contexts/AuthContext';
import { ApiError } from '../../../shared/api/client';
import { changePassword } from '../../auth/api/auth.api';
import { PageHeader } from '../../../shared/components/ui/PageHeader';

const RULES = [
  { id: 'length', label: 'Minimo 8 caracteres', test: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'Al menos una mayuscula', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'Al menos una minuscula', test: (v: string) => /[a-z]/.test(v) },
  { id: 'number', label: 'Al menos un numero', test: (v: string) => /\d/.test(v) },
  { id: 'match', label: 'Las contrasenas coinciden', test: (v: string, c: string) => v.length > 0 && v === c },
];

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const checks = useMemo(
    () => RULES.map((r) => ({ ...r, passed: r.test(newPassword, confirm) })),
    [newPassword, confirm],
  );
  const allPassed = checks.every((c) => c.passed);

  const initials =
    user?.nombre
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) ?? '??';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allPassed || !currentPassword) return;
    setSubmitting(true);
    try {
      await changePassword(newPassword);
      toast.success('Contrasena actualizada. Vuelve a iniciar sesion.');
      await logout();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar la contrasena');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader title="Mi perfil" subtitle="Tus datos y configuracion de cuenta" />

      {/* Datos de la cuenta */}
      <div className="bg-card rounded-3xl border border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-extrabold text-xl">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">{user?.nombre}</h2>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <div className="bg-muted/50 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <IdentificationCard size={12} weight="bold" /> Rol
            </p>
            <p className="text-sm font-bold mt-1">{user?.role}</p>
          </div>
          <div className="bg-muted/50 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Envelope size={12} weight="bold" /> Email
            </p>
            <p className="text-sm font-medium mt-1 truncate">{user?.email}</p>
          </div>
          <div className="bg-muted/50 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck size={12} weight="bold" /> Estado
            </p>
            <p className="text-sm font-bold mt-1 text-emerald-600 dark:text-emerald-400">Activo</p>
          </div>
        </div>
      </div>

      {/* Cambio de password */}
      <div className="bg-card rounded-3xl border border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] p-6">
        <h3 className="font-semibold">Cambiar contrasena</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tras cambiarla se cerrara tu sesion y deberas iniciar de nuevo.
        </p>

        <form onSubmit={onSubmit} className="space-y-5 mt-6">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
              Contrasena actual
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Tu contrasena actual"
                className="w-full h-11 px-4 pr-11 rounded-xl border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? 'Ocultar' : 'Mostrar'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCurrent ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
                Nueva contrasena
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimo 8 caracteres"
                  className="w-full h-11 px-4 pr-11 rounded-xl border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  aria-label={showNew ? 'Ocultar' : 'Mostrar'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNew ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
                Confirmar contrasena
              </label>
              <input
                type={showNew ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repite la contrasena"
                className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card"
              />
            </div>
          </div>

          <div className="bg-muted rounded-2xl p-4 space-y-2.5">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Requisitos</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {checks.map((check) => (
                <div key={check.id} className="flex items-center gap-2.5 text-xs">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
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
          </div>

          <button
            type="submit"
            disabled={!allPassed || !currentPassword || submitting}
            className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
          >
            {submitting ? 'Actualizando...' : 'Actualizar contrasena'}
          </button>
        </form>
      </div>
    </div>
  );
}
