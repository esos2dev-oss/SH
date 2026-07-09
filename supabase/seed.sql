-- =============================================================================
-- Seed data — Sistema Hotelero
-- =============================================================================
-- Se ejecuta despues de migraciones en `supabase db reset` y en `supabase start`.
-- El usuario superadmin se crea separado via Supabase Auth (ver scripts/create-admin.ts
-- o el dashboard -> Authentication -> Add user).

-- Tipos de cabana base (se pueden agregar mas desde la UI)
INSERT INTO public.room_types (nombre, slug, descripcion, capacidad, tarifa_dia, tarifa_semana, tarifa_mes, moneda, amenities) VALUES
    ('Matrimonial Sencilla', 'matrimonial-sencilla', 'Cabana matrimonial con cama sencilla.', 2, 30.00, 180.00, 700.00, 'USD', '["cama matrimonial","bano privado","ventilador"]'::jsonb),
    ('Matrimonial Grande',   'matrimonial-grande',   'Cabana matrimonial con cama grande (queen/king).', 2, 40.00, 240.00, 900.00, 'USD', '["cama king","bano privado","aire acondicionado"]'::jsonb),
    ('Cabana 3 personas',    'cabana-3',             'Cabana para 3 huespedes.', 3, 50.00, 300.00, 1100.00, 'USD', '["3 camas","bano privado"]'::jsonb),
    ('Cabana 4 personas',    'cabana-4',             'Cabana para 4 huespedes.', 4, 65.00, 400.00, 1400.00, 'USD', '["4 camas","bano privado","cocina"]'::jsonb),
    ('Cabana 5 personas',    'cabana-5',             'Cabana para 5 huespedes.', 5, 80.00, 480.00, 1700.00, 'USD', '["5 camas","bano privado","cocina"]'::jsonb),
    ('Cabana 6 personas',    'cabana-6',             'Cabana para 6 huespedes.', 6, 95.00, 570.00, 2000.00, 'USD', '["6 camas","2 banos","cocina","sala"]'::jsonb),
    ('Cabana 7 personas',    'cabana-7',             'Cabana para 7 huespedes.', 7, 110.00, 660.00, 2300.00, 'USD', '["7 camas","2 banos","cocina","sala"]'::jsonb),
    ('Matrimonial Doble',    'matrimonial-doble',    'Cabana con dos camas matrimoniales (ideal para 4 huespedes).', 4, 55.00, 330.00, 1200.00, 'USD', '["2 camas matrimoniales","bano privado","aire acondicionado"]'::jsonb)
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
