-- =============================================================================
-- Rol 'restaurante' + flujo de pago al restaurante (ingreso bruto -> neto).
-- =============================================================================
-- El restaurante externo:
--   - VE la lista diaria de desayunos por habitacion
--   - Marca cada orden como entregada
--   - No ve precios ni marca pagos (opcional: si el hotel quiere que vea totales)
-- El superadmin/admin:
--   - Ve totales entregados
--   - Ejecuta "Pagar al restaurante" en un rango de fechas
--   - Esto crea un egreso en ledger y marca ordenes como pagadas
-- Con eso el reporte financiero muestra ingreso bruto (huesped) vs neto (tras pagar).

-- 1. Agregar 'restaurante' al ENUM user_role (aplicado por separado antes)
--    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'restaurante';
-- Nota: en Postgres un valor de enum solo puede usarse en la transaccion
-- siguiente a su creacion. Por eso este ALTER se aplica separado.

-- 2. Nuevos campos en breakfast_orders para trazar el pago al restaurante
ALTER TABLE public.breakfast_orders
    ADD COLUMN IF NOT EXISTS pagado_a_restaurante     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pagado_a_restaurante_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pagado_a_restaurante_by  UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS ledger_entry_id          BIGINT REFERENCES public.ledger_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_breakfast_pagados
    ON public.breakfast_orders (pagado_a_restaurante, fecha)
    WHERE pagado_a_restaurante = false AND entregado = true;

COMMENT ON COLUMN public.breakfast_orders.pagado_a_restaurante IS
    'El hotel ya le pago al restaurante externo este desayuno. Convierte ingreso bruto en neto.';

-- 3. Actualizar RLS para incluir 'restaurante'
-- Puede ver la lista (para saber que preparar) pero solo update de "entregado".
DROP POLICY IF EXISTS p_breakfast_select ON public.breakfast_orders;
CREATE POLICY p_breakfast_select ON public.breakfast_orders FOR SELECT TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','contabilidad','restaurante'));

DROP POLICY IF EXISTS p_breakfast_update ON public.breakfast_orders;
CREATE POLICY p_breakfast_update ON public.breakfast_orders FOR UPDATE TO authenticated
    USING (public.has_role('superadmin','admin','recepcion','contabilidad','restaurante'))
    WITH CHECK (public.has_role('superadmin','admin','recepcion','contabilidad','restaurante'));

-- Tambien la vista y los bookings/rooms/customers para las FK del select embebido
-- (el rol restaurante necesita leer estas)
DROP POLICY IF EXISTS p_bookings_select_restaurante ON public.bookings;
CREATE POLICY p_bookings_select_restaurante ON public.bookings FOR SELECT TO authenticated
    USING (public.has_role('restaurante'));

DROP POLICY IF EXISTS p_customers_select_restaurante ON public.customers;
CREATE POLICY p_customers_select_restaurante ON public.customers FOR SELECT TO authenticated
    USING (public.has_role('restaurante'));

DROP POLICY IF EXISTS p_rooms_select_restaurante ON public.rooms;
CREATE POLICY p_rooms_select_restaurante ON public.rooms FOR SELECT TO authenticated
    USING (public.has_role('restaurante'));

-- =============================================================================
-- 4. Categoria ledger para pago a restaurante
-- =============================================================================
INSERT INTO public.ledger_categories (nombre, slug, type)
VALUES ('Pago al restaurante', 'pago-restaurante', 'egreso')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 5. RPC: pagar_desayunos_a_restaurante
-- =============================================================================
-- Toma todas las ordenes de desayuno entregadas en un rango que aun no fueron
-- pagadas al restaurante. Crea UN solo asiento ledger (egreso) por el total y
-- marca todas las ordenes como pagadas + les guarda el ledger_entry_id.
CREATE OR REPLACE FUNCTION public.pagar_desayunos_a_restaurante(
    p_from date,
    p_to   date,
    p_moneda char(3) DEFAULT 'EUR',
    p_notas text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_total       numeric := 0;
    v_count       int     := 0;
    v_ids         bigint[];
    v_codigo      text;
    v_ledger_id   bigint;
    v_category_id bigint;
    v_uid         uuid := auth.uid();
BEGIN
    -- Solo admin/superadmin
    IF NOT public.has_role('superadmin','admin','contabilidad') THEN
        RAISE EXCEPTION 'Solo superadmin/admin/contabilidad pueden ejecutar pagos al restaurante';
    END IF;

    SELECT id INTO v_category_id FROM public.ledger_categories WHERE slug = 'pago-restaurante';
    IF v_category_id IS NULL THEN
        RAISE EXCEPTION 'Categoria pago-restaurante no existe';
    END IF;

    -- Junta ordenes elegibles: entregadas, no pagadas, en rango
    SELECT array_agg(id), COALESCE(SUM(total), 0), COUNT(*)
      INTO v_ids, v_total, v_count
      FROM public.breakfast_orders
      WHERE entregado = true
        AND pagado_a_restaurante = false
        AND fecha BETWEEN p_from AND p_to;

    IF v_count = 0 OR v_total <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_orders', 'total', 0, 'count', 0);
    END IF;

    -- Genera codigo LG-YYYY-NNNN
    v_codigo := public.next_code('LG');

    -- Crea el asiento egreso
    INSERT INTO public.ledger_entries (
        codigo, type, category_id, fecha, descripcion,
        monto, moneda, registered_by
    ) VALUES (
        v_codigo, 'egreso', v_category_id, CURRENT_DATE,
        COALESCE(p_notas,
            'Pago al restaurante por desayunos entregados del ' || p_from || ' al ' || p_to
            || ' (' || v_count || ' ordenes)'),
        v_total, p_moneda, v_uid
    ) RETURNING id INTO v_ledger_id;

    -- Marca las ordenes como pagadas
    UPDATE public.breakfast_orders
       SET pagado_a_restaurante    = true,
           pagado_a_restaurante_at = NOW(),
           pagado_a_restaurante_by = v_uid,
           ledger_entry_id         = v_ledger_id
     WHERE id = ANY(v_ids);

    RETURN jsonb_build_object(
        'ok', true,
        'ledger_entry_id', v_ledger_id,
        'ledger_codigo', v_codigo,
        'total', v_total,
        'moneda', p_moneda,
        'orders_count', v_count,
        'from', p_from, 'to', p_to
    );
END $$;

REVOKE ALL ON FUNCTION public.pagar_desayunos_a_restaurante(date, date, char, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pagar_desayunos_a_restaurante(date, date, char, text) TO authenticated;

-- =============================================================================
-- 6. RPC: resumen bruto vs neto de desayunos
-- =============================================================================
CREATE OR REPLACE FUNCTION public.breakfast_bruto_neto(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
    v_bruto numeric := 0;      -- Ingreso bruto: lo que se cobro al huesped (entregado)
    v_costo numeric := 0;      -- Costo pagado al restaurante
    v_pendiente numeric := 0;  -- Entregado pero aun no pagado al restaurante
    v_count_entregados int := 0;
    v_count_pagados int := 0;
BEGIN
    SELECT COALESCE(SUM(total), 0), COUNT(*)
      INTO v_bruto, v_count_entregados
      FROM public.breakfast_orders
      WHERE entregado = true AND fecha BETWEEN p_from AND p_to;

    SELECT COALESCE(SUM(total), 0), COUNT(*)
      INTO v_costo, v_count_pagados
      FROM public.breakfast_orders
      WHERE entregado = true AND pagado_a_restaurante = true AND fecha BETWEEN p_from AND p_to;

    v_pendiente := v_bruto - v_costo;

    RETURN jsonb_build_object(
        'from', p_from, 'to', p_to,
        'ingreso_bruto', v_bruto,
        'costo_restaurante', v_costo,
        'ingreso_neto', v_bruto - v_costo,
        'pendiente_pagar_restaurante', v_pendiente,
        'count_entregados', v_count_entregados,
        'count_pagados_al_restaurante', v_count_pagados,
        'moneda', 'EUR'
    );
END $$;

GRANT EXECUTE ON FUNCTION public.breakfast_bruto_neto(date, date) TO authenticated;
