// Mock encadenable del cliente de Supabase para los tests de la capa API.
//
// supabase-js devuelve un query builder que es "thenable": se encadena
// (.select().eq().order()) y se resuelve con await. Aqui replicamos ese
// comportamiento y ademas registramos las llamadas, para poder afirmar cosas
// como "el calendario filtra por status" o "las habitaciones se ordenan por
// numero_sort".

export interface QueryCall {
  table: string;
  method: string;
  args: unknown[];
}

export interface TableResult {
  data?: unknown;
  error?: unknown;
  /** Resultado especifico para .single() / .maybeSingle(). Por defecto, data[0]. */
  single?: unknown;
  count?: number;
}

export interface SupabaseMock {
  client: {
    from: (table: string) => unknown;
    rpc: (name: string, params?: unknown) => Promise<{ data: unknown; error: unknown }>;
    auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  };
  calls: QueryCall[];
  rpcCalls: Array<{ name: string; params?: unknown }>;
  /** Devuelve las llamadas encadenadas sobre una tabla. */
  callsOn: (table: string) => QueryCall[];
  /** Argumentos de la primera llamada a `method` sobre `table`. */
  argsOf: (table: string, method: string) => unknown[] | undefined;
}

const TERMINALS = new Set(['single', 'maybeSingle']);

export function createSupabaseMock(
  tables: Record<string, TableResult>,
  rpcs: Record<string, unknown> = {},
): SupabaseMock {
  const calls: QueryCall[] = [];
  const rpcCalls: Array<{ name: string; params?: unknown }> = [];

  function buildQuery(table: string) {
    const result = tables[table];
    if (!result) {
      throw new Error(
        `El test no configuro la tabla "${table}". Anadela al mock para saber que devuelve.`,
      );
    }

    const rows = Array.isArray(result.data) ? result.data : result.data ?? [];

    const resolveList = () => ({
      data: result.error ? null : result.data ?? [],
      error: result.error ?? null,
      count: result.count ?? (Array.isArray(rows) ? rows.length : 0),
    });

    const resolveSingle = () => ({
      data: result.error
        ? null
        : result.single !== undefined
          ? result.single
          : Array.isArray(rows)
            ? rows[0] ?? null
            : rows,
      error: result.error ?? null,
    });

    const proxy: Record<string, unknown> = {};

    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string) {
        if (prop === 'then') {
          // Hace el builder awaitable, como el real.
          return (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve(resolveList()).then(onFulfilled);
        }
        return (...args: unknown[]) => {
          calls.push({ table, method: prop, args });
          if (TERMINALS.has(prop)) return Promise.resolve(resolveSingle());
          return new Proxy(proxy, handler);
        };
      },
    };

    return new Proxy(proxy, handler);
  }

  return {
    client: {
      from: (table: string) => buildQuery(table),
      rpc: (name: string, params?: unknown) => {
        rpcCalls.push({ name, params });
        if (!(name in rpcs)) {
          return Promise.resolve({
            data: null,
            error: { message: `RPC "${name}" no configurada en el mock` },
          });
        }
        return Promise.resolve({ data: rpcs[name], error: null });
      },
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-test-1' } } }),
      },
    },
    calls,
    rpcCalls,
    callsOn: (table: string) => calls.filter((c) => c.table === table),
    argsOf: (table: string, method: string) =>
      calls.find((c) => c.table === table && c.method === method)?.args,
  };
}
