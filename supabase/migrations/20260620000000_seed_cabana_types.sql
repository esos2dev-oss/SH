-- =============================================================================
-- Tipos de cabana por defecto para el hotel.
-- =============================================================================
-- Se agregan 8 tipos como base. Idempotente via ON CONFLICT (slug).
-- Las tarifas son placeholders sugeridas — el admin las ajusta desde la UI
-- (Habitaciones → Tipos y tarifas).
-- El admin puede seguir creando mas tipos libremente desde la UI.

INSERT INTO public.room_types (nombre, slug, descripcion, capacidad, tarifa_dia, tarifa_semana, tarifa_mes, moneda, amenities) VALUES
    ('Matrimonial Sencilla', 'matrimonial-sencilla',
     'Cabana matrimonial con cama sencilla.', 2, 30.00, 180.00, 700.00, 'USD',
     '["cama matrimonial","bano privado","ventilador"]'::jsonb),

    ('Matrimonial Grande', 'matrimonial-grande',
     'Cabana matrimonial con cama grande (queen/king).', 2, 40.00, 240.00, 900.00, 'USD',
     '["cama king","bano privado","aire acondicionado"]'::jsonb),

    ('Cabana 3 personas', 'cabana-3',
     'Cabana para 3 huespedes.', 3, 50.00, 300.00, 1100.00, 'USD',
     '["3 camas","bano privado"]'::jsonb),

    ('Cabana 4 personas', 'cabana-4',
     'Cabana para 4 huespedes.', 4, 65.00, 400.00, 1400.00, 'USD',
     '["4 camas","bano privado","cocina"]'::jsonb),

    ('Cabana 5 personas', 'cabana-5',
     'Cabana para 5 huespedes.', 5, 80.00, 480.00, 1700.00, 'USD',
     '["5 camas","bano privado","cocina"]'::jsonb),

    ('Cabana 6 personas', 'cabana-6',
     'Cabana para 6 huespedes.', 6, 95.00, 570.00, 2000.00, 'USD',
     '["6 camas","2 banos","cocina","sala"]'::jsonb),

    ('Cabana 7 personas', 'cabana-7',
     'Cabana para 7 huespedes.', 7, 110.00, 660.00, 2300.00, 'USD',
     '["7 camas","2 banos","cocina","sala"]'::jsonb),

    ('Matrimonial Doble', 'matrimonial-doble',
     'Cabana con dos camas matrimoniales (ideal para 4 huespedes).', 4, 55.00, 330.00, 1200.00, 'USD',
     '["2 camas matrimoniales","bano privado","aire acondicionado"]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- Limpieza de tipos legacy de la seed inicial (sencilla/doble/suite),
-- SOLO si ninguna habitacion los referencia. Si alguna habitacion aun los usa,
-- se preservan para no romper referencias.
-- =============================================================================
DELETE FROM public.room_types
WHERE slug IN ('sencilla', 'doble', 'suite')
  AND NOT EXISTS (
    SELECT 1 FROM public.rooms r WHERE r.room_type_id = room_types.id
  );
