// Gestion de usuarios — solo superadmin.

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  ArrowClockwise,
  EnvelopeSimple,
  Users as UsersIcon,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react';

import { supabase, invokeFunction } from '../../../shared/lib/supabase';
import type { Role } from '../../../contexts/AuthContext';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { formatDateTime } from '../../../shared/lib/format';
import { useDialog } from '../../../shared/components/ui/dialog-system';

interface UserPublic {
  id: string;
  nombre: string;
  email: string;
  role: Role;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const ROLES: Role[] = ['superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad'];

const ROLE_BADGES: Record<Role, string> = {
  superadmin: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
  admin: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  recepcion: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  limpieza: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  contabilidad: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800',
};

export default function UsersAdminPage() {
  const dialog = useDialog();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('recepcion');
  const [formError, setFormError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nombre, email, role, active, last_login_at, created_at')
        .order('nombre')
        .limit(100);
      if (error) throw new Error(error.message);
      setUsers((data ?? []) as UserPublic[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!nombre.trim() || !email.trim()) {
      setFormError('Completa nombre y email');
      return;
    }
    setCreating(true);
    try {
      await invokeFunction('admin-create-user', { nombre: nombre.trim(), email: email.trim(), role } as Record<string, unknown>);
      toast.success('Usuario creado. Invitacion enviada por email.');
      setNombre('');
      setEmail('');
      setRole('recepcion');
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear usuario');
    } finally {
      setCreating(false);
    }
  }

  async function onResendInvite(_id: string) {
    toast.info('Reenvio de invitacion: usa el dashboard de Supabase mientras no implementemos la edge function.');
  }

  async function onToggleActive(u: UserPublic) {
    if (!u.active) {
      try {
        const { error } = await supabase.from('profiles').update({ active: true }).eq('id', u.id);
        if (error) throw new Error(error.message);
        toast.success('Usuario reactivado');
        await loadUsers();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
      return;
    }
    if (!(await dialog.confirm({
      title: `Desactivar a ${u.nombre}?`,
      message: 'No podra iniciar sesion. Puedes reactivarlo despues sin perder su historial.',
      danger: true,
      confirmLabel: 'Desactivar',
    }))) return;
    try {
      const { error } = await supabase.from('profiles').update({ active: false }).eq('id', u.id);
      if (error) throw new Error(error.message);
      toast.success('Usuario desactivado');
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle="Gestion de cuentas — solo superadmin"
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadUsers()}
              disabled={loading}
              className="h-9 px-3 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted transition-all flex items-center gap-1.5 disabled:opacity-60"
            >
              <ArrowClockwise size={12} weight="bold" />
              Refrescar
            </button>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="h-9 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 flex items-center gap-1.5"
            >
              <Plus size={12} weight="bold" />
              Nuevo usuario
            </button>
          </>
        }
      />

      {/* Form crear */}
      {showForm && (
        <div className="bg-card rounded-3xl border border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] p-6">
          <h3 className="font-semibold">Nuevo usuario</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Se enviara un email con link para establecer su contrasena (valido 24h).
          </p>

          <form onSubmit={onCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
                Nombre
              </label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Maria Lopez"
                className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@hotel.com"
                className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block px-1">
                Rol
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full h-11 px-4 rounded-xl border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card cursor-pointer appearance-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {formError && (
              <div className="md:col-span-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 font-medium">
                {formError}
              </div>
            )}

            <div className="md:col-span-3 flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-60"
              >
                {creating ? 'Creando...' : 'Crear usuario'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormError(null);
                }}
                className="h-11 px-6 border border-border bg-card rounded-xl font-semibold text-sm hover:bg-muted transition-all"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-card rounded-3xl border border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground mt-3">Cargando usuarios...</p>
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Sin usuarios"
            description="Aun no se han creado cuentas. Empieza creando un usuario para tu equipo."
            action={
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="h-9 px-4 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
              >
                Crear primer usuario
              </button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Usuario</th>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</th>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Rol</th>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ultimo login</th>
                    <th className="px-5 py-2.5 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const initials =
                      u.nombre
                        .split(' ')
                        .map((w) => w[0])
                        .filter(Boolean)
                        .join('')
                        .toUpperCase()
                        .slice(0, 2) || '??';
                    return (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-extrabold text-[11px]">
                              {initials}
                            </div>
                            <span className="font-semibold">{u.nombre}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${ROLE_BADGES[u.role]}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {u.active ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle size={12} weight="duotone" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                              <XCircle size={12} weight="duotone" />
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-[12px]">
                          {u.last_login_at ? formatDateTime(u.last_login_at) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => void onResendInvite(u.id)}
                              title="Reenviar invitacion"
                              className="h-8 px-2.5 text-[11px] font-semibold border border-border bg-card rounded-lg hover:bg-muted transition-all flex items-center gap-1"
                            >
                              <EnvelopeSimple size={12} weight="bold" />
                              Reenviar
                            </button>
                            <button
                              type="button"
                              onClick={() => void onToggleActive(u)}
                              className={`h-8 px-2.5 text-[11px] font-semibold rounded-lg transition-all ${
                                u.active
                                  ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50'
                                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
                              }`}
                            >
                              {u.active ? 'Desactivar' : 'Reactivar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {users.map((u) => {
                const initials =
                  u.nombre
                    .split(' ')
                    .map((w) => w[0])
                    .filter(Boolean)
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || '??';
                return (
                  <div key={u.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-extrabold text-xs">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{u.nombre}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${ROLE_BADGES[u.role]}`}>
                        {u.role}
                      </span>
                      <span className={`text-[11px] font-semibold ${u.active ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {u.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => void onResendInvite(u.id)}
                        className="flex-1 h-8 text-[11px] font-semibold border border-border bg-card rounded-lg hover:bg-muted transition-all"
                      >
                        Reenviar invite
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleActive(u)}
                        className={`flex-1 h-8 text-[11px] font-semibold rounded-lg ${
                          u.active
                            ? 'border border-red-200 bg-red-50 text-red-700'
                            : 'bg-primary text-primary-foreground'
                        }`}
                      >
                        {u.active ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
