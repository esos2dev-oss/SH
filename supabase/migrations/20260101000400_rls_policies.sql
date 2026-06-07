-- =============================================================================
-- Row Level Security — politicas por tabla
-- =============================================================================
-- Usa public.current_role() / public.has_role() definidos en 20260101000100_profiles.sql

-- =============================================================================
-- PROFILES
-- superadmin/admin: leen todo; resto: solo su propia fila
-- INSERT/UPDATE/DELETE: solo superadmin (via edge function con service role para alta)
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_profiles_select ON public.profiles
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin', 'admin') OR id = auth.uid());

CREATE POLICY p_profiles_update ON public.profiles
    FOR UPDATE TO authenticated
    USING (public.has_role('superadmin') OR id = auth.uid())
    WITH CHECK (public.has_role('superadmin') OR id = auth.uid());

-- INSERT/DELETE de profiles se hace siempre por trigger (auth.users) o service role.
-- No exponemos politicas de insert/delete a authenticated.

-- =============================================================================
-- ROOM TYPES (lectura libre autenticados, escritura admin/superadmin)
-- =============================================================================
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_room_types_select ON public.room_types
    FOR SELECT TO authenticated USING (true);

CREATE POLICY p_room_types_write ON public.room_types
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin'))
    WITH CHECK (public.has_role('superadmin', 'admin'));

-- =============================================================================
-- ROOMS (lectura todos los roles activos; UPDATE de status: limpieza puede cambiar)
-- =============================================================================
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_rooms_select ON public.rooms
    FOR SELECT TO authenticated USING (true);

CREATE POLICY p_rooms_insert ON public.rooms
    FOR INSERT TO authenticated
    WITH CHECK (public.has_role('superadmin', 'admin'));

CREATE POLICY p_rooms_update ON public.rooms
    FOR UPDATE TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion', 'limpieza'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'recepcion', 'limpieza'));

CREATE POLICY p_rooms_delete ON public.rooms
    FOR DELETE TO authenticated
    USING (public.has_role('superadmin', 'admin'));

-- =============================================================================
-- CUSTOMERS (lectura recepcion+; escritura recepcion+)
-- =============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_customers_select ON public.customers
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion', 'contabilidad'));

CREATE POLICY p_customers_write ON public.customers
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'recepcion'));

-- =============================================================================
-- BOOKINGS
-- =============================================================================
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_bookings_select ON public.bookings
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion', 'contabilidad'));

CREATE POLICY p_bookings_write ON public.bookings
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'recepcion'));

-- =============================================================================
-- BOOKING PAYMENTS
-- =============================================================================
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_payments_select ON public.booking_payments
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion', 'contabilidad'));

CREATE POLICY p_payments_write ON public.booking_payments
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion', 'contabilidad'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'recepcion', 'contabilidad'));

-- =============================================================================
-- CHECK_INS
-- =============================================================================
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_checkins_select ON public.check_ins
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion', 'contabilidad'));

CREATE POLICY p_checkins_write ON public.check_ins
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'recepcion'));

-- =============================================================================
-- LEDGER
-- =============================================================================
ALTER TABLE public.ledger_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_ledger_cat_select ON public.ledger_categories
    FOR SELECT TO authenticated USING (true);

CREATE POLICY p_ledger_cat_write ON public.ledger_categories
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'contabilidad'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'contabilidad'));

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_ledger_select ON public.ledger_entries
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion', 'contabilidad'));

CREATE POLICY p_ledger_insert ON public.ledger_entries
    FOR INSERT TO authenticated
    WITH CHECK (public.has_role('superadmin', 'admin', 'contabilidad', 'recepcion'));

-- Ledger entries son inmutables: no UPDATE ni DELETE. Correccion via asiento inverso.

-- =============================================================================
-- RECEIPTS
-- =============================================================================
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_receipts_select ON public.receipts
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin', 'admin', 'recepcion', 'contabilidad'));

CREATE POLICY p_receipts_write ON public.receipts
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'contabilidad', 'recepcion'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'contabilidad', 'recepcion'));

-- =============================================================================
-- EXCHANGE RATES (lectura libre autenticados; escritura recepcion+)
-- =============================================================================
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_exchange_rates_select ON public.exchange_rates
    FOR SELECT TO authenticated USING (true);

CREATE POLICY p_exchange_rates_write ON public.exchange_rates
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'contabilidad', 'recepcion'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'contabilidad', 'recepcion'));

-- =============================================================================
-- BANK STATEMENTS / MOVEMENTS (solo contabilidad+)
-- =============================================================================
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_bank_statements_all ON public.bank_statements
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'contabilidad'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'contabilidad'));

ALTER TABLE public.bank_statement_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_bsm_all ON public.bank_statement_movements
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin', 'contabilidad'))
    WITH CHECK (public.has_role('superadmin', 'admin', 'contabilidad'));

-- =============================================================================
-- CASH CLOSURES
-- =============================================================================
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_cash_closures_all ON public.cash_closures
    FOR ALL TO authenticated
    USING (
        public.has_role('superadmin', 'admin', 'contabilidad')
        OR (public.has_role('recepcion') AND user_id = auth.uid())
    )
    WITH CHECK (
        public.has_role('superadmin', 'admin', 'contabilidad', 'recepcion')
    );

-- =============================================================================
-- AUDIT LOG (insert libre por triggers/services; lectura solo admin/superadmin)
-- =============================================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_audit_select ON public.audit_log
    FOR SELECT TO authenticated
    USING (public.has_role('superadmin', 'admin'));

CREATE POLICY p_audit_insert ON public.audit_log
    FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================================================
-- SETTINGS
-- =============================================================================
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_settings_select ON public.settings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY p_settings_write ON public.settings
    FOR ALL TO authenticated
    USING (public.has_role('superadmin', 'admin'))
    WITH CHECK (public.has_role('superadmin', 'admin'));

-- =============================================================================
-- STORAGE: politicas por bucket
-- =============================================================================
-- Bucket "receipts": solo roles contables/recepcion+
CREATE POLICY p_storage_receipts_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'receipts'
        AND public.has_role('superadmin', 'admin', 'contabilidad', 'recepcion')
    );

CREATE POLICY p_storage_receipts_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'receipts'
        AND public.has_role('superadmin', 'admin', 'contabilidad', 'recepcion')
    );

-- Bucket "check-in-docs": recepcion+
CREATE POLICY p_storage_checkin_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'check-in-docs'
        AND public.has_role('superadmin', 'admin', 'recepcion')
    );

CREATE POLICY p_storage_checkin_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'check-in-docs'
        AND public.has_role('superadmin', 'admin', 'recepcion')
    );

-- Bucket "room-photos" es publico (politica simple de lectura)
CREATE POLICY p_storage_room_photos_select ON storage.objects
    FOR SELECT USING (bucket_id = 'room-photos');

CREATE POLICY p_storage_room_photos_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'room-photos'
        AND public.has_role('superadmin', 'admin')
    );
