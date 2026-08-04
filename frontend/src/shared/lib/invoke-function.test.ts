import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reproduce las clases de error de @supabase/functions-js.
// Lo importante: FunctionsHttpError se construye como `new FunctionsHttpError(response)`,
// asi que `error.context` ES el Response, no `{ response }`.
class FunctionsHttpError extends Error {
  context: unknown;
  constructor(context: unknown) {
    super('Edge Function returned a non-2xx status code');
    this.name = 'FunctionsHttpError';
    this.context = context;
  }
}

const invokeSpy = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ functions: { invoke: invokeSpy } }),
}));

// Forma del ApiError que invokeFunction lanza; sirve para tipar lo capturado
// en los tests que inspeccionan el error en vez de usar rejects.toMatchObject.
type CaughtApiError = { message: string; code: string; status: number };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('invokeFunction — lectura del error de edge function (bugs 4 y 9)', () => {
  beforeEach(() => {
    vi.resetModules();
    invokeSpy.mockReset();
  });

  it('extrae el mensaje en español del body cuando context ES el Response', async () => {
    // Este es el caso real que fallaba: la UI mostraba
    // "Edge Function returned a non-2xx status code" en vez del mensaje util.
    invokeSpy.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        jsonResponse({ success: false, error: 'fecha_salida debe ser posterior a fecha_entrada', code: 'VALIDATION_ERROR' }, 400),
      ),
    });

    const { invokeFunction } = await import('./supabase');
    await expect(invokeFunction('booking-create', {})).rejects.toMatchObject({
      message: 'fecha_salida debe ser posterior a fecha_entrada',
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  });

  it('nunca deja escapar el mensaje generico en ingles', async () => {
    invokeSpy.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        jsonResponse({ success: false, error: 'La habitacion ya tiene una reserva en ese rango', code: 'CONFLICT' }, 409),
      ),
    });

    const { invokeFunction } = await import('./supabase');
    const err = (await invokeFunction('booking-create', {}).catch((e) => e)) as CaughtApiError;
    expect(err.message).not.toContain('non-2xx');
    expect(err.code).toBe('CONFLICT');
  });

  it('sigue funcionando si context viniera envuelto como { response }', async () => {
    invokeSpy.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({ response: jsonResponse({ error: 'Sin permiso', code: 'FORBIDDEN' }, 403) }),
    });

    const { invokeFunction } = await import('./supabase');
    await expect(invokeFunction('admin-create-user', {})).rejects.toMatchObject({
      message: 'Sin permiso',
      code: 'FORBIDDEN',
    });
  });

  it('usa el texto plano si el body no es JSON', async () => {
    invokeSpy.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response('Gateway timeout', { status: 504 })),
    });

    const { invokeFunction } = await import('./supabase');
    const err = (await invokeFunction('booking-create', {}).catch((e) => e)) as CaughtApiError;
    expect(err.message).toContain('Gateway timeout');
    expect(err.status).toBe(504);
  });

  it('devuelve data cuando la funcion responde { success: true }', async () => {
    invokeSpy.mockResolvedValue({ data: { success: true, data: { id: 64 } }, error: null });

    const { invokeFunction } = await import('./supabase');
    await expect(invokeFunction<{ id: number }>('booking-create', {})).resolves.toEqual({ id: 64 });
  });

  it('lanza ApiError si la funcion responde 200 con { success: false }', async () => {
    invokeSpy.mockResolvedValue({
      data: { success: false, error: 'Reserva no encontrada', code: 'NOT_FOUND' },
      error: null,
    });

    // Importamos ApiError del MISMO grafo de modulos que invokeFunction:
    // vi.resetModules() crea una copia nueva de cada modulo, asi que la clase
    // importada arriba del fichero ya no es la misma identidad.
    const [{ invokeFunction }, { ApiError: FreshApiError }] = await Promise.all([
      import('./supabase'),
      import('../api/client'),
    ]);
    const err = (await invokeFunction('booking-checkin', {}).catch((e) => e)) as CaughtApiError;
    expect(err).toBeInstanceOf(FreshApiError);
    expect(err.message).toBe('Reserva no encontrada');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('corta con TimeoutError si la edge function no responde', async () => {
    vi.useFakeTimers();
    invokeSpy.mockReturnValue(new Promise(() => { /* colgada */ }));

    const { invokeFunction } = await import('./supabase');
    const p = invokeFunction('booking-checkin', {}, { timeoutMs: 20000 });
    const assertion = expect(p).rejects.toThrow(/booking-checkin/);
    await vi.advanceTimersByTimeAsync(20001);
    await assertion;
    vi.useRealTimers();
  });
});
