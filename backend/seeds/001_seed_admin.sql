-- =============================================================================
-- 001 — Admin inicial
-- =============================================================================
-- El usuario se crea con un set_password_token aleatorio que se mostrara al ejecutar
-- el seed (ver scripts/seed.ts). El admin recibira este link por consola para crear
-- su password en /set-password/<token>.
--
-- TODO_CLIENTE: cambiar email cuando se confirme el dueño del hotel.

-- Admin con password temporal "admin123" (bcrypt cost 12)
-- DESPUES del primer login, cambia la contrasena desde Mi Perfil.
INSERT INTO users (nombre, email, password_hash, role, active)
VALUES (
    'Admin Sistema Hotelero',
    'admin@local.test',
    '$2b$12$fwSOPiyN0e4mMz/uYagClOesao8QSM07WpxS21/JYlVUwNYmVjTne',
    'superadmin',
    true
)
ON CONFLICT (email) DO NOTHING;

-- Usuarios de prueba para cada rol (mismo password: admin123)
INSERT INTO users (nombre, email, password_hash, role, active) VALUES
    ('Recepcion Demo',     'recepcion@local.test',     '$2b$12$fwSOPiyN0e4mMz/uYagClOesao8QSM07WpxS21/JYlVUwNYmVjTne', 'recepcion',     true),
    ('Limpieza Demo',      'limpieza@local.test',      '$2b$12$fwSOPiyN0e4mMz/uYagClOesao8QSM07WpxS21/JYlVUwNYmVjTne', 'limpieza',      true),
    ('Contabilidad Demo',  'contabilidad@local.test',  '$2b$12$fwSOPiyN0e4mMz/uYagClOesao8QSM07WpxS21/JYlVUwNYmVjTne', 'contabilidad',  true),
    ('Admin Demo',         'admin2@local.test',        '$2b$12$fwSOPiyN0e4mMz/uYagClOesao8QSM07WpxS21/JYlVUwNYmVjTne', 'admin',         true)
ON CONFLICT (email) DO NOTHING;
