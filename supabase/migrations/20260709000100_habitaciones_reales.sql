-- =============================================================================
-- Habitaciones reales del hotel El Pinar (17 unidades).
-- =============================================================================
-- Elimina primero las habitaciones de prueba que no tienen bookings vinculados
-- e inserta las 17 reales con su tipo correcto.

-- 1. Limpiar bookings/payments/checkins de test (codigo BK-2026-T*)
DELETE FROM public.booking_payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE codigo LIKE 'BK-2026-T%');
DELETE FROM public.check_ins        WHERE booking_id IN (SELECT id FROM public.bookings WHERE codigo LIKE 'BK-2026-T%');
DELETE FROM public.ledger_entries   WHERE booking_id IN (SELECT id FROM public.bookings WHERE codigo LIKE 'BK-2026-T%');
DELETE FROM public.bookings         WHERE codigo LIKE 'BK-2026-T%';

-- Test ledger entries independientes
DELETE FROM public.ledger_entries WHERE codigo LIKE 'LG-2026-T%';

-- 2. Eliminar rooms de test que ya no tienen bookings
DELETE FROM public.rooms
WHERE numero IN ('101','102','103','201','202','203','301','302')
  AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.room_id = rooms.id);

-- Tambien cualquier booking BK-2026-000N residuo del QA
DELETE FROM public.booking_payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_id IN (SELECT id FROM public.customers WHERE doc_numero IN ('V-12345678','V-23456789','C01234567','V-34567890')));
DELETE FROM public.check_ins        WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_id IN (SELECT id FROM public.customers WHERE doc_numero IN ('V-12345678','V-23456789','C01234567','V-34567890')));
DELETE FROM public.ledger_entries   WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_id IN (SELECT id FROM public.customers WHERE doc_numero IN ('V-12345678','V-23456789','C01234567','V-34567890')));
DELETE FROM public.bookings         WHERE customer_id IN (SELECT id FROM public.customers WHERE doc_numero IN ('V-12345678','V-23456789','C01234567','V-34567890'));

DELETE FROM public.rooms WHERE NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.room_id = rooms.id);

-- 3. Insertar 17 habitaciones reales
DO $$
DECLARE
    v_matri_sencilla  bigint;
    v_matri_grande    bigint;
    v_fam_3           bigint;
    v_fam_4           bigint;
    v_fam_5           bigint;
    v_cab_6           bigint;
    v_cab_7           bigint;
BEGIN
    SELECT id INTO v_matri_sencilla FROM public.room_types WHERE slug = 'matrimonial-sencilla';
    SELECT id INTO v_matri_grande   FROM public.room_types WHERE slug = 'matrimonial-grande';
    SELECT id INTO v_fam_3          FROM public.room_types WHERE slug = 'cabana-3';
    SELECT id INTO v_fam_4          FROM public.room_types WHERE slug = 'cabana-4';
    SELECT id INTO v_fam_5          FROM public.room_types WHERE slug = 'cabana-5';
    SELECT id INTO v_cab_6          FROM public.room_types WHERE slug = 'cabana-6';
    SELECT id INTO v_cab_7          FROM public.room_types WHERE slug = 'cabana-7';

    INSERT INTO public.rooms (numero, room_type_id, status, notas) VALUES
        ('1',  v_matri_sencilla, 'disponible', NULL),
        ('2',  v_matri_sencilla, 'disponible', NULL),
        ('3',  v_matri_sencilla, 'disponible', NULL),
        ('4',  v_matri_sencilla, 'disponible', NULL),
        ('5',  v_matri_sencilla, 'disponible', NULL),
        ('6',  v_matri_sencilla, 'disponible', NULL),
        ('7',  v_matri_sencilla, 'disponible', NULL),
        ('8',  v_matri_grande,   'disponible', 'Ejecutiva - cama Queen'),
        ('9',  v_matri_grande,   'disponible', 'Ejecutiva - cama King'),
        ('10', v_cab_6,          'disponible', 'Cabana grande'),
        ('11', v_fam_4,          'disponible', 'Doble para 4 personas'),
        ('12', v_matri_sencilla, 'disponible', 'Matrimonial'),
        ('15', v_cab_7,          'disponible', 'Cabana grande'),
        ('16', v_fam_3,          'disponible', 'Familiar'),
        ('17', v_fam_5,          'disponible', 'Familiar'),
        ('18', v_fam_4,          'disponible', 'Familiar'),
        ('19', v_fam_4,          'disponible', 'Familiar')
    ON CONFLICT (numero) DO NOTHING;
END $$;
