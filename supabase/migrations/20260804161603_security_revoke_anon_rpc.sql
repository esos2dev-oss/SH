-- =============================================================================
-- Revocar EXECUTE de anon en los RPC/helpers restantes — APLICADA EN REMOTO
-- =============================================================================
-- La app no tiene acceso anonimo (enable_signup=false, todas las policies son
-- TO authenticated). Ningun rol anon necesita ejecutar estos RPC/helpers.
-- Se mantienen para 'authenticated' (los usa la app). Idempotente.
REVOKE EXECUTE ON FUNCTION public.auto_checkout_vencidos()                                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.checkin_window_violation(bigint)                            FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_cleaning_order(bigint, bigint, text)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_role()                                              FROM anon;
REVOKE EXECUTE ON FUNCTION public.expire_stale_bookings()                                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.from_base_usd(numeric, character, date)                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(VARIADIC public.user_role[])                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_code(text)                                             FROM anon;
REVOKE EXECUTE ON FUNCTION public.pagar_desayunos_a_restaurante(date, date, character, text)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.planta_summary(date, date)                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.rate_for_currency(character, date)                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalc_booking_payment_state(bigint)                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_currently_in()                                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_hours_report(date, date, uuid)                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.to_base_usd(numeric, character, date)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_last_login()                                          FROM anon;
