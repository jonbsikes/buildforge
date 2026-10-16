-- 046: Consolidate multiple permissive RLS policies (advisor: multiple_permissive_policies)
-- Clears the remaining 48 warnings left after 045 §3 dropped viewer_read.
-- No access behavior changes: permissive policies OR together, so merging
-- "own row" + "admin" into one per-action policy with OR is exactly equivalent,
-- and the dropped SELECT policies were strict subsets of an existing ALL policy.
-- All conditions keep the 045 InitPlan style: (select auth.uid()), (select is_admin()).
-- RESTRICTIVE viewer_no_* policies are untouched.
-- NOT YET APPLIED — run this file from the dashboard SQL editor.

BEGIN;

-- ─── loans ───────────────────────────────────────────────────────────────────
-- "Users can view own project loans" (SELECT) has the identical qual as
-- "Users can manage own project loans" (ALL) — a strict duplicate.
DROP POLICY "Users can view own project loans" ON public.loans;

-- ─── invoice_line_items ──────────────────────────────────────────────────────
-- The four per-user policies are strict subsets of
-- "Authenticated users access invoice_line_items" (ALL, any authenticated user),
-- so they never grant anything extra.
DROP POLICY "Users can view their invoice line items" ON public.invoice_line_items;
DROP POLICY "Users can insert their invoice line items" ON public.invoice_line_items;
DROP POLICY "Users can update their invoice line items" ON public.invoice_line_items;
DROP POLICY "Users can delete their invoice line items" ON public.invoice_line_items;

-- ─── bank_accounts ───────────────────────────────────────────────────────────
-- Before: "Users can manage own bank accounts" (ALL, own rows),
-- "Users can view own bank accounts" (SELECT, duplicate of the ALL),
-- bank_accounts_read (SELECT true), bank_accounts_admin_{insert,update,delete}.
-- After: one policy per action; write actions = own row OR admin (same union).
DROP POLICY "Users can manage own bank accounts" ON public.bank_accounts;
DROP POLICY "Users can view own bank accounts" ON public.bank_accounts;
DROP POLICY bank_accounts_read ON public.bank_accounts;
DROP POLICY bank_accounts_admin_insert ON public.bank_accounts;
DROP POLICY bank_accounts_admin_update ON public.bank_accounts;
DROP POLICY bank_accounts_admin_delete ON public.bank_accounts;

CREATE POLICY bank_accounts_select ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY bank_accounts_insert ON public.bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id OR (select is_admin()));

CREATE POLICY bank_accounts_update ON public.bank_accounts
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id OR (select is_admin()))
  WITH CHECK ((select auth.uid()) = user_id OR (select is_admin()));

CREATE POLICY bank_accounts_delete ON public.bank_accounts
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id OR (select is_admin()));

-- ─── user_profiles ───────────────────────────────────────────────────────────
-- Before: "Admins can manage profiles" (ALL), "Authenticated users can read
-- profiles" (SELECT), "Users can insert own profile", "Users can update own
-- display_name" (role must stay unchanged).
-- After: SELECT stays with the existing read-all policy (admins are
-- authenticated, so they lose nothing); INSERT/UPDATE merge admin OR own
-- (admins may change role, users may not); DELETE stays admin-only.
DROP POLICY "Admins can manage profiles" ON public.user_profiles;
DROP POLICY "Users can insert own profile" ON public.user_profiles;
DROP POLICY "Users can update own display_name" ON public.user_profiles;

CREATE POLICY user_profiles_insert ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((select is_admin()) OR (select auth.uid()) = id);

CREATE POLICY user_profiles_update ON public.user_profiles
  FOR UPDATE TO authenticated
  USING ((select is_admin()) OR (select auth.uid()) = id)
  WITH CHECK (
    (select is_admin())
    OR (
      (select auth.uid()) = id
      AND role = (SELECT up.role FROM public.user_profiles up WHERE up.id = (select auth.uid()))
    )
  );

CREATE POLICY user_profiles_delete ON public.user_profiles
  FOR DELETE TO authenticated
  USING ((select is_admin()));

COMMIT;
