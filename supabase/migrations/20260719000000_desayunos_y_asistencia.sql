-- =============================================================================
-- Modulos: Desayunos (restaurante externo) + Asistencia de empleados.
-- =============================================================================

-- =============================================================================
-- 1. BREAKFAST ORDERS — desayunos por reserva y por dia.
-- =============================================================================
-- Recepcion registra cuantos desayunos toma cada habitacion por dia.
-- El restaurante externo consulta la lista del dia y marca entregados.
-- El precio base viene de settings.hotel.desayuno_precio (default 7 EUR).

CREATE TABLE IF NOT EXISTS public.breakfast_orders (
    id              BIGSERIAL PRIMARY KEY,
    booking_id      BIGINT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    cantidad        INTEGER NOT NULL CHECK (cantidad >= 0),
    precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    total           NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
    moneda          CHAR(3) NOT NULL DEFAULT 'EUR',
    notas           TEXT,
    -- Estado de entrega
    entregado       BOOLEAN NOT NULL DEFAULT false,
    entregado_at    TIMESTAMPTZ,
    entregado_by    UUID REFERENCES public.profiles(id),
    -- Creado por recepcion
    creado_by       UUID REFERENCES public.profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Solo una orden por (booking, fecha)
    UNIQUE (booking_id, fecha)
);

CREATE INDEX IF NOT EXISTS ix_breakfast_fecha ON public.breakfast_orders (fecha);
CREATE INDEX IF NOT EXISTS ix_breakfast_pendientes ON public.breakfast_orders (fecha, entregado)
    WHERE entregado = false;
CREATE INDEX IF NOT EXISTS ix_breakfast_booking ON public.breakfast_orders (booking_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_breakfast_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS tg_breakfast_updated_at ON public.breakfast_orders;
CREATE TRIGGER tg_breakfast_updated_at
    BEFORE UPDATE ON public.breakfast_orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_breakfast_updated_at();

-- RLS
ALTER TABLE public.breakfast_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_breakfast_select ON public.breakfast_orders;
CREATE POLICY p_breakfast_select ON public.breakfast_orders FOR SELECT TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','contabilidad'));

DROP POLICY IF EXISTS p_breakfast_insert ON public.breakfast_orders;
CREATE POLICY p_breakfast_insert ON public.breakfast_orders FOR INSERT TO authenticated
    WITH CHECK (public.has_role('superadmin','admin','recepcion'));

DROP POLICY IF EXISTS p_breakfast_update ON public.breakfast_orders;
CREATE POLICY p_breakfast_update ON public.breakfast_orders FOR UPDATE TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','contabilidad'))
    WITH CHECK (public.has_role('superadmin','admin','recepcion','contabilidad'));

DROP POLICY IF EXISTS p_breakfast_delete ON public.breakfast_orders;
CREATE POLICY p_breakfast_delete ON public.breakfast_orders FOR DELETE TO authenticated
    USING (public.has_role('superadmin','admin'));

-- View: desayunos del dia con datos de la reserva/huesped/habitacion
CREATE OR REPLACE VIEW public.breakfast_orders_view AS
SELECT
    bo.id, bo.booking_id, bo.fecha, bo.cantidad, bo.precio_unitario, bo.total, bo.moneda,
    bo.notas, bo.entregado, bo.entregado_at, bo.entregado_by, bo.creado_by,
    bo.created_at, bo.updated_at,
    b.codigo AS booking_codigo,
    b.fecha_entrada, b.fecha_salida, b.status AS booking_status,
    jsonb_build_object('id', c.id, 'nombre', c.nombres || ' ' || c.apellidos, 'telefono', c.telefono) AS customer,
    jsonb_build_object('id', r.id, 'numero', r.numero) AS room
FROM public.breakfast_orders bo
JOIN public.bookings b ON b.id = bo.booking_id
JOIN public.customers c ON c.id = b.customer_id
JOIN public.rooms r ON r.id = b.room_id;

GRANT SELECT ON public.breakfast_orders_view TO authenticated;

-- RPC: resumen del dia para el restaurante
CREATE OR REPLACE FUNCTION public.breakfast_daily_summary(p_fecha date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE v jsonb;
BEGIN
    v := jsonb_build_object(
        'fecha', p_fecha,
        'total_desayunos', COALESCE((SELECT SUM(cantidad) FROM public.breakfast_orders WHERE fecha = p_fecha), 0),
        'total_entregados', COALESCE((SELECT SUM(cantidad) FROM public.breakfast_orders WHERE fecha = p_fecha AND entregado), 0),
        'total_pendientes', COALESCE((SELECT SUM(cantidad) FROM public.breakfast_orders WHERE fecha = p_fecha AND NOT entregado), 0),
        'ingreso_total', COALESCE((SELECT SUM(total) FROM public.breakfast_orders WHERE fecha = p_fecha), 0),
        'moneda', COALESCE((SELECT moneda FROM public.breakfast_orders WHERE fecha = p_fecha LIMIT 1), 'EUR'),
        'habitaciones_count', (SELECT COUNT(*) FROM public.breakfast_orders WHERE fecha = p_fecha)
    );
    RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION public.breakfast_daily_summary(date) TO authenticated;

-- =============================================================================
-- 2. STAFF ATTENDANCE — registro de asistencia de empleados
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE public.attendance_kind AS ENUM ('entrada', 'salida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.staff_attendance (
    id           BIGSERIAL PRIMARY KEY,
    profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind         public.attendance_kind NOT NULL,
    marcado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notas        TEXT,
    ip           INET,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_attendance_profile_fecha ON public.staff_attendance (profile_id, marcado_at DESC);
CREATE INDEX IF NOT EXISTS ix_attendance_fecha ON public.staff_attendance (marcado_at DESC);

-- RLS: cada usuario ve sus propios registros; admin/superadmin ve todos
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_attend_select ON public.staff_attendance;
CREATE POLICY p_attend_select ON public.staff_attendance FOR SELECT TO authenticated
    USING (
        profile_id = auth.uid()
        OR public.has_role('superadmin','admin','contabilidad')
    );

DROP POLICY IF EXISTS p_attend_insert ON public.staff_attendance;
CREATE POLICY p_attend_insert ON public.staff_attendance FOR INSERT TO authenticated
    WITH CHECK (
        profile_id = auth.uid()
        OR public.has_role('superadmin','admin')
    );

DROP POLICY IF EXISTS p_attend_update ON public.staff_attendance;
CREATE POLICY p_attend_update ON public.staff_attendance FOR UPDATE TO authenticated
    USING (public.has_role('superadmin','admin'))
    WITH CHECK (public.has_role('superadmin','admin'));

DROP POLICY IF EXISTS p_attend_delete ON public.staff_attendance;
CREATE POLICY p_attend_delete ON public.staff_attendance FOR DELETE TO authenticated
    USING (public.has_role('superadmin'));

-- View: asistencia con nombre del empleado (evita join extra en frontend)
CREATE OR REPLACE VIEW public.staff_attendance_view AS
SELECT
    a.id, a.profile_id, a.kind, a.marcado_at, a.notas, a.ip, a.user_agent, a.created_at,
    p.nombre AS empleado_nombre, p.role AS empleado_role
FROM public.staff_attendance a
JOIN public.profiles p ON p.id = a.profile_id;

GRANT SELECT ON public.staff_attendance_view TO authenticated;

-- RPC: quien esta trabajando ahora (ultimo marcado por empleado = entrada)
CREATE OR REPLACE FUNCTION public.staff_currently_in()
RETURNS TABLE(profile_id uuid, nombre text, role public.user_role, ultima_entrada timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH ult AS (
        SELECT DISTINCT ON (a.profile_id)
            a.profile_id, a.kind, a.marcado_at
        FROM public.staff_attendance a
        WHERE a.marcado_at >= (NOW() - INTERVAL '24 hours')
        ORDER BY a.profile_id, a.marcado_at DESC
    )
    SELECT p.id, p.nombre, p.role, u.marcado_at
    FROM ult u
    JOIN public.profiles p ON p.id = u.profile_id
    WHERE u.kind = 'entrada' AND p.active = true
    ORDER BY u.marcado_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.staff_currently_in() TO authenticated;

-- RPC: horas trabajadas por empleado en un rango
CREATE OR REPLACE FUNCTION public.staff_hours_report(p_from date, p_to date, p_profile_id uuid DEFAULT NULL)
RETURNS TABLE(profile_id uuid, nombre text, role public.user_role, dias_marcados int, minutos_totales int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    WITH pares AS (
        -- Empareja cada 'entrada' con la 'salida' inmediatamente siguiente del mismo empleado
        SELECT
            a.profile_id,
            date_trunc('day', a.marcado_at)::date AS dia,
            a.marcado_at AS entrada_at,
            (SELECT MIN(s.marcado_at) FROM public.staff_attendance s
                WHERE s.profile_id = a.profile_id
                  AND s.kind = 'salida'
                  AND s.marcado_at > a.marcado_at) AS salida_at
        FROM public.staff_attendance a
        WHERE a.kind = 'entrada'
          AND a.marcado_at::date BETWEEN p_from AND p_to
          AND (p_profile_id IS NULL OR a.profile_id = p_profile_id)
    ),
    resumen AS (
        SELECT
            profile_id,
            COUNT(DISTINCT dia)::int AS dias_marcados,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(salida_at, NOW()) - entrada_at))/60)::int, 0) AS minutos_totales
        FROM pares
        GROUP BY profile_id
    )
    SELECT p.id, p.nombre, p.role, r.dias_marcados, r.minutos_totales
    FROM resumen r
    JOIN public.profiles p ON p.id = r.profile_id
    ORDER BY p.nombre;
END $$;

GRANT EXECUTE ON FUNCTION public.staff_hours_report(date, date, uuid) TO authenticated;
