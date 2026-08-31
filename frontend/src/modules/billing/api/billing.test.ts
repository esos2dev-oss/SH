import { describe, it, expect } from 'vitest';
import {
  PLANS, PROMO, precioConPromo, planByCode, DESCUENTO_HOTEL_ADICIONAL, type PlanCode,
} from '../planes';

// El catalogo de planes es el precio del producto. Un error aqui no rompe la
// aplicacion: cobra de menos, cobra de mas, o promete algo que el plan no da.
// Ninguna de las tres se detecta mirando la pantalla.

describe('catalogo de planes', () => {
  it('tiene los tres planes esperados, en orden creciente', () => {
    expect(PLANS.map((p) => p.code)).toEqual(['esencial', 'profesional', 'grupo']);
  });

  it('el precio sube con el tamaño del plan', () => {
    for (let i = 1; i < PLANS.length; i++) {
      expect(PLANS[i]!.precioMes).toBeGreaterThan(PLANS[i - 1]!.precioMes);
      expect(PLANS[i]!.maxHabitaciones).toBeGreaterThan(PLANS[i - 1]!.maxHabitaciones);
    }
  });

  it('el plan anual equivale a diez meses (dos gratis)', () => {
    // Es la promesa que se le hace al cliente en la pagina de precios. Si el
    // dato de aqui y el texto de alli divergen, el cliente lo nota al pagar.
    for (const plan of PLANS) {
      expect(plan.precioAnio).toBe(plan.precioMes * 10);
    }
  });

  it('el anual sale mas barato que doce meses sueltos', () => {
    for (const plan of PLANS) {
      expect(plan.precioAnio).toBeLessThan(plan.precioMes * 12);
    }
  });

  it('solo hay un plan destacado', () => {
    expect(PLANS.filter((p) => p.destacado)).toHaveLength(1);
  });

  it('ningun plan se queda sin lista de lo que incluye', () => {
    for (const plan of PLANS) {
      expect(plan.incluye.length).toBeGreaterThan(0);
      expect(plan.nombre.trim()).not.toBe('');
    }
  });

  it('los precios son enteros positivos en USD', () => {
    for (const plan of PLANS) {
      expect(Number.isInteger(plan.precioMes)).toBe(true);
      expect(plan.precioMes).toBeGreaterThan(0);
      expect(Number.isInteger(plan.precioAnio)).toBe(true);
    }
  });

  it('se mantiene por debajo del precio por habitacion de la competencia', () => {
    // Referencia de agosto de 2026: Cloudbeds y Little Hotelier arrancan sobre
    // 15 USD por habitacion y mes. La propuesta de valor es costar bastante
    // menos que eso; si algun dia deja de cumplirse, que salte aqui y sea una
    // decision consciente y no un descuido.
    for (const plan of PLANS) {
      const equivalenteCompetencia = plan.maxHabitaciones * 15;
      expect(plan.precioMes).toBeLessThan(equivalenteCompetencia / 2);
    }
  });
});

describe('planByCode', () => {
  it('devuelve el plan que corresponde a cada codigo', () => {
    const codigos: PlanCode[] = ['esencial', 'profesional', 'grupo'];
    for (const codigo of codigos) {
      expect(planByCode(codigo).code).toBe(codigo);
    }
  });

  it('ante un codigo desconocido cae al plan mas bajo', () => {
    // Preferimos degradar al plan menor que reventar la pantalla: si la base
    // devolviera un plan que el frontend no conoce (por ejemplo tras añadir uno
    // nuevo en servidor), el hotel sigue pudiendo usar la aplicacion.
    expect(planByCode('inexistente' as PlanCode).code).toBe('esencial');
  });
});

describe('descuento por hotel adicional', () => {
  it('es del 20 %', () => {
    expect(DESCUENTO_HOTEL_ADICIONAL).toBe(0.2);
  });

  it('aplicado al plan profesional da el precio esperado', () => {
    const profesional = planByCode('profesional');
    const segundoHotel = profesional.precioMes * (1 - DESCUENTO_HOTEL_ADICIONAL);
    expect(segundoHotel).toBeCloseTo(31.2, 2);
  });
});

// ---------------------------------------------------------------------------

describe('promocion de lanzamiento', () => {
  it('el precio con promo es menor que el de lista', () => {
    for (const plan of PLANS) {
      expect(precioConPromo(plan.precioMes)).toBeLessThan(plan.precioMes);
    }
  });

  it('aplica exactamente el descuento anunciado', () => {
    for (const plan of PLANS) {
      expect(precioConPromo(plan.precioMes)).toBe(
        Math.round(plan.precioMes * (1 - PROMO.descuento)),
      );
    }
  });

  it('deja precios en dolares enteros', () => {
    // Un "19,50 $/mes" en una tarjeta de precios se lee como un error.
    for (const plan of PLANS) {
      expect(Number.isInteger(precioConPromo(plan.precioMes))).toBe(true);
      expect(Number.isInteger(precioConPromo(plan.precioAnio))).toBe(true);
    }
  });

  it('coincide con lo que cobra el servidor', () => {
    // El servidor (supabase/functions/_shared/billing.ts) trabaja en centavos y
    // redondea a dolar entero. Si estas dos cuentas divergen, la landing anuncia
    // un precio y Stripe cobra otro — y el cliente lo descubre pagando.
    const importeServidor = (dolares: number) => {
      const centavos = dolares * 100;
      return Math.round((centavos * (1 - PROMO.descuento)) / 100) * 100;
    };
    for (const plan of PLANS) {
      expect(importeServidor(plan.precioMes) / 100).toBe(precioConPromo(plan.precioMes));
      expect(importeServidor(plan.precioAnio) / 100).toBe(precioConPromo(plan.precioAnio));
    }
  });

  it('la promocion es temporal y limitada, no un precio nuevo', () => {
    // Si algun dia se deja fija, mejor que salte aqui: en suscripciones es facil
    // bajar precios y muy dificil subirlos.
    expect(PROMO.meses).toBeGreaterThan(0);
    expect(PROMO.meses).toBeLessThanOrEqual(12);
    expect(PROMO.plazas).toBeGreaterThan(0);
  });
});
