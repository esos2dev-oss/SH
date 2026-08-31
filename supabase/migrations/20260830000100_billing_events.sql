-- =============================================================================
-- SaaS · Registro de eventos de Stripe (idempotencia del webhook)
-- =============================================================================
-- Stripe reintenta la entrega ante cualquier duda: un timeout, un 500, o
-- simplemente porque no le llego el 200 a tiempo. Sin registro de lo ya
-- procesado, el reintento vuelve a aplicar el cambio — y eso puede reactivar
-- una suscripcion cancelada o pisar un estado mas reciente.
--
-- El webhook inserta aqui el id del evento ANTES de procesarlo. Si la insercion
-- choca con la clave primaria, es que ya se proceso y se responde 200 sin hacer
-- nada. Si el procesado falla, borra la fila para que el reintento pueda entrar.

CREATE TABLE IF NOT EXISTS public.billing_events (
    id           TEXT PRIMARY KEY,   -- evt_... de Stripe
    type         TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_events IS
    'Eventos de Stripe ya procesados. La PK es la garantia de idempotencia del webhook.';

CREATE INDEX IF NOT EXISTS idx_billing_events_processed ON public.billing_events (processed_at DESC);

-- Solo la escribe el webhook, que corre con service_role y se salta RLS.
-- Ningun usuario tiene por que verla ni tocarla: RLS activo y sin una sola
-- policy, que es la forma de decir "aqui no entra nadie".
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_events FROM anon, authenticated;
