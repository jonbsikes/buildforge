-- 042: Security hardening driven by Supabase advisor findings (2026-06-09).
--
--   1. Pin search_path on every flagged function (prevents search-path
--      hijacking of SECURITY DEFINER / RPC functions).
--   2. SECURITY DEFINER helpers must not be callable with the public anon
--      key — revoke anon/public EXECUTE, re-grant authenticated explicitly.
--   3. rate_limit_entries had RLS disabled (advisor ERROR). Both callers
--      (vendors/extract, invoices/extract API routes) are authenticated and
--      key rows by the caller's own user id, so the policy scopes rows to
--      key = auth.uid().
--   4. bank_accounts carried a stale wide-open `owner access` USING(true)
--      policy that defeated its two proper owner-scoped policies (policies
--      are OR'd). Replaced with company-wide read + admin-only writes,
--      matching the app layer (all banking actions call requireAdmin).

-- ---------------------------------------------------------------------------
-- 1. Pin search_path
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.cleanup_rate_limits(bigint) SET search_path = public;
ALTER FUNCTION public.get_user_role() SET search_path = public;
ALTER FUNCTION public.post_journal_entry(date, text, text, text, text, uuid, uuid, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.get_balance_sheet_data(date, uuid) SET search_path = public;
ALTER FUNCTION public.get_wip_balances(uuid) SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.get_invoice_line_actuals_by_project() SET search_path = public;
ALTER FUNCTION public.apply_vendor_credits(jsonb) SET search_path = public;
ALTER FUNCTION public.get_income_statement_data(date, date) SET search_path = public;
ALTER FUNCTION public.get_cash_flow_data(date, date) SET search_path = public;
ALTER FUNCTION public.get_wip_balances_asof(date, uuid) SET search_path = public;
ALTER FUNCTION public.get_project_invoice_actuals() SET search_path = public;
ALTER FUNCTION public.get_vendor_invoice_stats(date) SET search_path = public;
ALTER FUNCTION public.get_project_budget_totals() SET search_path = public;
ALTER FUNCTION public.get_cash_flow_categorized(date, date) SET search_path = public;
ALTER FUNCTION public.get_cash_flow_statement(date, date) SET search_path = public;
ALTER FUNCTION public.get_cash_flow_lines(date, date) SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. SECURITY DEFINER functions: no anon execution
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.generate_notifications() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_user_owns_any_project() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.generate_notifications() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_owns_any_project() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. rate_limit_entries: enable RLS, scope rows to the caller's own key
-- ---------------------------------------------------------------------------
ALTER TABLE public.rate_limit_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_limit_self ON public.rate_limit_entries;
CREATE POLICY rate_limit_self ON public.rate_limit_entries
  FOR ALL TO authenticated
  USING (key = auth.uid()::text)
  WITH CHECK (key = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 4. bank_accounts: remove the stale always-true policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "owner access" ON public.bank_accounts;
-- The two proper owner-scoped policies (auth.uid() = user_id) remain. Add
-- company-wide read + admin writes so a second company user can still see
-- accounts they didn't create, and admin server actions keep working.
DROP POLICY IF EXISTS bank_accounts_read ON public.bank_accounts;
CREATE POLICY bank_accounts_read ON public.bank_accounts
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS bank_accounts_admin_insert ON public.bank_accounts;
CREATE POLICY bank_accounts_admin_insert ON public.bank_accounts
  FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS bank_accounts_admin_update ON public.bank_accounts;
CREATE POLICY bank_accounts_admin_update ON public.bank_accounts
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS bank_accounts_admin_delete ON public.bank_accounts;
CREATE POLICY bank_accounts_admin_delete ON public.bank_accounts
  FOR DELETE TO authenticated USING (is_admin());
