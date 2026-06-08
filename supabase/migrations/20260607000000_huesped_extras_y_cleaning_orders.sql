-- =============================================================================
-- Extras de huesped (placa, referral_source) + ordenes de limpieza formales
-- =============================================================================
-- Cambios:
--   1. Nuevo ENUM referral_source (instagram, facebook, google, recomendacion,
--      calle, recurrente, otro)
--   2. ALTER customers: agregar vehicle_plate, referral_source
--   3. ALTER bookings:  agregar vehicle_plate (opcional, sobreescribe el del customer)
--   4. Nueva tabla cleaning_orders + RLS + trigger que la dispara al checkout
-- Migracion aditiva (ADD COLUMN, IF NOT EXISTS), no rompe lo existente.

-- =============================================================================
-- 1. ENUM referral_source
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE public.referral_source AS ENUM (
        'instagram', 'facebook', 'google', 'recomendacion',
        'calle', 'recurrente', 'otro'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.cleaning_order_status AS ENUM (
        'pendiente', 'en_proceso', 'completada', 'cancelada'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 2. ALTER customers: vehicle_plate + referral_source + referral_other
-- =============================================================================
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS vehicle_plate    VARCHAR(20),
    ADD COLUMN IF NOT EXISTS referral_source  public.referral_source,
    ADD COLUMN IF NOT EXISTS referral_other   VARCHAR(120);

COMMENT ON COLUMN public.customers.vehicle_plate IS
    'Placa de vehiculo por defecto del huesped. Una reserva puede sobreescribirla.';
COMMENT ON COLUMN public.customers.referral_source IS
    'Como nos conocio. Si es "otro", referral_other contiene el detalle.';

-- Indice para reportes de captacion
CREATE INDEX IF NOT EXISTS ix_customers_referral_source
    ON public.customers (referral_source) WHERE referral_source IS NOT NULL;

-- =============================================================================
-- 3. ALTER bookings: vehicle_plate (opcional, snapshot por estancia)
-- =============================================================================
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(20);

COMMENT ON COLUMN public.bookings.vehicle_plate IS
    'Placa del vehiculo durante esta estancia. Si NULL, usar customers.vehicle_plate.';

-- =============================================================================
-- 4. cleaning_orders — orden formal de limpieza tras checkout
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cleaning_orders (
    id              BIGSERIAL PRIMARY KEY,
    room_id         BIGINT NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    booking_id      BIGINT REFERENCES public.bookings(id) ON DELETE SET NULL,
    status          public.cleaning_order_status NOT NULL DEFAULT 'pendiente',
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    requested_by    UUID REFERENCES public.profiles(id),
    assigned_to     UUID REFERENCES public.profiles(id),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    notas           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_cleaning_started_after_requested
        CHECK (started_at IS NULL OR started_at >= requested_at),
    CONSTRAINT ck_cleaning_finished_after_started
        CHECK (finished_at IS NULL OR (started_at IS NOT NULL AND finished_at >= started_at))
);

CREATE INDEX IF NOT EXISTS ix_cleaning_orders_room   ON public.cleaning_orders (room_id);
CREATE INDEX IF NOT EXISTS ix_cleaning_orders_status ON public.cleaning_orders (status) WHERE status IN ('pendiente','en_proceso');
CREATE INDEX IF NOT EXISTS ix_cleaning_orders_assignee ON public.cleaning_orders (assigned_to) WHERE assigned_to IS NOT NULL;

-- updated_at automatico (asume helper trigger_set_updated_at; si no existe,
-- usamos uno local)
CREATE OR REPLACE FUNCTION public.tg_cleaning_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_cleaning_orders_updated_at ON public.cleaning_orders;
CREATE TRIGGER tg_cleaning_orders_updated_at
    BEFORE UPDATE ON public.cleaning_orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_cleaning_orders_updated_at();

-- =============================================================================
-- 5. RLS para cleaning_orders
-- Lectura: cualquier rol operativo. Escritura: recepcion+admin+superadmin
-- crean (checkout las dispara); limpieza puede update (start/finish);
-- admin+superadmin pueden cancelar/borrar.
-- =============================================================================
ALTER TABLE public.cleaning_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_cleaning_select ON public.cleaning_orders;
CREATE POLICY p_cleaning_select ON public.cleaning_orders
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','limpieza','contabilidad'));

DROP POLICY IF EXISTS p_cleaning_insert ON public.cleaning_orders;
CREATE POLICY p_cleaning_insert ON public.cleaning_orders
    FOR INSERT TO authenticated
    WITH CHECK (public.has_role('superadmin','admin','recepcion'));

DROP POLICY IF EXISTS p_cleaning_update ON public.cleaning_orders;
CREATE POLICY p_cleaning_update ON public.cleaning_orders
    FOR UPDATE TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','limpieza'))
    WITH CHECK (public.has_role('superadmin','admin','recepcion','limpieza'));

DROP POLICY IF EXISTS p_cleaning_delete ON public.cleaning_orders;
CREATE POLICY p_cleaning_delete ON public.cleaning_orders
    FOR DELETE TO authenticated
    USING (public.has_role('superadmin','admin'));

-- =============================================================================
-- 6. RPC: crear orden de limpieza desde edge function booking-checkout
-- Centralizamos la logica para que checkout y eventuales triggers manuales
-- pasen por el mismo punto.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_cleaning_order(
    p_room_id    BIGINT,
    p_booking_id BIGINT DEFAULT NULL,
    p_notas      TEXT   DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    -- Evita duplicados activos para la misma habitacion
    SELECT id INTO v_id
    FROM public.cleaning_orders
    WHERE room_id = p_room_id
      AND status IN ('pendiente','en_proceso')
    ORDER BY requested_at DESC
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    INSERT INTO public.cleaning_orders (room_id, booking_id, requested_by, notas)
    VALUES (p_room_id, p_booking_id, auth.uid(), p_notas)
    RETURNING id INTO v_id;

    RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_cleaning_order(BIGINT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cleaning_order(BIGINT, BIGINT, TEXT) TO authenticated;

-- =============================================================================
-- 7. Trigger en rooms: cuando status pasa a 'disponible' desde 'limpieza',
-- cerrar la orden activa automaticamente.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_rooms_close_cleaning_order()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'limpieza' AND NEW.status = 'disponible' THEN
        UPDATE public.cleaning_orders
        SET status      = 'completada',
            finished_at = NOW(),
            assigned_to = COALESCE(assigned_to, auth.uid())
        WHERE room_id = NEW.id
          AND status IN ('pendiente','en_proceso');
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_rooms_close_cleaning_order ON public.rooms;
CREATE TRIGGER tg_rooms_close_cleaning_order
    AFTER UPDATE OF status ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public.tg_rooms_close_cleaning_order();
