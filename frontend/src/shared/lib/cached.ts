// Cache en memoria + localStorage con TTL, para queries estaticas que se
// repiten en muchas paginas (tipos de cabana, categorias ledger, tasa BCV,
// settings del hotel). Reduce el trafico Venezuela ↔ Singapur significativamente.
//
// Uso:
//   const data = await cached('room_types', 5 * 60_000, () => listRoomTypes());
// Invalidacion (tras crear/editar un tipo):
//   invalidate('room_types');

const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

const PREFIX = 'sh-cache:';

function readStorage(key: string): { value: unknown; expiresAt: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: unknown; expiresAt: number };
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function writeStorage(key: string, value: unknown, expiresAt: number): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ value, expiresAt })); }
  catch { /* quota o serializacion — ignoramos */ }
}

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();

  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > now) return mem.value as T;

  const store = readStorage(key);
  if (store && store.expiresAt > now) {
    memoryCache.set(key, store);
    return store.value as T;
  }

  const value = await fetcher();
  const expiresAt = now + ttlMs;
  memoryCache.set(key, { value, expiresAt });
  writeStorage(key, value, expiresAt);
  return value;
}

export function invalidate(key: string): void {
  memoryCache.delete(key);
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

export function invalidateAll(): void {
  memoryCache.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
