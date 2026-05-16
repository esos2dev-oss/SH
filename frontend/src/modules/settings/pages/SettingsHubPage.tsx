// Hub de configuracion. Cards a cada subseccion segun rol del usuario.

import { Link } from 'react-router-dom';
import {
  Users, Notebook, CurrencyCircleDollar, Bed, Gear, ArrowRight, type IconProps,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import { useAuth, type Role } from '../../../contexts/AuthContext';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { cn } from '../../../shared/lib/cn';

type IconType = ComponentType<IconProps>;

interface SettingCard {
  to: string;
  title: string;
  description: string;
  icon: IconType;
  roles: Role[];
  color: string;
}

const CARDS: SettingCard[] = [
  {
    to: '/payments/settings',
    title: 'Pagos y tasa BCV',
    description: 'Tasa Bs/USD del dia + datos del hotel para Pago Movil.',
    icon: CurrencyCircleDollar,
    roles: ['superadmin', 'admin'],
    color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/50',
  },
  {
    to: '/rooms/types',
    title: 'Tipos y tarifas',
    description: 'Define tipos de habitacion con tarifas por dia/semana/mes.',
    icon: Bed,
    roles: ['superadmin', 'admin'],
    color: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-900/50',
  },
  {
    to: '/settings/users',
    title: 'Usuarios',
    description: 'Crea, desactiva y resetea contrasenas. Solo superadmin.',
    icon: Users,
    roles: ['superadmin'],
    color: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/50',
  },
  {
    to: '/settings/audit',
    title: 'Audit log',
    description: 'Bitacora de acciones sensibles del sistema.',
    icon: Notebook,
    roles: ['superadmin', 'admin'],
    color: 'bg-slate-100 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-slate-800/50',
  },
];

export default function SettingsHubPage() {
  const { user } = useAuth();
  if (!user) return null;

  const accessible = CARDS.filter((c) => c.roles.includes(user.role));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuracion"
        subtitle="Ajusta el sistema a tu hotel. Cambios aplican de inmediato a toda la operacion."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {accessible.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.to}
              to={c.to}
              className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-md transition-all relative"
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center border', c.color)}>
                <Icon size={20} weight="duotone" />
              </div>
              <h3 className="mt-3 font-bold text-sm tracking-tight">{c.title}</h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
              <ArrowRight
                size={14}
                weight="bold"
                className="absolute top-5 right-5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
              />
            </Link>
          );
        })}
      </div>

      {accessible.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Gear size={32} weight="duotone" className="mx-auto mb-2 opacity-50" />
          Tu rol no tiene acceso a opciones de configuracion.
        </div>
      )}
    </div>
  );
}
