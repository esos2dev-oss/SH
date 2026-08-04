-- =============================================================================
-- Hardening de seguridad (segun advisor de Supabase) — APLICADA EN REMOTO
-- =============================================================================
-- Corrige:
--   - 7 ERROR security_definer_view       -> las vistas pasan a security_invoker
--   - 14 WARN function_search_path_mutable -> search_path fijo
--   - WARN *_security_definer_function_executable -> revocar EXECUTE de las
--     funciones trigger/internas (nunca deben llamarse por REST /rpc)
--
-- NO se tocan current_role/has_role (las usa el RLS), los helpers de conversion
-- ni los RPC de reportes, que la app llama como authenticated.
-- Idempotente.

-- 1. Vistas SECURITY DEFINER -> security_invoker
ALTER VIEW public.bookings_with_relations       SET (security_invoker = true);
ALTER VIEW public.customers_with_stats          SET (security_invoker = true);
ALTER VIEW public.ledger_entries_with_relations SET (security_invoker = true);
ALTER VIEW public.current_exchange_rate         SET (security_invoker = true);
ALTER VIEW public.breakfast_orders_view         SET (security_invoker = true);
ALTER VIEW public.staff_attendance_view         SET (security_invoker = true);
ALTER VIEW public.planta_events_view            SET (security_invoker = true);

-- 2. search_path fijo
ALTER FUNCTION public.breakfast_bruto_neto(date, date)                     SET search_path = public, extensions;
ALTER FUNCTION public.breakfast_daily_summary(date)                        SET search_path = public, extensions;
ALTER FUNCTION public.cash_closure_preview(timestamptz, timestamptz, uuid) SET search_path = public, extensions;
ALTER FUNCTION public.customer_timeline(bigint)                            SET search_path = public, extensions;
ALTER FUNCTION public.dashboard_today(date)                                SET search_path = public, extensions;
ALTER FUNCTION public.immutable_unaccent(text)                             SET search_path = public, extensions;
ALTER FUNCTION public.ledger_summary(date, date, text)                     SET search_path = public, extensions;
ALTER FUNCTION public.reports_kpis(date, date)                             SET search_path = public, extensions;
ALTER FUNCTION public.rooms_board()                                        SET search_path = public, extensions;
ALTER FUNCTION public.tg_breakfast_updated_at()                            SET search_path = public, extensions;
ALTER FUNCTION public.tg_cleaning_orders_updated_at()                      SET search_path = public, extensions;
ALTER FUNCTION public.tg_customers_validate()                              SET search_path = public, extensions;
ALTER FUNCTION public.tg_maintenance_updated_at()                          SET search_path = public, extensions;
ALTER FUNCTION public.trg_set_updated_at()                                 SET search_path = public, extensions;

-- 3. Revocar EXECUTE de funciones trigger/internas (los triggers siguen corriendolas).
REVOKE EXECUTE ON FUNCTION public.tg_audit()                        FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_booking_payments_fill_base()   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_booking_payments_sync()        FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_booking_payments_to_ledger()   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_bookings_recalc_payment()      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_ledger_fill_base()             FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_maintenance_room_status()      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_rooms_close_cleaning_order()   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_breakfast_updated_at()         FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_cleaning_orders_updated_at()   FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_customers_validate()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_maintenance_updated_at()       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_set_updated_at()              FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                 FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                 FROM anon, authenticated, public;
