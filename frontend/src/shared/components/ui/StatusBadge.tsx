import { cn } from '../../lib/cn';

const ROOM_STATUS = {
  disponible: { label: 'Disponible', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' },
  ocupada: { label: 'Ocupada', cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800' },
  limpieza: { label: 'Limpieza', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800' },
  mantenimiento: { label: 'Mantenimiento', cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800' },
  fuera_servicio: { label: 'Fuera servicio', cls: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' },
} as const;

type RoomStatusKey = keyof typeof ROOM_STATUS;

const BOOKING_STATUS = {
  pendiente: { label: 'Pendiente', cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800' },
  confirmada: { label: 'Confirmada', cls: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800' },
  en_curso: { label: 'En curso', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' },
  finalizada: { label: 'Finalizada', cls: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' },
  cancelada: { label: 'Cancelada', cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800' },
  no_show: { label: 'No show', cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800' },
} as const;

type BookingStatusKey = keyof typeof BOOKING_STATUS;

const PAYMENT_STATUS = {
  pendiente: { label: 'Sin pagar', cls: 'bg-red-50 text-red-700 border-red-200' },
  parcial: { label: 'Parcial', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  pagado: { label: 'Pagado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  reembolsado: { label: 'Reembolsado', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
} as const;

type PaymentStatusKey = keyof typeof PAYMENT_STATUS;

const baseCls = 'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap';

export function RoomStatusBadge({ status, className }: { status: RoomStatusKey; className?: string }) {
  const cfg = ROOM_STATUS[status];
  return <span className={cn(baseCls, cfg.cls, className)}>{cfg.label}</span>;
}

export function BookingStatusBadge({ status, className }: { status: BookingStatusKey; className?: string }) {
  const cfg = BOOKING_STATUS[status];
  return <span className={cn(baseCls, cfg.cls, className)}>{cfg.label}</span>;
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatusKey; className?: string }) {
  const cfg = PAYMENT_STATUS[status];
  return <span className={cn(baseCls, cfg.cls, className)}>{cfg.label}</span>;
}
