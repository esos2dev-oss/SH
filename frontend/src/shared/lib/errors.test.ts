import { describe, it, expect, vi } from 'vitest';
import { errorMessage, withTimeout, TimeoutError } from './errors';
import { ApiError } from '../api/client';

describe('errorMessage', () => {
  // El patron viejo era:
  //   toast.error(err instanceof ApiError ? err.message : 'Error')
  // Cualquier error de supabase-js (que NO es ApiError) se mostraba como la
  // palabra "Error" y el usuario no sabia que habia pasado (bug 10).
  it('conserva el mensaje de un ApiError', () => {
    expect(errorMessage(new ApiError(409, 'La habitacion ya tiene una reserva', 'CONFLICT')))
      .toBe('La habitacion ya tiene una reserva');
  });

  it('conserva el mensaje de un Error normal en vez de decir "Error"', () => {
    expect(errorMessage(new Error('El correo ya existe'))).toBe('El correo ya existe');
  });

  it('traduce codigos Postgres a lenguaje humano', () => {
    expect(errorMessage({ code: '23505', message: 'duplicate key value' }))
      .toContain('duplicado');
    expect(errorMessage({ code: '23P01', message: 'conflicting key value' }))
      .toContain('solapan');
    expect(errorMessage({ code: '42501', message: 'permission denied' }))
      .toContain('permisos');
  });

  it('adjunta el detalle de Postgres cuando lo hay', () => {
    const out = errorMessage({ code: '23505', details: 'Key (doc_numero)=(V-123) already exists' });
    expect(out).toContain('duplicado');
    expect(out).toContain('V-123');
  });

  it('usa el mensaje de un PostgrestError sin codigo conocido', () => {
    expect(errorMessage({ message: 'column "foo" does not exist', code: '42703' }))
      .toContain('column "foo" does not exist');
  });

  it('acepta un string suelto', () => {
    expect(errorMessage('Sin conexion')).toBe('Sin conexion');
  });

  it('cae al fallback solo cuando no hay nada aprovechable', () => {
    expect(errorMessage(null, 'No se pudo guardar')).toBe('No se pudo guardar');
    expect(errorMessage({}, 'No se pudo guardar')).toBe('No se pudo guardar');
  });

  it('nunca devuelve la cadena generica "Error"', () => {
    const casos = [null, undefined, {}, new Error(''), 0, false];
    for (const c of casos) {
      expect(errorMessage(c)).not.toBe('Error');
    }
  });
});

describe('withTimeout', () => {
  it('deja pasar el valor si la promesa resuelve a tiempo', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 'test', 1000)).resolves.toBe('ok');
  });

  it('propaga el error original si la promesa falla', async () => {
    await expect(withTimeout(Promise.reject(new Error('fallo real')), 'test', 1000))
      .rejects.toThrow('fallo real');
  });

  // Bug 4: sin timeout, una peticion colgada dejaba el boton en "Guardando..."
  // para siempre. Con dinero de por medio eso lleva a pagos duplicados.
  it('rechaza con TimeoutError si la promesa nunca resuelve', async () => {
    vi.useFakeTimers();
    const colgada = new Promise(() => { /* nunca resuelve */ });
    const p = withTimeout(colgada, 'registrar pago', 20000);
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(20001);
    await assertion;
    vi.useRealTimers();
  });

  it('el mensaje de timeout dice que operacion fallo y cuanto espero', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 'registrar pago', 20000);
    const assertion = expect(p).rejects.toThrow(/registrar pago.*20s/);
    await vi.advanceTimersByTimeAsync(20001);
    await assertion;
    vi.useRealTimers();
  });

  it('errorMessage sabe presentar un TimeoutError', () => {
    const out = errorMessage(new TimeoutError('crear reserva', 20000));
    expect(out).toContain('crear reserva');
    expect(out).not.toBe('Error');
  });
});
