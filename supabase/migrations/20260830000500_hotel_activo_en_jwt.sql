-- =============================================================================
-- SaaS · Hotel activo transportado en el JWT
-- =============================================================================
-- PROBLEMA QUE RESUELVE
--
-- current_hotel_id() leia app.hotel_id, fijado con set_config(). Eso funciona
-- en una sesion psql, pero NO a traves de PostgREST: cada peticion HTTP puede
-- caer en una conexion distinta del pool, y el valor fijado en una no existe en
-- la siguiente. El resultado seria un usuario con varios hoteles al que la
-- aplicacion le cambia el hotel activo de forma aparentemente aleatoria — el
-- peor fallo posible en un sistema donde cada hotel ve solo lo suyo.
--
-- SOLUCION
--
-- El hotel activo viaja en el propio token, en app_metadata.active_hotel. El
-- token acompaña a cada peticion, asi que no depende de la conexion.
--
-- app_metadata solo lo puede escribir el servidor (service_role), nunca el
-- usuario: si viviera en user_metadata, cualquiera podria editarlo desde el
-- navegador y entrar en otro hotel. Aun asi, la pertenencia se sigue validando
-- aqui: el token dice cual quiere, la base decide si puede.

CREATE OR REPLACE FUNCTION public.current_hotel_id()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_claim    TEXT;
    v_declared TEXT;
    v_hotel_id BIGINT;
    v_total    INT;
BEGIN
    -- 1. Hotel activo declarado en el token.
    BEGIN
        v_claim := auth.jwt() -> 'app_metadata' ->> 'active_hotel';
    EXCEPTION WHEN OTHERS THEN
        v_claim := NULL;
    END;

    IF v_claim IS NOT NULL AND v_claim <> '' THEN
        BEGIN
            v_hotel_id := v_claim::BIGINT;
        EXCEPTION WHEN invalid_text_representation THEN
            v_hotel_id := NULL;
        END;
        -- Se valida SIEMPRE: el claim expresa una intencion, no un permiso.
        IF v_hotel_id IS NOT NULL AND public.is_member_of(v_hotel_id) THEN
            RETURN v_hotel_id;
        END IF;
    END IF;

    -- 2. app.hotel_id: sigue valiendo para scripts, migraciones y pruebas, que
    --    corren en una sola conexion y no tienen token.
    v_declared := current_setting('app.hotel_id', true);
    IF v_declared IS NOT NULL AND v_declared <> '' THEN
        BEGIN
            v_hotel_id := v_declared::BIGINT;
        EXCEPTION WHEN invalid_text_representation THEN
            RETURN NULL;
        END;
        IF public.is_member_of(v_hotel_id) THEN
            RETURN v_hotel_id;
        END IF;
        RETURN NULL;
    END IF;

    -- 3. Sin nada declarado: si solo pertenece a un hotel, es ese. Cubre al
    --    grueso de los clientes, que tendran uno solo y no deberian tener que
    --    elegir nada.
    SELECT count(*) INTO v_total FROM public.hotel_members WHERE user_id = auth.uid();
    IF v_total = 1 THEN
        SELECT hotel_id INTO v_hotel_id FROM public.hotel_members WHERE user_id = auth.uid();
        RETURN v_hotel_id;
    END IF;

    -- Varios hoteles y ninguno elegido: la aplicacion debe pedir que elija.
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_hotel_id() FROM anon;

-- switch_hotel deja de fijar nada por su cuenta: solo valida y responde.
-- Quien escribe el claim es la edge function switch-hotel, con service_role.
CREATE OR REPLACE FUNCTION public.switch_hotel(p_hotel_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NOT public.is_member_of(p_hotel_id) THEN
        RAISE EXCEPTION 'No perteneces a ese hotel'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Vale para el mismo transaccion (scripts y pruebas). En la aplicacion, el
    -- cambio se hace efectivo al refrescar el token.
    PERFORM set_config('app.hotel_id', p_hotel_id::TEXT, true);
    RETURN p_hotel_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.switch_hotel(BIGINT) FROM anon;
