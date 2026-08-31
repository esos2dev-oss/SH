// Sidebar principal con navegacion filtrada por rol.

import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  House,
  Bed,
  CalendarBlank,
  UserCircle,
  ClipboardText,
  CurrencyCircleDollar,
  Receipt,
  ChartLineUp,
  Gear,
  Users,
  Notebook,
  Calculator,
  SignOut,
  CaretRight,
  Sun,
  Moon,
  ShieldCheck,
  Question,
  Coffee,
  Clock,
  Lightning,
  CreditCard,
  type IconProps,
} from '@phosphor-icons/react';
import { useAuth, type Role } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { cn } from '../../lib/cn';
import { APP_NAME, APP_LOGO } from '../../lib/brand';
import { HotelSwitcher } from '../../../modules/billing/components/HotelSwitcher';
import { getHotelConfig } from '../../../modules/billing/api/hotels.api';

type IconType = ComponentType<IconProps>;

interface NavItemDef {
  to: string;
  label: string;
  icon?: IconType;
  roles?: Role[];
  /** Modulo opcional del que depende. Si el hotel no lo activo en el alta, la
   *  entrada no se enseña: un menu con diez secciones que no usas hace parecer
   *  complicado un sistema que no lo es. Sin valor = siempre visible. */
  modulo?: string;
}

interface NavGroupDef {
  label: string;
  icon: IconType;
  roles?: Role[];
  modulo?: string;
  children: NavItemDef[];
}

type NavEntry = NavItemDef | NavGroupDef;

function isGroup(entry: NavEntry): entry is NavGroupDef {
  return (entry as NavGroupDef).children !== undefined;
}

const NAV: NavEntry[] = [
  { label: 'Dashboard', to: '/', icon: House },
  {
    label: 'Habitaciones',
    icon: Bed,
    roles: ['superadmin', 'admin', 'recepcion', 'limpieza'],
    children: [
      { to: '/habitaciones', label: 'Panel', roles: ['superadmin', 'admin', 'recepcion'] },
      { to: '/habitaciones/tipos', label: 'Tipos y tarifas', roles: ['superadmin', 'admin'] },
      { to: '/limpieza', label: 'Limpieza', roles: ['superadmin', 'admin', 'limpieza'] },
      { to: '/mantenimiento', label: 'Mantenimiento', modulo: 'mantenimiento', roles: ['superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad'] },
    ],
  },
  { label: 'Reservas', to: '/reservas', icon: CalendarBlank, roles: ['superadmin', 'admin', 'recepcion', 'contabilidad'] },
  { label: 'Calendario', to: '/reservas/calendario', icon: ClipboardText, roles: ['superadmin', 'admin', 'recepcion'] },
  { label: 'Timeline', to: '/reservas/timeline', icon: ClipboardText, roles: ['superadmin', 'admin', 'recepcion'] },
  { label: 'Huespedes', to: '/huespedes', icon: UserCircle, roles: ['superadmin', 'admin', 'recepcion', 'contabilidad'] },
  { label: 'Desayunos', to: '/desayunos', icon: Coffee, modulo: 'desayunos', roles: ['superadmin', 'admin', 'recepcion', 'contabilidad', 'restaurante'] },
  { label: 'Asistencia', to: '/asistencia', icon: Clock, modulo: 'asistencia' },
  { label: 'Planta electrica', to: '/planta', icon: Lightning, modulo: 'planta', roles: ['superadmin', 'admin', 'recepcion', 'limpieza', 'contabilidad'] },
  {
    label: 'Pagos',
    icon: CurrencyCircleDollar,
    roles: ['superadmin', 'admin', 'recepcion', 'contabilidad'],
    children: [
      { to: '/pagos', label: 'Lista de pagos' },
      { to: '/pagos/conciliacion', label: 'Conciliacion bancaria', modulo: 'conciliacion', roles: ['superadmin', 'admin', 'contabilidad'] },
      { to: '/pagos/cierre-caja', label: 'Cierre de caja' },
      { to: '/pagos/configuracion', label: 'Configuracion', roles: ['superadmin', 'admin'] },
    ],
  },
  {
    label: 'Finanzas',
    icon: Calculator,
    roles: ['superadmin', 'admin', 'contabilidad'],
    children: [
      { to: '/finanzas', label: 'Ingresos / Egresos', icon: Receipt },
      { to: '/reportes', label: 'Reportes', icon: ChartLineUp },
    ],
  },
];

function canSee(entry: NavEntry, role: Role, modulos: string[] | null): boolean {
  // modulos === null significa "todavia no se ha cargado la configuracion": se
  // enseña todo. Ocultar entradas mientras carga produce un menu que salta.
  if (entry.modulo && modulos !== null && !modulos.includes(entry.modulo)) return false;
  if (!entry.roles) return true;
  return entry.roles.includes(role);
}

interface NavLinkItemProps {
  to: string;
  icon?: IconType;
  label: string;
  onNavigate?: () => void;
  end?: boolean;
}

function NavLinkItem({ to, icon: Icon, label, onNavigate, end }: NavLinkItemProps) {
  return (
    <NavLink
      to={to}
      end={end ?? to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all',
          isActive
            ? 'bg-primary/10 text-primary font-bold shadow-sm'
            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span aria-hidden="true" className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />
          )}
          {Icon && <Icon size={18} weight={isActive ? 'duotone' : 'regular'} />}
          <span className="flex-1 truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

interface NavGroupProps {
  group: NavGroupDef;
  role: Role;
  modulos: string[] | null;
  onNavigate?: () => void;
}

function NavGroup({ group, role, modulos, onNavigate }: NavGroupProps) {
  const visible = group.children.filter((c) => canSee(c, role, modulos));
  const location = useLocation();
  const hasActive = visible.some((c) => location.pathname === c.to || location.pathname.startsWith(c.to + '/'));
  const [open, setOpen] = useState(hasActive);
  if (!visible.length) return null;
  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all',
          hasActive ? 'text-foreground font-bold' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
        )}
      >
        <Icon size={18} weight={hasActive ? 'duotone' : 'regular'} />
        <span className="flex-1 text-left">{group.label}</span>
        <CaretRight size={12} weight="bold" className={cn('transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="ml-4 mt-0.5 pl-4 border-l border-border space-y-0.5">
          {visible.map((child) => {
            // Si la url de este child es prefix de la url de otro hermano,
            // forzamos match exacto para evitar activacion doble.
            // Ej: '/habitaciones' es prefix de '/habitaciones/tipos' -> end=true en '/habitaciones'.
            const isPrefixOfSibling = visible.some(
              (s) => s.to !== child.to && s.to.startsWith(child.to + '/'),
            );
            return (
            <NavLink
              key={child.to}
              to={child.to}
              end={isPrefixOfSibling}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'block px-3 py-1.5 rounded-lg text-[12px] transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )
              }
            >
              <span className="truncate">{child.label}</span>
            </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // Modulos que el hotel activo eligio en el alta guiada. Null mientras carga.
  const [modulos, setModulos] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelado = false;
    getHotelConfig()
      .then((cfg) => { if (!cancelado && cfg) setModulos(cfg.modulos ?? []); })
      // Si falla, se queda en null y se enseña el menu completo: preferimos
      // enseñar de mas que dejar a alguien sin acceso a su propia seccion.
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  if (!user) return null;

  const initials =
    user.nombre
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??';

  const rolLabel: Record<Role, string> = {
    superadmin: 'Superadmin',
    admin: 'Admin',
    recepcion: 'Recepcion',
    limpieza: 'Limpieza',
    contabilidad: 'Contabilidad',
    restaurante: 'Restaurante',
  };

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <aside
      role="navigation"
      aria-label="Menu principal"
      className="w-64 border-r bg-card h-screen fixed left-0 top-0 flex flex-col p-4 z-40"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <img src={APP_LOGO} alt={APP_NAME} className="w-9 h-9 rounded-lg object-contain bg-white shadow-sm p-0.5" />
        <span className="font-extrabold text-sm tracking-tight text-foreground">{APP_NAME}</span>
      </div>

      <HotelSwitcher onNavigate={onNavigate} />

      {/* Navigation */}
      <nav className="space-y-0.5 flex-1 overflow-y-auto -mx-1 px-1">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-3 mb-2">Operacion</p>
        {(() => {
          const visibleEntries = NAV.filter((e) => canSee(e, user.role, modulos));
          // Recopilar todas las URLs (top-level + children) para detectar prefijos.
          const allUrls: string[] = [];
          for (const e of visibleEntries) {
            if (isGroup(e)) {
              for (const c of e.children) if (canSee(c, user.role, modulos)) allUrls.push(c.to);
            } else {
              allUrls.push(e.to);
            }
          }
          const isPrefixOfOther = (url: string) =>
            allUrls.some((u) => u !== url && u.startsWith(url + '/'));

          return visibleEntries.map((entry) =>
            isGroup(entry) ? (
              <NavGroup key={entry.label} group={entry} role={user.role} modulos={modulos} onNavigate={onNavigate} />
            ) : (
              <NavLinkItem
                key={entry.to}
                to={entry.to}
                icon={entry.icon}
                label={entry.label}
                onNavigate={onNavigate}
                end={isPrefixOfOther(entry.to)}
              />
            ),
          );
        })()}

        {(user.role === 'superadmin' || user.role === 'admin') && (
          <>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-3 mt-5 mb-2">Admin</p>
            {user.role === 'superadmin' && (
              <NavLinkItem to="/configuracion/usuarios" icon={Users} label="Usuarios" onNavigate={onNavigate} />
            )}
            <NavLinkItem to="/configuracion/auditoria" icon={Notebook} label="Audit log" onNavigate={onNavigate} />
            <NavLinkItem to="/suscripcion" icon={CreditCard} label="Suscripcion" onNavigate={onNavigate} />
          </>
        )}
      </nav>

      {/* Footer: Beta + Theme + User */}
      <div className="mt-auto pt-4 border-t border-border space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
          <ShieldCheck size={14} weight="duotone" className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            v0.1.0 Fase Beta
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-all"
        >
          {isDark ? <Sun size={18} weight="duotone" /> : <Moon size={18} weight="duotone" />}
          {isDark ? 'Modo claro' : 'Modo oscuro'}
        </button>

        <NavLinkItem to="/ayuda" icon={Question} label="Ayuda" onNavigate={onNavigate} />

        {(user.role === 'superadmin' || user.role === 'admin') && (
          <NavLinkItem to="/configuracion" icon={Gear} label="Configuracion" onNavigate={onNavigate} />
        )}

        <div className="flex items-center gap-3 px-2">
          <button
            type="button"
            onClick={() => {
              navigate('/perfil');
              onNavigate?.();
            }}
            className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-extrabold text-xs hover:bg-primary/20 transition-colors"
            title="Mi perfil"
          >
            {initials}
          </button>
          <button
            type="button"
            onClick={() => {
              navigate('/perfil');
              onNavigate?.();
            }}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-xs font-bold text-foreground truncate tracking-tight">{user.nombre}</p>
            <p className="text-[10px] text-muted-foreground">{rolLabel[user.role]}</p>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-red-500 transition-colors p-1"
            title="Cerrar sesion"
          >
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
