-- =============================================================================
-- Fix: el trigger que cierra cleaning_orders cuando room pasa a 'disponible'
-- chocaba contra el CHECK ck_cleaning_finished_after_started porque seteaba
-- finished_at = NOW() sin setear started_at primero.
--
-- Caso real: limpieza marca room como disponible directamente sin haber pasado
-- por started_at (no abrieron la orden manualmente). Es valido — la orden se
-- cerro sin un "en progreso" explicito. Seteamos started_at = NOW() tambien.
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
            started_at  = COALESCE(started_at, NOW()),
            finished_at = NOW(),
            assigned_to = COALESCE(assigned_to, auth.uid())
        WHERE room_id = NEW.id
          AND status IN ('pendiente','en_proceso');
    END IF;
    RETURN NEW;
END $$;
