-- =============================================================================
-- Fix: staff_hours_report tenia ambiguedad entre OUT `profile_id` y columna.
-- =============================================================================

DROP FUNCTION IF EXISTS public.staff_hours_report(date, date, uuid);

CREATE OR REPLACE FUNCTION public.staff_hours_report(p_from date, p_to date, p_profile_id uuid DEFAULT NULL)
RETURNS TABLE(prof_id uuid, nombre text, role public.user_role, dias_marcados int, minutos_totales int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    WITH pares AS (
        SELECT
            a.profile_id AS prof_id,
            date_trunc('day', a.marcado_at)::date AS dia,
            a.marcado_at AS entrada_at,
            (SELECT MIN(s.marcado_at) FROM public.staff_attendance s
                WHERE s.profile_id = a.profile_id
                  AND s.kind = 'salida'
                  AND s.marcado_at > a.marcado_at) AS salida_at
        FROM public.staff_attendance a
        WHERE a.kind = 'entrada'
          AND a.marcado_at::date BETWEEN p_from AND p_to
          AND (p_profile_id IS NULL OR a.profile_id = p_profile_id)
    ),
    resumen AS (
        SELECT
            pares.prof_id,
            COUNT(DISTINCT pares.dia)::int AS dias_marcados,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(pares.salida_at, NOW()) - pares.entrada_at))/60)::int, 0) AS minutos_totales
        FROM pares
        GROUP BY pares.prof_id
    )
    SELECT p.id, p.nombre, p.role, r.dias_marcados, r.minutos_totales
    FROM resumen r
    JOIN public.profiles p ON p.id = r.prof_id
    ORDER BY p.nombre;
END $$;

GRANT EXECUTE ON FUNCTION public.staff_hours_report(date, date, uuid) TO authenticated;
