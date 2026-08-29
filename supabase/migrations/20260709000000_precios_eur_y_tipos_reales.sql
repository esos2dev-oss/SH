-- =============================================================================
-- Precios reales en EUR y tipos ajustados a la lista real del hotel El Pinar.
-- =============================================================================
-- Actualiza precios (EUR) e inserta los tipos que faltan para las habitaciones
-- reales. Los precios YA incluyen desayuno para los huespedes originales.

-- Actualizar tipos existentes: precios EUR reales
UPDATE public.room_types SET
    moneda = 'EUR',
    tarifa_dia = 56.00,
    tarifa_semana = 336.00,
    tarifa_mes = 1200.00,
    descripcion = 'Habitacion matrimonial con cama sencilla. Precio incluye desayuno.',
    tarifa_dia_bs = NULL, tarifa_semana_bs = NULL, tarifa_mes_bs = NULL
WHERE slug = 'matrimonial-sencilla';

UPDATE public.room_types SET
    moneda = 'EUR',
    nombre = 'Matrimonial Grande - Ejecutiva',
    tarifa_dia = 76.00,
    tarifa_semana = 456.00,
    tarifa_mes = 1500.00,
    descripcion = 'Habitacion ejecutiva matrimonial (cama Queen o King). Precio incluye desayuno.',
    tarifa_dia_bs = NULL, tarifa_semana_bs = NULL, tarifa_mes_bs = NULL
WHERE slug = 'matrimonial-grande';

UPDATE public.room_types SET
    moneda = 'EUR',
    nombre = 'Familiar 3 personas',
    tarifa_dia = 104.00,
    tarifa_semana = 624.00,
    tarifa_mes = 2000.00,
    descripcion = 'Habitacion familiar para 3 personas. Precio incluye desayuno.',
    tarifa_dia_bs = NULL, tarifa_semana_bs = NULL, tarifa_mes_bs = NULL
WHERE slug = 'cabana-3';

UPDATE public.room_types SET
    moneda = 'EUR',
    nombre = 'Familiar 4 personas',
    tarifa_dia = 122.00,
    tarifa_semana = 732.00,
    tarifa_mes = 2300.00,
    descripcion = 'Habitacion familiar para 4 personas. Precio incluye desayuno.',
    tarifa_dia_bs = NULL, tarifa_semana_bs = NULL, tarifa_mes_bs = NULL
WHERE slug = 'cabana-4';

UPDATE public.room_types SET
    moneda = 'EUR',
    nombre = 'Familiar 5 personas',
    tarifa_dia = 160.00,
    tarifa_semana = 960.00,
    tarifa_mes = 2900.00,
    descripcion = 'Habitacion familiar para 5 personas. Precio incluye desayuno.',
    tarifa_dia_bs = NULL, tarifa_semana_bs = NULL, tarifa_mes_bs = NULL
WHERE slug = 'cabana-5';

UPDATE public.room_types SET
    moneda = 'EUR',
    tarifa_dia = 188.00,
    tarifa_semana = 1128.00,
    tarifa_mes = 3400.00,
    descripcion = 'Cabana para 6 personas. Precio incluye desayuno.',
    tarifa_dia_bs = NULL, tarifa_semana_bs = NULL, tarifa_mes_bs = NULL
WHERE slug = 'cabana-6';

UPDATE public.room_types SET
    moneda = 'EUR',
    tarifa_dia = 216.00,
    tarifa_semana = 1296.00,
    tarifa_mes = 3900.00,
    descripcion = 'Cabana para 7 personas. Precio incluye desayuno.',
    tarifa_dia_bs = NULL, tarifa_semana_bs = NULL, tarifa_mes_bs = NULL
WHERE slug = 'cabana-7';

-- Desactivar el tipo "Matrimonial Doble" que no corresponde a la lista real
UPDATE public.room_types SET active = false WHERE slug = 'matrimonial-doble';

-- Legacy types que quedaban del seed inicial: desactivar si aun existen
UPDATE public.room_types SET active = false WHERE slug IN ('sencilla','doble','suite');

-- =============================================================================
-- Configuracion: precio del desayuno
-- =============================================================================
INSERT INTO public.settings (key, value) VALUES
    ('hotel.moneda_base',     '"EUR"'::jsonb),
    ('hotel.desayuno_precio', '7'::jsonb),
    ('hotel.desayuno_moneda', '"EUR"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
