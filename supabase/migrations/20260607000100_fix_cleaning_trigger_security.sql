-- =============================================================================
-- Fix: el trigger que cierra cleaning_orders al pasar room a 'disponible'
-- debe ser SECURITY DEFINER para poder UPDATE sobre cleaning_orders desde el
-- contexto de cualquier usuario (sin chocar contra RLS del invoker).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tg_rooms_close_cleaning_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status = 'limpieza' AND NEW.status = 'disponible' THEN
        UPDATE public.cleaning_orders
        SET status      = 'completada',
            finished_at = NOW(),
            assigned_to = COALESCE(assigned_to, auth.uid())
        WHERE room_id = NEW.id
          AND status IN ('pendiente','en_proceso');
    END IF;
    RETURN NEW;
END $$;
