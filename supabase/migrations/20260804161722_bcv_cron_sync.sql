-- =============================================================================
-- Sincronizacion automatica diaria de la tasa BCV (cron en SQL) — APLICADA EN REMOTO
-- =============================================================================
-- Un job de pg_cron consulta las APIs publicas del BCV directamente desde
-- Postgres (extension http sincrona) y hace upsert en exchange_rates. No depende
-- de la edge function ni de secretos.
--
-- Fuente primaria: pydolarve (USD + EUR). Respaldo: dolarapi (solo USD).
-- NOTA: al aplicar (2026-08-04) pydolarve no respondia y se uso dolarapi, por lo
-- que el EUR se conserva del ultimo conocido. Si se necesita EUR real del BCV,
-- añadir una fuente EUR alcanzable.
--
-- Los campos siguen editables: la carga manual (source='manual') de hoy tiene
-- prioridad hasta que el cron corra de nuevo. Idempotente.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.sync_bcv_rate_sql()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_resp    extensions.http_response;
    v_json    jsonb;
    v_usd     numeric;
    v_eur_bs  numeric;
    v_eur     numeric;
BEGIN
    PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

    BEGIN
        SELECT * INTO v_resp
        FROM extensions.http_get('https://pydolarve.org/api/v1/dollar?page=bcv');
        IF v_resp.status = 200 THEN
            v_json   := v_resp.content::jsonb;
            v_usd    := nullif(v_json->'monitors'->'usd'->>'price', '')::numeric;
            v_eur_bs := nullif(v_json->'monitors'->'eur'->>'price', '')::numeric;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_usd := NULL;
    END;

    IF v_usd IS NULL OR v_usd <= 0 THEN
        BEGIN
            SELECT * INTO v_resp
            FROM extensions.http_get('https://ve.dolarapi.com/v1/dolares/oficial');
            IF v_resp.status = 200 THEN
                v_json := v_resp.content::jsonb;
                v_usd  := coalesce(
                    nullif(v_json->>'promedio', '')::numeric,
                    nullif(v_json->>'venta',    '')::numeric,
                    nullif(v_json->>'compra',   '')::numeric);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    IF v_usd IS NULL OR v_usd <= 0 THEN
        RAISE WARNING 'sync_bcv_rate_sql: no se pudo obtener la tasa USD del BCV; no se modifico exchange_rates.';
        RETURN;
    END IF;

    IF v_eur_bs IS NOT NULL AND v_eur_bs > 0 THEN
        v_eur := round(v_usd / v_eur_bs, 6);
    ELSE
        SELECT eur_per_usd INTO v_eur
        FROM public.exchange_rates
        WHERE eur_per_usd IS NOT NULL
        ORDER BY fecha DESC LIMIT 1;
    END IF;

    INSERT INTO public.exchange_rates (fecha, bs_per_usd, eur_per_usd, source)
    VALUES (current_date, round(v_usd, 4), v_eur, 'bcv')
    ON CONFLICT (fecha) DO UPDATE
        SET bs_per_usd  = excluded.bs_per_usd,
            eur_per_usd = coalesce(excluded.eur_per_usd, public.exchange_rates.eur_per_usd),
            source      = 'bcv';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_bcv_rate_sql() FROM anon, authenticated, public;

-- pg_cron corre en UTC. 13:00 UTC = 09:00 America/Caracas. Lunes a viernes.
DO $$
BEGIN
    PERFORM cron.unschedule('bcv-sync-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bcv-sync-daily');
END $$;

SELECT cron.schedule('bcv-sync-daily', '0 13 * * 1-5', $$SELECT public.sync_bcv_rate_sql();$$);
