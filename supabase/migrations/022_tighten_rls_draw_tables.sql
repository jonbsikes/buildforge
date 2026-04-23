-- 022_tighten_rls_draw_tables.sql
--
-- Replaces the broad `auth.role() = 'authenticated'` RLS policies on
-- loan_draws, draw_invoices, gl_entries, vendor_payments,
-- vendor_payment_invoices, and vendor_payment_adjustments with
-- project-ownership checks.
--
-- Scope model:
--   * Rows with a concrete project_id → user must own that project.
--   * Rows with a NULL project_id (multi-project draws, company-level GL)
--     → user must own at least one project in this deployment (the
--     single-owner invariant). Prevents a future second user from seeing
--     records they have no relation to.
--   * Pivot tables (draw_invoices, vendor_payment_invoices,
--     vendor_payment_adjustments) and vendor_payments chain up to the
--     parent draw's project check.

-- Helper: is the current user the owner of any project? Runs SECURITY
-- DEFINER so RLS on `projects` doesn't interfere with the check.
CREATE OR REPLACE FUNCTION public.current_user_owns_any_project()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.current_user_owns_any_project() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_owns_any_project() TO authenticated;

-- ============================================================
-- loan_draws
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage draws" ON loan_draws;
DROP POLICY IF EXISTS "Authenticated users access loan_draws" ON loan_draws;

CREATE POLICY "loan_draws_owner_access" ON loan_draws
  FOR ALL TO authenticated
  USING (
    public.current_user_owns_any_project()
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = loan_draws.project_id
          AND p.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.current_user_owns_any_project()
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = loan_draws.project_id
          AND p.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- draw_invoices
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage draw_invoices" ON draw_invoices;
DROP POLICY IF EXISTS "Authenticated users access draw_invoices" ON draw_invoices;

CREATE POLICY "draw_invoices_owner_access" ON draw_invoices
  FOR ALL TO authenticated
  USING (
    public.current_user_owns_any_project()
    AND EXISTS (
      SELECT 1 FROM public.loan_draws ld
      WHERE ld.id = draw_invoices.draw_id
        AND (
          ld.project_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = ld.project_id
              AND p.user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    public.current_user_owns_any_project()
    AND EXISTS (
      SELECT 1 FROM public.loan_draws ld
      WHERE ld.id = draw_invoices.draw_id
        AND (
          ld.project_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = ld.project_id
              AND p.user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- gl_entries  (legacy table; CLAUDE.md forbids writing new rows to it)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage gl_entries" ON gl_entries;
DROP POLICY IF EXISTS "Authenticated users access gl_entries" ON gl_entries;

CREATE POLICY "gl_entries_owner_access" ON gl_entries
  FOR ALL TO authenticated
  USING (
    public.current_user_owns_any_project()
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = gl_entries.project_id
          AND p.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.current_user_owns_any_project()
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = gl_entries.project_id
          AND p.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- vendor_payments
-- ============================================================
DROP POLICY IF EXISTS "authenticated_vendor_payments" ON vendor_payments;

CREATE POLICY "vendor_payments_owner_access" ON vendor_payments
  FOR ALL TO authenticated
  USING (
    public.current_user_owns_any_project()
    AND EXISTS (
      SELECT 1 FROM public.loan_draws ld
      WHERE ld.id = vendor_payments.draw_id
        AND (
          ld.project_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = ld.project_id
              AND p.user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    public.current_user_owns_any_project()
    AND EXISTS (
      SELECT 1 FROM public.loan_draws ld
      WHERE ld.id = vendor_payments.draw_id
        AND (
          ld.project_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = ld.project_id
              AND p.user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- vendor_payment_invoices
-- ============================================================
DROP POLICY IF EXISTS "authenticated_vendor_payment_invoices" ON vendor_payment_invoices;

CREATE POLICY "vendor_payment_invoices_owner_access" ON vendor_payment_invoices
  FOR ALL TO authenticated
  USING (
    public.current_user_owns_any_project()
    AND EXISTS (
      SELECT 1
      FROM public.vendor_payments vp
      JOIN public.loan_draws ld ON ld.id = vp.draw_id
      WHERE vp.id = vendor_payment_invoices.vendor_payment_id
        AND (
          ld.project_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = ld.project_id
              AND p.user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    public.current_user_owns_any_project()
    AND EXISTS (
      SELECT 1
      FROM public.vendor_payments vp
      JOIN public.loan_draws ld ON ld.id = vp.draw_id
      WHERE vp.id = vendor_payment_invoices.vendor_payment_id
        AND (
          ld.project_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = ld.project_id
              AND p.user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- vendor_payment_adjustments
-- ============================================================
DROP POLICY IF EXISTS "authenticated_vendor_payment_adjustments" ON vendor_payment_adjustments;

CREATE POLICY "vendor_payment_adjustments_owner_access" ON vendor_payment_adjustments
  FOR ALL TO authenticated
  USING (
    public.current_user_owns_any_project()
    AND EXISTS (
      SELECT 1
      FROM public.vendor_payments vp
      JOIN public.loan_draws ld ON ld.id = vp.draw_id
      WHERE vp.id = vendor_payment_adjustments.vendor_payment_id
        AND (
          ld.project_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = ld.project_id
              AND p.user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    public.current_user_owns_any_project()
    AND EXISTS (
      SELECT 1
      FROM public.vendor_payments vp
      JOIN public.loan_draws ld ON ld.id = vp.draw_id
      WHERE vp.id = vendor_payment_adjustments.vendor_payment_id
        AND (
          ld.project_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = ld.project_id
              AND p.user_id = auth.uid()
          )
        )
    )
  );
