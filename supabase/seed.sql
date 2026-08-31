-- =============================================================================
-- Seed data — Sistema Hotelero
-- =============================================================================
-- Se ejecuta despues de las migraciones en `supabase db reset` y `supabase start`.
--
-- Crea UN hotel de demostracion con sus datos base. Desde que el sistema es
-- multi-cliente, ningun dato de negocio puede existir sin hotel: cada fila
-- pertenece a uno, y el seed no es una excepcion.
--
-- Corre sin sesion de usuario, asi que current_hotel_id() devuelve NULL y el
-- trigger que rellena hotel_id no puede ayudar: aqui se indica explicitamente.
--
-- Los usuarios se crean aparte, via Supabase Auth (scripts/create-admin.ts o el
-- panel -> Authentication -> Add user) y se enlazan con hotel_members.

DO $$
DECLARE
    v_hotel_id BIGINT;
BEGIN
    -- Hotel de demostracion. Nombre generico a proposito: esto es el producto,
    -- no el sistema de un cliente concreto.
    --
    -- La migracion 20260830000000 ya crea un hotel para poder asignarle los
    -- datos que vienen de las migraciones anteriores. Se reutiliza ese en vez de
    -- crear otro, o cada instalacion limpia arrancaria con dos hoteles y el
    -- usuario tendria que elegir entre uno vacio y otro con sus datos.
    SELECT id INTO v_hotel_id FROM public.hotels ORDER BY id LIMIT 1;

    IF v_hotel_id IS NULL THEN
        INSERT INTO public.hotels (nombre, slug, plan, subscription_status, trial_ends_at)
        VALUES ('Hotel Demo', 'hotel-demo', 'profesional', 'trialing', now() + INTERVAL '30 days')
        RETURNING id INTO v_hotel_id;
    ELSE
        UPDATE public.hotels
           SET nombre = 'Hotel Demo', slug = 'hotel-demo', plan = 'profesional'
         WHERE id = v_hotel_id;
    END IF;

    -- Tipos de alojamiento de ejemplo. Se editan o se borran desde la interfaz.
    INSERT INTO public.room_types (hotel_id, nombre, slug, descripcion, capacidad, tarifa_dia, tarifa_semana, tarifa_mes, moneda, amenities) VALUES
        (v_hotel_id, 'Individual', 'individual', 'Habitacion individual.',                    1, 25.00, 150.00,  550.00, 'USD', '["cama individual","bano privado","ventilador"]'::jsonb),
        (v_hotel_id, 'Doble',      'doble',      'Habitacion doble con cama matrimonial.',    2, 40.00, 240.00,  900.00, 'USD', '["cama matrimonial","bano privado","aire acondicionado"]'::jsonb),
        (v_hotel_id, 'Triple',     'triple',     'Habitacion para tres huespedes.',           3, 55.00, 330.00, 1200.00, 'USD', '["3 camas","bano privado","aire acondicionado"]'::jsonb),
        (v_hotel_id, 'Familiar',   'familiar',   'Habitacion familiar para cuatro personas.', 4, 70.00, 420.00, 1500.00, 'USD', '["2 camas matrimoniales","bano privado","aire acondicionado","nevera"]'::jsonb),
        (v_hotel_id, 'Suite',      'suite',      'Suite con sala independiente.',             2, 90.00, 540.00, 2000.00, 'USD', '["cama king","sala","bano privado","aire acondicionado","nevera","TV"]'::jsonb)
    ON CONFLICT (hotel_id, slug) DO NOTHING;

    -- Categorias contables. Sin ellas no se puede registrar el primer ingreso
    -- ni el primer gasto.
    INSERT INTO public.ledger_categories (hotel_id, nombre, slug, type) VALUES
        (v_hotel_id, 'Alojamiento',        'alojamiento',        'ingreso'),
        (v_hotel_id, 'Servicios extra',    'servicios-extra',    'ingreso'),
        (v_hotel_id, 'Restauracion',       'restauracion',       'ingreso'),
        (v_hotel_id, 'Otros ingresos',     'otros-ingresos',     'ingreso'),
        (v_hotel_id, 'Nomina',             'nomina',             'egreso'),
        (v_hotel_id, 'Servicios publicos', 'servicios-publicos', 'egreso'),
        (v_hotel_id, 'Suministros',        'suministros',        'egreso'),
        (v_hotel_id, 'Mantenimiento',      'mantenimiento',      'egreso'),
        (v_hotel_id, 'Impuestos',          'impuestos',          'egreso'),
        (v_hotel_id, 'Otros egresos',      'otros-egresos',      'egreso')
    ON CONFLICT (hotel_id, slug) DO NOTHING;

    -- Ajustes del hotel.
    INSERT INTO public.settings (hotel_id, key, value) VALUES
        (v_hotel_id, 'hotel.nombre',      '"Hotel Demo"'::jsonb),
        (v_hotel_id, 'hotel.moneda_base', '"USD"'::jsonb),
        (v_hotel_id, 'hotel.iva_pct',     '16'::jsonb)
    ON CONFLICT (hotel_id, key) DO NOTHING;

    RAISE NOTICE 'Seed aplicado sobre el hotel % (Hotel Demo)', v_hotel_id;
END $$;
