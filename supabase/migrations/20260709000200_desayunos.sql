-- =============================================================================
-- Feature: desayunos por reserva.
-- =============================================================================
-- Cada reserva puede agregar/quitar desayunos. Los precios de la habitacion
-- incluyen 1 desayuno por huesped. En la reserva se guarda cuantos desayunos
-- adicionales o menos hay respecto al default (huespedes).
--
-- Ejemplo:
--   4 huespedes, cabana 122 EUR/dia. Todos con desayuno → desayunos_extra = 0.
--   4 huespedes, quiere solo 2 desayunos → desayunos_extra = -2 → descuento 14 EUR.
--   4 huespedes, viene 1 acompanante mas para desayuno → desayunos_extra = 1
--     → cargo extra 7 EUR (dias por 7).

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS desayunos_extra INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bookings.desayunos_extra IS
    'Delta de desayunos respecto al numero de huespedes. Positivo = mas desayunos, negativo = menos. Se multiplica por hotel.desayuno_precio y por dias.';

-- Actualizar view para exponer el campo (drop+create para cambiar columnas)
DROP VIEW IF EXISTS public.bookings_with_relations;
CREATE VIEW public.bookings_with_relations AS
SELECT
    b.id, b.codigo, b.period, b.fecha_entrada, b.fecha_salida, b.huespedes,
    b.tarifa_aplicada, b.descuento_pct, b.descuento_monto,
    b.importe_total, b.importe_pagado,
    (b.importe_total - b.importe_pagado)::numeric AS importe_pendiente,
    b.moneda, b.payment_status, b.status, b.origen, b.notas,
    b.vehicle_plate,
    b.desayunos_extra,
    b.cancelled_at, b.cancelled_reason, b.created_by, b.created_at, b.updated_at,
    jsonb_build_object(
        'id', c.id,
        'nombre', c.nombres || ' ' || c.apellidos,
        'email', c.email,
        'telefono', c.telefono
    ) AS customer,
    jsonb_build_object(
        'id', r.id,
        'numero', r.numero,
        'planta', r.planta,
        'type', rt.nombre
    ) AS room
FROM public.bookings b
JOIN public.customers c ON c.id = b.customer_id
JOIN public.rooms r ON r.id = b.room_id
JOIN public.room_types rt ON rt.id = r.room_type_id;

GRANT SELECT ON public.bookings_with_relations TO authenticated;
