-- =============================================================================
-- Calidad de datos y ciclo de vida de la reserva
-- =============================================================================
-- Bugs que resuelve:
--   7  — busqueda de huespedes que no encuentra por nombre completo ni con tildes
--   11 — check-in permitido para reservas que llegan dentro de mes y medio
--   12 — reservas pasadas que se quedan en "Pendiente" para siempre
--   17 — habitaciones ordenadas como texto (1, 10, 11, 2, 3...)
--   18 — fecha de nacimiento en el futuro aceptada sin rechistar
--   19 — el cierre de caja cuenta pagos de reservas canceladas
--
-- Idempotente.

-- =============================================================================
-- 1. (17) Orden numerico de habitaciones
-- =============================================================================
-- numero es VARCHAR (hay hoteles con "12B", "PH1"), asi que ordenamos por la
-- parte numerica y desempatamos con el texto.
ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS numero_sort INTEGER
    GENERATED ALWAYS AS (
        NULLIF(LEFT(regexp_replace(numero, '[^0-9]', '', 'g'), 9), '')::INTEGER
    ) STORED;

COMMENT ON COLUMN public.rooms.numero_sort IS
    'Parte numerica de `numero` para ordenar 1,2,...,10 en vez de 1,10,11,2. Generada.';

CREATE INDEX IF NOT EXISTS ix_rooms_orden ON public.rooms (numero_sort NULLS LAST, numero);

-- El tablero del dashboard tambien ordenaba por texto.
CREATE OR REPLACE FUNCTION public.rooms_board()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
    SELECT COALESCE(jsonb_agg(x ORDER BY x_sort NULLS LAST, x_numero), '[]'::jsonb)
    FROM (
        SELECT
            r.numero_sort AS x_sort,
            r.numero      AS x_numero,
            jsonb_build_object(
                'room_id', r.id, 'numero', r.numero, 'planta', r.planta,
                'type', rt.nombre, 'status', r.status,
                'current_booking', (
                    SELECT jsonb_build_object(
                        'id', b.id, 'codigo', b.codigo,
                        'customer_nombre', c.nombres || ' ' || c.apellidos,
                        'fecha_salida', b.fecha_salida,
                        'importe_pendiente', b.importe_total - b.importe_pagado,
                        'moneda', b.moneda
                    )
                    FROM public.bookings b
                    JOIN public.customers c ON c.id = b.customer_id
                    WHERE b.room_id = r.id AND b.status = 'en_curso'
                    ORDER BY b.fecha_entrada DESC LIMIT 1
                )
            ) AS x
        FROM public.rooms r
        JOIN public.room_types rt ON rt.id = r.room_type_id
        WHERE r.active = true
    ) s;
$$;

GRANT EXECUTE ON FUNCTION public.rooms_board() TO authenticated;

-- =============================================================================
-- 2. (7) Busqueda de huespedes: nombre completo, sin tildes
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;

-- unaccent() es STABLE (depende del diccionario), asi que no vale para una
-- columna generada. La forma de 2 argumentos con el diccionario explicito si es
-- inmutable; la envolvemos para poder indexar.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(p_text TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
    SELECT extensions.unaccent('extensions.unaccent'::regdictionary, p_text);
$$;

-- Un solo campo con todo lo buscable, normalizado. Resuelve los tres sintomas:
-- "TEST Maria" (cruza nombres+apellidos), "Maria" vs "María" (sin tildes),
-- y busqueda por documento/telefono/email en el mismo cuadro.
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS search_text TEXT
    GENERATED ALWAYS AS (
        lower(public.immutable_unaccent(
            coalesce(nombres, '') || ' ' ||
            coalesce(apellidos, '') || ' ' ||
            coalesce(doc_numero, '') || ' ' ||
            coalesce(email, '') || ' ' ||
            coalesce(telefono, '') || ' ' ||
            coalesce(vehicle_plate, '')
        ))
    ) STORED;

COMMENT ON COLUMN public.customers.search_text IS
    'Nombre completo + documento + email + telefono + placa, en minusculas y sin tildes. Para el buscador.';

CREATE INDEX IF NOT EXISTS ix_customers_search_trgm
    ON public.customers USING gin (search_text extensions.gin_trgm_ops);

-- La vista tiene que exponer la columna nueva.
-- DROP + CREATE obligatorio: la vista usa `c.*`, asi que al añadir search_text
-- a la tabla cambia su lista de columnas, y CREATE OR REPLACE VIEW no permite
-- insertar columnas en medio.
-- Ademas total_gastado pasa a moneda base: antes sumaba importe_pagado de
-- reservas en EUR, USD y VES como si fueran la misma unidad.
DROP VIEW IF EXISTS public.customers_with_stats;

CREATE VIEW public.customers_with_stats AS
SELECT
    c.*,
    COALESCE(s.total_estancias, 0)::int    AS total_estancias,
    COALESCE(s.total_gastado, 0)::numeric  AS total_gastado
FROM public.customers c
LEFT JOIN (
    SELECT
        customer_id,
        COUNT(*) FILTER (WHERE status IN ('finalizada','en_curso')) AS total_estancias,
        SUM(public.to_base_usd(importe_pagado, moneda, fecha_entrada::date))
            FILTER (WHERE status IN ('finalizada','en_curso','confirmada')) AS total_gastado
    FROM public.bookings
    GROUP BY customer_id
) s ON s.customer_id = c.id;

GRANT SELECT ON public.customers_with_stats TO authenticated;

-- customer_timeline no devolvia la moneda, asi que el historial del huesped
-- pintaba todos los importes con el simbolo por defecto.
CREATE OR REPLACE FUNCTION public.customer_timeline(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
BEGIN
    RETURN jsonb_build_object(
        'bookings', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'codigo', b.codigo,
                'fecha_entrada', b.fecha_entrada, 'fecha_salida', b.fecha_salida,
                'status', b.status, 'importe_total', b.importe_total::text,
                'moneda', b.moneda,
                'room_numero', r.numero
            ) ORDER BY b.fecha_entrada DESC)
            FROM public.bookings b JOIN public.rooms r ON r.id = b.room_id
            WHERE b.customer_id = p_id
        ), '[]'::jsonb),
        'emails', '[]'::jsonb
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_timeline(bigint) TO authenticated;

-- =============================================================================
-- 3. (18) Fecha de nacimiento coherente
-- =============================================================================
-- No se puede usar CHECK con CURRENT_DATE (no es inmutable), asi que va trigger.
CREATE OR REPLACE FUNCTION public.tg_customers_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.fecha_nacimiento IS NOT NULL THEN
        IF NEW.fecha_nacimiento > CURRENT_DATE THEN
            RAISE EXCEPTION 'La fecha de nacimiento no puede ser futura (%).', NEW.fecha_nacimiento
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.fecha_nacimiento < DATE '1900-01-01' THEN
            RAISE EXCEPTION 'La fecha de nacimiento es demasiado antigua (%).', NEW.fecha_nacimiento
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_customers_validate ON public.customers;
CREATE TRIGGER tg_customers_validate
    BEFORE INSERT OR UPDATE OF fecha_nacimiento ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.tg_customers_validate();

-- =============================================================================
-- 4. (11) Ventana de check-in configurable
-- =============================================================================
INSERT INTO public.settings (key, value)
VALUES ('checkin.ventana_horas_antes', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.settings (key, value)
VALUES ('checkin.ventana_horas_despues', '48'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Devuelve NULL si el check-in es valido, o el motivo del rechazo.
CREATE OR REPLACE FUNCTION public.checkin_window_violation(p_booking_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_entrada TIMESTAMPTZ;
    v_antes   INT;
    v_despues INT;
BEGIN
    SELECT fecha_entrada INTO v_entrada FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN RETURN 'Reserva no encontrada'; END IF;

    SELECT COALESCE((value #>> '{}')::int, 24) INTO v_antes
      FROM public.settings WHERE key = 'checkin.ventana_horas_antes';
    SELECT COALESCE((value #>> '{}')::int, 48) INTO v_despues
      FROM public.settings WHERE key = 'checkin.ventana_horas_despues';

    v_antes   := COALESCE(v_antes, 24);
    v_despues := COALESCE(v_despues, 48);

    IF NOW() < v_entrada - make_interval(hours => v_antes) THEN
        RETURN format(
            'Aun no se puede hacer check-in: la entrada es el %s. Se habilita %s horas antes.',
            to_char(v_entrada, 'DD/MM/YYYY HH24:MI'), v_antes);
    END IF;

    IF NOW() > v_entrada + make_interval(hours => v_despues) THEN
        RETURN format(
            'La ventana de check-in vencio (entrada prevista %s, hace mas de %s horas). Marca la reserva como no-show o mueve las fechas.',
            to_char(v_entrada, 'DD/MM/YYYY HH24:MI'), v_despues);
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkin_window_violation(BIGINT) TO authenticated;

-- =============================================================================
-- 5. (12) Cierre automatico de reservas vencidas
-- =============================================================================
-- Reservas que nunca hicieron check-in y cuya fecha de salida ya paso -> no_show.
-- Devuelve cuantas cerro. Pensada para llamarse desde pg_cron o desde el panel.
CREATE OR REPLACE FUNCTION public.expire_stale_bookings()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_no_show INT := 0;
BEGIN
    WITH vencidas AS (
        UPDATE public.bookings b
           SET status = 'no_show'
         WHERE b.status IN ('pendiente', 'confirmada')
           AND b.fecha_salida < NOW()
           AND NOT EXISTS (SELECT 1 FROM public.check_ins ci WHERE ci.booking_id = b.id)
        RETURNING b.id
    )
    SELECT COUNT(*) INTO v_no_show FROM vencidas;

    RETURN jsonb_build_object('no_show', v_no_show, 'ran_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_bookings() TO authenticated;

-- Si pg_cron esta disponible en el proyecto, lo programamos a las 04:00.
-- Si no, la funcion queda disponible para llamarla a mano desde Ajustes.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('expire_stale_bookings')
          WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_stale_bookings');
        PERFORM cron.schedule('expire_stale_bookings', '0 4 * * *',
                              'SELECT public.expire_stale_bookings()');
        RAISE NOTICE 'pg_cron: expire_stale_bookings programada a las 04:00';
    ELSE
        RAISE NOTICE 'pg_cron no disponible: llama a expire_stale_bookings() manualmente o activa la extension';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo programar expire_stale_bookings: %', SQLERRM;
END $$;

-- =============================================================================
-- 6. (19 y 1) Cierre de caja correcto: por moneda, en base, sin canceladas
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cash_closure_preview(
    p_opened_at TIMESTAMPTZ,
    p_closed_at TIMESTAMPTZ DEFAULT NULL,
    p_user_id   UUID        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
    v_hasta TIMESTAMPTZ := COALESCE(p_closed_at, NOW());
    v_result jsonb;
BEGIN
    WITH movs AS (
        SELECT
            bp.method::text AS method,
            bp.status::text AS status,
            upper(bp.moneda) AS moneda,
            bp.monto,
            bp.monto_base,
            (b.id IS NOT NULL AND b.status = 'cancelada') AS de_cancelada
        FROM public.booking_payments bp
        LEFT JOIN public.bookings b ON b.id = bp.booking_id
        WHERE bp.pagado_at >= p_opened_at
          AND bp.pagado_at <= v_hasta
          AND (p_user_id IS NULL OR bp.registered_by = p_user_id)
          AND bp.status <> 'rejected'
    ),
    -- Totales por metodo+moneda, y luego por metodo. Se agrega en dos pasos
    -- en vez de con subconsultas correlacionadas: mismo resultado, mas legible
    -- y sin depender de como Postgres resuelva la correlacion dentro del agregado.
    por_metodo_moneda AS (
        SELECT method, moneda, ROUND(SUM(monto), 2) AS suma
        FROM movs WHERE NOT de_cancelada
        GROUP BY method, moneda
    ),
    por_metodo AS (
        SELECT
            m.method,
            COUNT(*) AS cnt,
            ROUND(COALESCE(SUM(m.monto_base) FILTER (WHERE NOT m.de_cancelada), 0), 2) AS base_usd,
            COALESCE((
                SELECT jsonb_object_agg(pmm.moneda, pmm.suma)
                FROM por_metodo_moneda pmm WHERE pmm.method = m.method
            ), '{}'::jsonb) AS por_moneda
        FROM movs m
        GROUP BY m.method
    )
    SELECT jsonb_build_object(
        'moneda_base', 'USD',
        'by_method', COALESCE((
            SELECT jsonb_object_agg(method, jsonb_build_object(
                'count', cnt,
                'total_base_usd', base_usd,
                'total_moneda', por_moneda
            ))
            FROM por_metodo
        ), '{}'::jsonb),
        'total_confirmado_base_usd', ROUND(COALESCE((
            SELECT SUM(monto_base) FROM movs WHERE status = 'confirmed' AND NOT de_cancelada), 0), 2),
        'total_por_confirmar_base_usd', ROUND(COALESCE((
            SELECT SUM(monto_base) FROM movs WHERE status = 'pending_confirmation' AND NOT de_cancelada), 0), 2),
        -- pending_count es un CONTEO, no una suma de importes (estaba mal antes).
        'pending_count', (SELECT COUNT(*) FROM movs WHERE status = 'pending_confirmation' AND NOT de_cancelada),
        'total_count',   (SELECT COUNT(*) FROM movs WHERE NOT de_cancelada),
        -- Cobros de reservas que luego se cancelaron: no cuadran caja, requieren devolucion.
        'cancelados', jsonb_build_object(
            'count', (SELECT COUNT(*) FROM movs WHERE de_cancelada),
            'total_base_usd', ROUND(COALESCE((SELECT SUM(monto_base) FROM movs WHERE de_cancelada), 0), 2)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cash_closure_preview(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- =============================================================================
-- 7. (19) Pagos pendientes de devolucion
-- =============================================================================
CREATE OR REPLACE VIEW public.refunds_pending
WITH (security_invoker = true) AS
SELECT
    b.id            AS booking_id,
    b.codigo        AS booking_codigo,
    b.cancelled_at,
    b.cancelled_reason,
    c.nombres || ' ' || c.apellidos AS customer_nombre,
    c.telefono      AS customer_telefono,
    COUNT(bp.id)                       AS pagos_count,
    ROUND(SUM(bp.monto_base), 2)       AS total_base_usd
FROM public.bookings b
JOIN public.customers c ON c.id = b.customer_id
JOIN public.booking_payments bp ON bp.booking_id = b.id AND bp.status = 'confirmed'
WHERE b.status = 'cancelada'
GROUP BY b.id, b.codigo, b.cancelled_at, b.cancelled_reason, c.nombres, c.apellidos, c.telefono;

GRANT SELECT ON public.refunds_pending TO authenticated;
