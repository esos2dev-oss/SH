-- =============================================================================
-- 002 — Tipos de habitacion base
-- =============================================================================
-- TODO_CLIENTE: ajustar tarifas reales en Fase 01 (Discovery).

INSERT INTO room_types (nombre, slug, descripcion, capacidad, tarifa_dia, tarifa_semana, tarifa_mes, moneda, amenities)
VALUES
    ('Sencilla', 'sencilla', 'Habitacion para una persona', 1, 50.00, 280.00, 1100.00, 'USD',
        '["wifi", "tv", "ducha"]'::jsonb),
    ('Doble', 'doble', 'Habitacion con cama matrimonial o dos camas individuales', 2, 80.00, 460.00, 1800.00, 'USD',
        '["wifi", "tv", "ducha", "minibar"]'::jsonb),
    ('Suite', 'suite', 'Suite con sala de estar y vista', 4, 180.00, 1050.00, 4000.00, 'USD',
        '["wifi", "tv", "ducha", "minibar", "ac", "vista"]'::jsonb)
ON CONFLICT (slug) DO NOTHING;
