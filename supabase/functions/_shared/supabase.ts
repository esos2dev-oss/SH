// Cliente Supabase para edge functions.
// - userClient: ejecuta queries con el JWT del usuario (sujeto a RLS).
// - adminClient: ejecuta con service_role (bypass RLS) — solo para operaciones admin.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function requireUser(req: Request) {
  const client = userClient(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    throw new Response(
      JSON.stringify({ success: false, error: 'No autenticado', code: 'UNAUTHORIZED' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return { client, user };
}
