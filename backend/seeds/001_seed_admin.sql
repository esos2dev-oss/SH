-- =============================================================================
-- 001 — Admin inicial
-- =============================================================================
-- El usuario se crea con un set_password_token aleatorio que se mostrara al ejecutar
-- el seed (ver scripts/seed.ts). El admin recibira este link por consola para crear
-- su password en /set-password/<token>.
--
-- TODO_CLIENTE: cambiar email cuando se confirme el dueño del hotel.

INSERT INTO users (nombre, email, password_hash, role, active, set_password_token, set_password_expires)
VALUES (
    'Admin Sistema Hotelero',
    'admin@TODO-DOMINIO.com',
    '$2b$12$placeholderxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'superadmin',
    true,
    encode(gen_random_bytes(32), 'hex'),
    NOW() + INTERVAL '7 days'
)
ON CONFLICT (email) DO NOTHING;
