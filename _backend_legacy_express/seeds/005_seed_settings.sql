-- =============================================================================
-- 005 — Configuracion del hotel (settings clave-valor)
-- =============================================================================
-- TODO_CLIENTE: ajustar todos los valores en Fase 01.

INSERT INTO settings (key, value) VALUES
    ('hotel.nombre',              '"Sistema Hotelero"'::jsonb),
    ('hotel.moneda',              '"USD"'::jsonb),
    ('hotel.zona_horaria',        '"America/Caracas"'::jsonb),
    ('hotel.idioma',              '"es"'::jsonb),
    ('hotel.email_contacto',      '"contacto@TODO-DOMINIO.com"'::jsonb),
    ('hotel.telefono',            '"+58 0000 0000000"'::jsonb),
    ('hotel.direccion',           '"TODO_CLIENTE: completar direccion"'::jsonb),

    ('politica.checkin_hora',     '"14:00"'::jsonb),
    ('politica.checkout_hora',    '"11:00"'::jsonb),
    ('politica.cancelacion',      '"Cancelacion gratuita hasta 24h antes del check-in."'::jsonb),
    ('politica.deposito_minimo_pct', '50'::jsonb),

    ('email.remitente_nombre',    '"Sistema Hotelero"'::jsonb),
    ('email.responder_a',         '""'::jsonb)
ON CONFLICT (key) DO NOTHING;
