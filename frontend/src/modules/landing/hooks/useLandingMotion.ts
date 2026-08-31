// Hooks de movimiento de la landing.
//
// Todos comparten una regla: si el sistema pide menos movimiento, no se anima
// nada y el contenido aparece en su estado final. Animar a quien ha pedido que
// no se anime no es un capricho estetico — a algunas personas el movimiento les
// provoca mareo.

import { useEffect, useRef, useState } from 'react';

/** true si el sistema pide reducir el movimiento. */
export function usaMenosMovimiento(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Marca un elemento como visible al entrar en pantalla, una sola vez.
 *
 * Se queda visible a proposito: reanimar al volver a entrar hace parpadear el
 * contenido cada vez que el usuario sube y baja, y hace perder el sitio.
 */
export function useRevelado<T extends HTMLElement>(margen = '-10% 0px -10% 0px') {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(() => usaMenosMovimiento());

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    // Sin IntersectionObserver se muestra todo: una animacion rota nunca puede
    // dejar la pagina en blanco.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: margen, threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [margen, visible]);

  return { ref, visible };
}

/**
 * Desplazamiento suave segun la posicion del elemento en pantalla (parallax).
 *
 * Devuelve un valor de -1 a 1: -1 cuando el elemento esta entrando por abajo,
 * 0 centrado, 1 saliendo por arriba. El componente decide cuanto lo mueve.
 *
 * El calculo va dentro de requestAnimationFrame porque leer getBoundingClientRect
 * en cada evento de scroll fuerza al navegador a recalcular el layout y la
 * pagina empieza a ir a tirones.
 */
export function useParallax<T extends HTMLElement>(contenedor?: React.RefObject<HTMLElement | null>) {
  const ref = useRef<T | null>(null);
  const [progreso, setProgreso] = useState(0);

  useEffect(() => {
    if (usaMenosMovimiento()) return;
    const el = ref.current;
    if (!el) return;

    const scroller: HTMLElement | Window = contenedor?.current ?? window;
    let pendiente = false;

    const calcular = () => {
      pendiente = false;
      const r = el.getBoundingClientRect();
      const alto = window.innerHeight || 1;
      // Centro del elemento respecto al centro de la pantalla, normalizado.
      const centro = r.top + r.height / 2;
      setProgreso(Math.max(-1, Math.min(1, (alto / 2 - centro) / (alto / 2))));
    };

    const alScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(calcular);
    };

    calcular();
    scroller.addEventListener('scroll', alScroll, { passive: true });
    window.addEventListener('resize', alScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', alScroll);
      window.removeEventListener('resize', alScroll);
    };
  }, [contenedor]);

  return { ref, progreso };
}

/**
 * Cuenta desde 0 hasta el valor final cuando el elemento entra en pantalla.
 *
 * Usa una curva de salida (easeOutExpo): arranca rapido y frena al final, que
 * es como se percibe natural. Un contador lineal parece una barra de progreso.
 */
export function useContador(valorFinal: number, duracionMs = 1400) {
  const { ref, visible } = useRevelado<HTMLSpanElement>();
  const [valor, setValor] = useState(0);

  useEffect(() => {
    if (!visible) return;
    if (usaMenosMovimiento()) {
      setValor(valorFinal);
      return;
    }

    let raf = 0;
    let inicio: number | null = null;

    const paso = (t: number) => {
      if (inicio === null) inicio = t;
      const avance = Math.min(1, (t - inicio) / duracionMs);
      const suavizado = avance === 1 ? 1 : 1 - Math.pow(2, -10 * avance);
      setValor(valorFinal * suavizado);
      if (avance < 1) raf = requestAnimationFrame(paso);
    };

    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [visible, valorFinal, duracionMs]);

  return { ref, valor };
}
