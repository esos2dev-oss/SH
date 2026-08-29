-- =============================================================================
-- Politica: TODOS los pagos se registran como 'confirmed'.
-- =============================================================================
-- Convierte los pagos existentes en pending_confirmation a confirmed.
-- Mantenemos el ENUM 'pending_confirmation' en el schema por si se necesita
-- historicamente, pero la app ya no lo emite.

UPDATE public.booking_payments
SET status = 'confirmed',
    confirmed_at = COALESCE(confirmed_at, pagado_at, NOW()),
    confirmed_by = COALESCE(confirmed_by, registered_by)
WHERE status = 'pending_confirmation';
