-- =============================================================================
-- 003 — Categorias del ledger
-- =============================================================================

-- Ingresos
INSERT INTO ledger_categories (nombre, slug, type) VALUES
    ('Alquiler de habitacion', 'alquiler',  'ingreso'),
    ('Servicios extras',       'extras',    'ingreso'),
    ('Multas / cargos',        'multas',    'ingreso'),
    ('Otros ingresos',         'otros_ing', 'ingreso')
ON CONFLICT (slug) DO NOTHING;

-- Egresos
INSERT INTO ledger_categories (nombre, slug, type) VALUES
    ('Salarios',           'salarios',     'egreso'),
    ('Servicios publicos', 'servicios',    'egreso'),
    ('Mantenimiento',      'mantenimiento','egreso'),
    ('Marketing',          'marketing',    'egreso'),
    ('Suministros',        'suministros',  'egreso'),
    ('Impuestos',          'impuestos',    'egreso'),
    ('Otros egresos',      'otros_eg',     'egreso')
ON CONFLICT (slug) DO NOTHING;
