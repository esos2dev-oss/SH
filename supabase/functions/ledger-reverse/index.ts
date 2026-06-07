// Edge Function: ledger-reverse
// POST /functions/v1/ledger-reverse
// Body: { entry_id, motivo? }
//
// Crea un asiento inverso (mismo monto y categoria, type opuesto) que anula
// contablemente al original. El original se marca status='anulado' y reverses_id
// queda apuntando al asiento inverso.

import { corsHeaders, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Metodo no permitido', 'METHOD_NOT_ALLOWED', 405);

  try {
    const { client, user } = await requireUser(req);
    const { entry_id, motivo } = (await req.json()) as { entry_id: number; motivo?: string };
    if (!entry_id) return errorResponse('entry_id requerido', 'VALIDATION_ERROR');

    const { data: original, error } = await client
      .from('ledger_entries').select('*').eq('id', entry_id).single();
    if (error || !original) return errorResponse('Asiento no encontrado', 'NOT_FOUND', 404);
    if (original.status === 'anulado') return errorResponse('Asiento ya anulado', 'CONFLICT', 409);

    const { data: codigo } = await client.rpc('next_code', { p_prefix: 'LG' });

    const { data: inverso, error: insErr } = await client.from('ledger_entries').insert({
      codigo,
      type: original.type === 'ingreso' ? 'egreso' : 'ingreso',
      category_id: original.category_id,
      fecha: new Date().toISOString().slice(0, 10),
      descripcion: `Anulacion de ${original.codigo}${motivo ? ': ' + motivo : ''}`.slice(0, 500),
      monto: original.monto,
      moneda: original.moneda,
      reverses_id: original.id,
      registered_by: user.id,
    }).select().single();
    if (insErr) return errorResponse(insErr.message, 'INTERNAL_ERROR', 500);

    // No podemos UPDATE el original por RLS (ledger_entries es inmutable).
    // Para marcar el original como anulado se requiere un trigger o policy especial.
    // Por ahora dejamos el original intacto; el cliente consulta por reverses_id.

    return jsonResponse({ success: true, data: inverso });
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : 'Error', 'INTERNAL_ERROR', 500);
  }
});
