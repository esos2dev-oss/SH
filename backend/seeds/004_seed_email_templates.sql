-- =============================================================================
-- 004 — Plantillas de email iniciales
-- =============================================================================
-- TODO_CLIENTE: personalizar tono y contenido segun marca del hotel en Fase 04.

INSERT INTO email_templates (nombre, event, asunto, body_html, body_text, variables) VALUES
(
    'Bienvenida estandar',
    'bienvenida',
    'Te damos la bienvenida a {{hotel.nombre}}',
    '<p>Hola {{customer.nombres}},</p><p>Gracias por registrarte en <strong>{{hotel.nombre}}</strong>. Estamos preparando todo para tu llegada.</p><p>Si necesitas algo, responde este correo y te ayudamos.</p><p>Equipo {{hotel.nombre}}</p>',
    'Hola {{customer.nombres}}, gracias por registrarte en {{hotel.nombre}}.',
    '["customer.nombres", "hotel.nombre"]'::jsonb
),
(
    'Post-estancia agradecimiento',
    'post_estancia',
    'Gracias por hospedarte en {{hotel.nombre}}',
    '<p>Hola {{customer.nombres}},</p><p>Esperamos que hayas disfrutado tu estancia. Te invitamos a contarnos tu experiencia.</p><p>Vuelve pronto.</p>',
    'Hola {{customer.nombres}}, gracias por tu estancia en {{hotel.nombre}}.',
    '["customer.nombres", "hotel.nombre"]'::jsonb
),
(
    'Recuperacion clientes inactivos',
    'recuperacion',
    'Te extranamos en {{hotel.nombre}}',
    '<p>Hola {{customer.nombres}},</p><p>Ha pasado tiempo desde tu ultima estancia. Tenemos una oferta especial para ti.</p>',
    'Hola {{customer.nombres}}, te extranamos en {{hotel.nombre}}.',
    '["customer.nombres", "hotel.nombre"]'::jsonb
),
(
    'Felicitacion cumpleaños',
    'fecha_especial',
    'Feliz cumpleaños, {{customer.nombres}}',
    '<p>Hola {{customer.nombres}},</p><p>El equipo de {{hotel.nombre}} te desea un feliz cumpleaños. Ven a celebrarlo con nosotros.</p>',
    'Feliz cumpleaños desde {{hotel.nombre}}.',
    '["customer.nombres", "hotel.nombre"]'::jsonb
)
ON CONFLICT (nombre) DO NOTHING;
