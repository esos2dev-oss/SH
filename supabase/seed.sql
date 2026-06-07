-- =============================================================================
-- Seed data — Sistema Hotelero
-- =============================================================================
-- Se ejecuta despues de migraciones en `supabase db reset` y en `supabase start`.
-- El usuario superadmin se crea separado via Supabase Auth (ver scripts/create-admin.ts
-- o el dashboard -> Authentication -> Add user).

-- Tipos de habitacion base
INSERT INTO public.room_types (nombre, slug, descripcion, capacidad, tarifa_dia, tarifa_semana, tarifa_mes, moneda)
VALUES
    ('Sencilla',  'sencilla',  'Habitacion sencilla con cama matrimonial',    2, 30.00,  180.00, 700.00,  'USD'),
    ('Doble',     'doble',     'Habitacion doble con dos camas individuales', 4, 45.00,  270.00, 1000.00, 'USD'),
    ('Suite',     'suite',     'Suite ejecutiva con sala separada',           4, 80.00,  500.00, 1800.00, 'USD')
ON CONFLICT (slug) DO NOTHING;

-- Categorias de ledger por defecto
INSERT INTO public.ledger_categories (nombre, slug, type) VALUES
    ('Alojamiento',        'alojamiento',        'ingreso'),
    ('Servicios extra',    'servicios-extra',    'ingreso'),
    ('Restauracion',       'restauracion',       'ingreso'),
    ('Otros ingresos',     'otros-ingresos',     'ingreso'),
    ('Nomina',             'nomina',             'egreso'),
    ('Servicios publicos', 'servicios-publicos', 'egreso'),
    ('Suministros',        'suministros',        'egreso'),
    ('Mantenimiento',      'mantenimiento',      'egreso'),
    ('Impuestos',          'impuestos',          'egreso'),
    ('Otros egresos',      'otros-egresos',      'egreso')
ON CONFLICT (slug) DO NOTHING;

-- Settings base
INSERT INTO public.settings (key, value) VALUES
    ('hotel.moneda_base', '"USD"'::jsonb),
    ('hotel.iva_pct',     '16'::jsonb),
    ('hotel.nombre',      '"TODO — completar"'::jsonb)
ON CONFLICT (key) DO NOTHING;
