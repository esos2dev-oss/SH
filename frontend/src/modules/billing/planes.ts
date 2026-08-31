// Catalogo de planes — SIN dependencias.
//
// Vive separado de billing.api.ts a proposito: la landing es publica y solo
// necesita los precios, pero si los importara de la api arrastraria el cliente
// de Supabase entero. Eso instancia GoTrue en una pagina sin sesion, que empieza
// a pedir el lock "sb-...-auth-token" del Navigator LockManager y llena la
// consola de:
//
//   Uncaught (in promise) Error: Acquiring an exclusive Navigator LockManager
//   lock "lock:sb-127-auth-token" immediately failed
//
// Ademas de ensuciar, es trabajo inutil: temporizadores de refresco de sesion
// corriendo para un visitante que aun no tiene cuenta.

export type PlanCode = 'esencial' | 'profesional' | 'grupo';

export interface Plan {
  code: PlanCode;
  nombre: string;
  resumen: string;
  maxHabitaciones: number;
  /** Precio de lista. Es el que se tacha cuando hay promocion. */
  precioMes: number;
  precioAnio: number;
  destacado?: boolean;
  incluye: string[];
}

/**
 * Tarifa plana por hotel, no por habitacion: para 10-30 habitaciones el hotel
 * prefiere previsibilidad, y cobrar por habitacion penaliza justo al cliente que
 * mas crece contigo.
 *
 * Los usuarios NO se cobran aparte a proposito: cobrar por usuario empuja a
 * compartir credenciales, y eso destruye la auditoria, que es parte del valor.
 */
export const PLANS: Plan[] = [
  {
    code: 'esencial',
    nombre: 'Esencial',
    resumen: 'Para posadas que llevan la operación del día a día.',
    maxHabitaciones: 12,
    precioMes: 19,
    precioAnio: 190,
    incluye: [
      'Reservas, check-in y check-out',
      'Huéspedes e historial',
      'Limpieza y mantenimiento',
      'Cobros en bolívares, dólares y euros',
      'Tasa BCV automática',
      'Usuarios ilimitados',
    ],
  },
  {
    code: 'profesional',
    nombre: 'Profesional',
    resumen: 'Cuando además hay que cuadrar caja y rendir cuentas.',
    maxHabitaciones: 30,
    precioMes: 39,
    precioAnio: 390,
    destacado: true,
    incluye: [
      'Todo lo del plan Esencial',
      'Cierre de caja y conciliación bancaria',
      'Contabilidad: ingresos y egresos',
      'Reportes de ocupación, ADR y RevPAR',
      'Desayunos y asistencia de personal',
      'Auditoría completa sin límite de tiempo',
    ],
  },
  {
    code: 'grupo',
    nombre: 'Grupo',
    resumen: 'Varias propiedades bajo una misma cuenta.',
    maxHabitaciones: 80,
    precioMes: 79,
    precioAnio: 790,
    incluye: [
      'Todo lo del plan Profesional',
      'Varios hoteles en una sola cuenta',
      'Vista consolidada del grupo',
      'Tu logo en lugar del nuestro',
      'Soporte prioritario',
    ],
  },
];

/** 20 % de descuento a partir del segundo hotel del mismo propietario. */
export const DESCUENTO_HOTEL_ADICIONAL = 0.2;

// ---------------------------------------------------------------------------
// Promocion de lanzamiento
// ---------------------------------------------------------------------------
/**
 * Descuento de lanzamiento, temporal y explicito.
 *
 * Se hace asi y no bajando el precio de lista porque en un producto de
 * suscripcion es facil bajar precios y muy dificil subirlos: arrancar en 39 y
 * descontar el 50 % durante seis meses deja el precio de lista intacto para
 * cuando la promocion termine. Poner 19 como precio real y subirlo despues
 * genera bajas y mala sangre con los primeros clientes, que son los que mas
 * cuidas.
 *
 * Poner `activa: false` desactiva la promocion en toda la aplicacion.
 */
export const PROMO = {
  activa: true,
  etiqueta: 'Precio de lanzamiento',
  /** 0.5 = mitad de precio. */
  descuento: 0.5,
  meses: 6,
  /** Plazas limitadas: hace creible que la oferta acabe. */
  plazas: 20,
  detalle: 'para los 20 primeros hoteles',
} as const;

/** Precio final tras la promocion, redondeado al entero mas cercano. */
export function precioConPromo(precio: number): number {
  if (!PROMO.activa) return precio;
  return Math.round(precio * (1 - PROMO.descuento));
}

export function planByCode(code: PlanCode): Plan {
  return PLANS.find((p) => p.code === code) ?? PLANS[0]!;
}
