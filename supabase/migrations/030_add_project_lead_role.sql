-- Add 'project_lead' role: edit projects/vendors/contacts/documents and create
-- invoices, but cannot approve invoices or perform financial operations.

ALTER TABLE public.user_profiles
  DROP CONSTRAINT user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin', 'project_lead', 'project_manager'));
