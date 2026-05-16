// Dashboard placeholder con KpiCards. En Fase 03.5 se conecta a /api/rooms/occupancy y /api/reports.

import { useAuth } from '../../../contexts/AuthContext';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { KpiCard } from '../../../shared/components/ui/KpiCard';
import {
  Bed,
  CalendarBlank,
  UserCircle,
  Receipt,
  CheckCircle,
  Clock,
  Wrench,
} from '@phosphor-icons/react';

export default function DashboardPage() {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hola, ${user?.nombre.split(' ')[0] ?? ''}`}
        subtitle={today}
      />

      {/* KPIs principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Bed}
          iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
          label="Ocupacion actual"
          value="—%"
          hint="Disponible cuando exista el modulo rooms"
        />
        <KpiCard
          icon={CalendarBlank}
          iconBg="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400"
          label="Reservas hoy"
          value="—"
          hint="Disponible cuando exista el modulo bookings"
        />
        <KpiCard
          icon={UserCircle}
          iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
          label="Clientes activos"
          value="—"
          hint="Disponible cuando exista el modulo customers"
        />
        <KpiCard
          icon={Receipt}
          iconBg="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
          label="Ingresos del dia"
          value="—"
          hint="Disponible cuando exista el modulo ledger"
        />
      </div>

      {/* Estado por habitacion */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card p-6 rounded-3xl border border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.05)]">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle size={20} weight="duotone" />
            </div>
          </div>
          <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">Disponibles</p>
          <h3 className="text-3xl font-extrabold mt-1 tracking-tight tabular-nums">—</h3>
          <p className="text-[11px] text-muted-foreground mt-1">habitaciones libres ahora</p>
        </div>

        <div className="bg-card p-6 rounded-3xl border border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.05)]">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock size={20} weight="duotone" />
            </div>
          </div>
          <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">En limpieza</p>
          <h3 className="text-3xl font-extrabold mt-1 tracking-tight tabular-nums">—</h3>
          <p className="text-[11px] text-muted-foreground mt-1">esperando housekeeping</p>
        </div>

        <div className="bg-card p-6 rounded-3xl border border-border shadow-[0_1px_2px_0_rgb(0_0_0/0.05)]">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center">
              <Wrench size={20} weight="duotone" />
            </div>
          </div>
          <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">En mantenimiento</p>
          <h3 className="text-3xl font-extrabold mt-1 tracking-tight tabular-nums">—</h3>
          <p className="text-[11px] text-muted-foreground mt-1">fuera de servicio</p>
        </div>
      </div>

      {/* Estado del proyecto */}
      <div className="bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 border border-border rounded-3xl p-6">
        <div className="mb-4">
          <h2 className="font-bold text-lg">Estado del proyecto</h2>
          <p className="text-xs text-muted-foreground">Setup completado — Fase 02 cerrada</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-card rounded-2xl p-4 border border-border">
            <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Funcional</p>
            <ul className="text-xs mt-2 space-y-1.5 text-muted-foreground">
              <li>Login / logout / refresh</li>
              <li>Set-password + change-password</li>
              <li>5 roles con guards backend y frontend</li>
              <li>CRUD de usuarios (solo superadmin)</li>
              <li>Dark mode + Plus Jakarta Sans</li>
            </ul>
          </div>
          <div className="bg-card rounded-2xl p-4 border border-border">
            <p className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Pendiente Fase 03</p>
            <ul className="text-xs mt-2 space-y-1.5 text-muted-foreground">
              <li>Habitaciones + tipos + estado real</li>
              <li>Reservas con calculo automatico</li>
              <li>Huespedes y estancias</li>
              <li>Check-in / check-out digital</li>
              <li>Dashboard real con datos</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
