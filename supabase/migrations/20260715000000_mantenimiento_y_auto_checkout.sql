-- =============================================================================
-- Modulo mantenimiento + auto-checkout cuando la reserva vence.
-- =============================================================================

-- ENUM: tipos de mantenimiento
DO $$ BEGIN
    CREATE TYPE public.maintenance_type AS ENUM (
        'electrico', 'plomeria', 'aire_acondicionado', 'muebles',
        'pintura', 'jardineria', 'piscina', 'area_comun', 'general', 'otro'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.maintenance_status AS ENUM (
        'pendiente', 'en_proceso', 'completado', 'cancelado'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Tabla maintenance_orders — ordenes de mantenimiento
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.maintenance_orders (
    id                  BIGSERIAL PRIMARY KEY,
    room_id             BIGINT REFERENCES public.rooms(id) ON DELETE SET NULL,
    tipo                public.maintenance_type NOT NULL DEFAULT 'general',
    titulo              VARCHAR(200) NOT NULL,
    descripcion         TEXT,
    status              public.maintenance_status NOT NULL DEFAULT 'pendiente',
    prioridad           SMALLINT NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
    -- Servicio externo
    servicio_externo    BOOLEAN NOT NULL DEFAULT false,
    proveedor_nombre    VARCHAR(200),
    proveedor_telefono  VARCHAR(50),
    costo               NUMERIC(12,2) CHECK (costo IS NULL OR costo >= 0),
    moneda              CHAR(3),
    -- Timestamps
    reportado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reportado_by        UUID REFERENCES public.profiles(id),
    asignado_to         UUID REFERENCES public.profiles(id),
    iniciado_at         TIMESTAMPTZ,
    completado_at       TIMESTAMPTZ,
    notas_cierre        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_maintenance_iniciado_after_reportado
        CHECK (iniciado_at IS NULL OR iniciado_at >= reportado_at),
    CONSTRAINT ck_maintenance_completado_after_iniciado
        CHECK (completado_at IS NULL OR (iniciado_at IS NOT NULL AND completado_at >= iniciado_at))
);

CREATE INDEX IF NOT EXISTS ix_maintenance_room     ON public.maintenance_orders (room_id);
CREATE INDEX IF NOT EXISTS ix_maintenance_status   ON public.maintenance_orders (status)
    WHERE status IN ('pendiente','en_proceso');
CREATE INDEX IF NOT EXISTS ix_maintenance_reportado ON public.maintenance_orders (reportado_at DESC);
CREATE INDEX IF NOT EXISTS ix_maintenance_externo  ON public.maintenance_orders (servicio_externo) WHERE servicio_externo = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_maintenance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS tg_maintenance_updated_at ON public.maintenance_orders;
CREATE TRIGGER tg_maintenance_updated_at
    BEFORE UPDATE ON public.maintenance_orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_maintenance_updated_at();

-- Trigger: al crear orden pendiente para una habitacion, poner la habitacion en mantenimiento
CREATE OR REPLACE FUNCTION public.tg_maintenance_room_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- INSERT o UPDATE que activa mantenimiento en una habitacion
    IF NEW.room_id IS NOT NULL AND NEW.status IN ('pendiente','en_proceso') THEN
        UPDATE public.rooms SET status = 'mantenimiento'
        WHERE id = NEW.room_id AND status NOT IN ('ocupada');
    END IF;
    -- Al completar/cancelar, si no queda otra orden activa, liberar a disponible
    IF (NEW.status IN ('completado','cancelado')) AND NEW.room_id IS NOT NULL AND (TG_OP = 'UPDATE') AND (OLD.status IN ('pendiente','en_proceso')) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.maintenance_orders
            WHERE room_id = NEW.room_id AND status IN ('pendiente','en_proceso') AND id <> NEW.id
        ) THEN
            UPDATE public.rooms SET status = 'disponible'
            WHERE id = NEW.room_id AND status = 'mantenimiento';
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_maintenance_room_status ON public.maintenance_orders;
CREATE TRIGGER tg_maintenance_room_status
    AFTER INSERT OR UPDATE OF status, room_id ON public.maintenance_orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_maintenance_room_status();

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_maint_select ON public.maintenance_orders;
CREATE POLICY p_maint_select ON public.maintenance_orders FOR SELECT TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','limpieza','contabilidad'));

DROP POLICY IF EXISTS p_maint_insert ON public.maintenance_orders;
CREATE POLICY p_maint_insert ON public.maintenance_orders FOR INSERT TO authenticated
    WITH CHECK (public.has_role('superadmin','admin','recepcion'));

DROP POLICY IF EXISTS p_maint_update ON public.maintenance_orders;
CREATE POLICY p_maint_update ON public.maintenance_orders FOR UPDATE TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','limpieza'))
    WITH CHECK (public.has_role('superadmin','admin','recepcion','limpieza'));

DROP POLICY IF EXISTS p_maint_delete ON public.maintenance_orders;
CREATE POLICY p_maint_delete ON public.maintenance_orders FOR DELETE TO authenticated
    USING (public.has_role('superadmin','admin'));

-- =============================================================================
-- RPC: auto_checkout_vencidos
-- =============================================================================
-- Cierra automaticamente las reservas 'en_curso' cuya fecha_salida ya paso.
-- Se llama desde cron (systemd timer en el VPS o pg_cron). Devuelve el numero
-- de reservas cerradas y las ordenes de limpieza creadas.
CREATE OR REPLACE FUNCTION public.auto_checkout_vencidos()
RETURNS TABLE(bookings_cerrados int, cleaning_ordenes int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_booking record;
    v_bookings int := 0;
    v_cleaning int := 0;
BEGIN
    FOR v_booking IN
        SELECT id, room_id FROM public.bookings
        WHERE status = 'en_curso' AND fecha_salida < NOW()
        ORDER BY fecha_salida
    LOOP
        -- 1. Cerrar check-in si existe
        UPDATE public.check_ins
        SET hora_salida = NOW()
        WHERE booking_id = v_booking.id AND hora_salida IS NULL;

        -- 2. Booking -> finalizada
        UPDATE public.bookings SET status = 'finalizada' WHERE id = v_booking.id;

        -- 3. Room -> limpieza (si no esta en mantenimiento)
        UPDATE public.rooms SET status = 'limpieza'
        WHERE id = v_booking.room_id AND status = 'ocupada';

        -- 4. Crear orden de limpieza via helper (idempotente)
        BEGIN
            PERFORM public.create_cleaning_order(v_booking.room_id, v_booking.id, 'Auto-checkout por vencimiento');
            v_cleaning := v_cleaning + 1;
        EXCEPTION WHEN OTHERS THEN NULL; END;

        -- 5. Audit
        INSERT INTO public.audit_log (user_id, action, entity, entity_id, after)
        VALUES (NULL, 'status_change', 'booking', v_booking.id::text,
                jsonb_build_object('status','finalizada','trigger','auto_checkout_vencidos'));

        v_bookings := v_bookings + 1;
    END LOOP;

    RETURN QUERY SELECT v_bookings, v_cleaning;
END $$;

REVOKE ALL ON FUNCTION public.auto_checkout_vencidos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_checkout_vencidos() TO authenticated, anon;
-- ^ anon permite llamarlo desde el cron con solo el apikey (sin JWT).
--   La funcion es SECURITY DEFINER asi que corre con permisos del owner.
