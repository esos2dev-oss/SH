-- Amplia las monedas admitidas en el alta.
-- La validacion aceptaba solo USD/EUR/VES: con la lista nueva del asistente,
-- elegir pesos o reales hacia fallar la creacion entera con un mensaje que
-- ademas no explicaba nada.
CREATE OR REPLACE FUNCTION public.create_hotel_with_owner(
    p_nombre       TEXT,
    p_moneda_base  TEXT DEFAULT 'USD',
    p_iva_pct      NUMERIC DEFAULT 16
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
    v_uid      UUID := auth.uid();
    v_hotel_id BIGINT;
    v_slug     TEXT;
    v_intento  INT := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Hay que iniciar sesion para crear un hotel'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_nombre IS NULL OR length(btrim(p_nombre)) < 2 THEN
        RAISE EXCEPTION 'El nombre del hotel es obligatorio'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Codigo ISO 4217 de tres letras. Se comprueba la forma, no una lista
    -- cerrada: mantener aqui el catalogo obligaria a migrar la base cada vez
    -- que se añade un pais.
    IF p_moneda_base IS NULL OR p_moneda_base !~ '^[A-Za-z]{3}$' THEN
        RAISE EXCEPTION 'Moneda no valida: %', COALESCE(p_moneda_base, 'sin indicar')
            USING ERRCODE = 'check_violation';
    END IF;

    IF (SELECT count(*) FROM public.hotel_members
         WHERE user_id = v_uid AND role = 'owner') >= 10 THEN
        RAISE EXCEPTION 'Has alcanzado el maximo de hoteles por cuenta'
            USING ERRCODE = 'check_violation';
    END IF;

    v_slug := lower(btrim(p_nombre));
    v_slug := translate(v_slug, 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    v_slug := btrim(regexp_replace(v_slug, '-+', '-', 'g'), '-');
    IF v_slug = '' THEN v_slug := 'hotel'; END IF;

    WHILE EXISTS (SELECT 1 FROM public.hotels WHERE slug = v_slug) LOOP
        v_intento := v_intento + 1;
        v_slug := regexp_replace(v_slug, '-[0-9]+$', '') || '-' || v_intento;
    END LOOP;

    INSERT INTO public.hotels (nombre, slug, plan, subscription_status, trial_ends_at)
    VALUES (btrim(p_nombre), v_slug, 'esencial', 'trialing', now() + INTERVAL '30 days')
    RETURNING id INTO v_hotel_id;

    INSERT INTO public.hotel_members (hotel_id, user_id, role)
    VALUES (v_hotel_id, v_uid, 'owner');

    INSERT INTO public.settings (hotel_id, key, value) VALUES
        (v_hotel_id, 'hotel.nombre',      to_jsonb(btrim(p_nombre))),
        (v_hotel_id, 'hotel.moneda_base', to_jsonb(upper(p_moneda_base))),
        (v_hotel_id, 'hotel.iva_pct',     to_jsonb(p_iva_pct))
    ON CONFLICT (hotel_id, key) DO NOTHING;

    INSERT INTO public.ledger_categories (hotel_id, nombre, slug, type)
    VALUES
        (v_hotel_id, 'Alojamiento',    'alojamiento-'    || v_hotel_id, 'ingreso'),
        (v_hotel_id, 'Otros ingresos', 'otros-ingresos-' || v_hotel_id, 'ingreso'),
        (v_hotel_id, 'Suministros',    'suministros-'    || v_hotel_id, 'egreso'),
        (v_hotel_id, 'Servicios',      'servicios-'      || v_hotel_id, 'egreso'),
        (v_hotel_id, 'Personal',       'personal-'       || v_hotel_id, 'egreso'),
        (v_hotel_id, 'Mantenimiento',  'mantenimiento-'  || v_hotel_id, 'egreso')
    ON CONFLICT DO NOTHING;

    RETURN v_hotel_id;
END;
$fn$;
