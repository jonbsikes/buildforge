"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  calculateHomeConstructionDates,
  calculateLandDevDates,
} from "@/lib/stage-schedules";
import { mintLoanCoaAccount } from "./banking";
import { requireAdmin } from "@/lib/auth";
import { revalidateAfterProjectMutation } from "@/lib/cache";

export interface SubdivisionMatch {
  matched: boolean;
  subdivisionName: string;
  costCodeIds: string[];
}

// Check if a subdivision name matches an existing project and return its cost code selections
export async function checkSubdivisionMatch(
  subdivisionName: string
): Promise<SubdivisionMatch> {
  if (!subdivisionName.trim()) {
    return { matched: false, subdivisionName, costCodeIds: [] };
  }

  const supabase = await createClient();

  // Find the most recently created project in this subdivision
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("subdivision", subdivisionName.trim())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!project) {
    return { matched: false, subdivisionName, costCodeIds: [] };
  }

  // Fetch that project's cost code selections
  const { data: pcc } = await supabase
    .from("project_cost_codes")
    .select("cost_code_id")
    .eq("project_id", project.id);

  const costCodeIds = (pcc ?? []).map((r) => r.cost_code_id);

  return {
    matched: true,
    subdivisionName: subdivisionName.trim(),
    costCodeIds,
  };
}

export interface CreateHomeConstructionInput {
  name: string;
  address: string;
  subdivision: string;
  block: string;
  lot: string;
  lot_size_acres: string;
  plan: string;
  home_size_sf: string;
  start_date: string;
  lender_id: string;
  status?: string;
  loan_number?: string;
  selected_cost_code_ids: string[];
}

export async function createHomeConstructionProject(
  input: CreateHomeConstructionInput
): Promise<{ error?: string; projectId?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Insert project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      address: input.address.trim() || null,
      subdivision: input.subdivision.trim() || null,
      block: input.block.trim() || null,
      lot: input.lot.trim() || null,
      lot_size_acres: input.lot_size_acres ? parseFloat(input.lot_size_acres) : null,
      plan: input.plan.trim() || null,
      home_size_sf: input.home_size_sf ? parseInt(input.home_size_sf, 10) : null,
      start_date: input.start_date || null,
      lender_id: input.lender_id || null,
      project_type: "home_construction",
      status: (input.status as "planning" | "active" | "on_hold" | "completed" | "cancelled") ?? "planning",
      total_budget: 0,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    return { error: projectError?.message ?? "Failed to create project" };
  }

  // Insert project_cost_codes — filter out G&A codes and validate project type match
  if (input.selected_cost_code_ids.length > 0) {
    // Validate selected codes: exclude G&A and codes for wrong project type
    const { data: validCodes } = await supabase
      .from("cost_codes")
      .select("id, project_type")
      .in("id", input.selected_cost_code_ids)
      .neq("project_type", "general_admin");

    const validIds = new Set((validCodes ?? [])
      .filter(c => c.project_type === "home_construction" || c.project_type === null)
      .map(c => c.id));
    const filteredIds = input.selected_cost_code_ids.filter(id => validIds.has(id));

    if (filteredIds.length > 0) {
      const { error: pccError } = await supabase.from("project_cost_codes").insert(
        filteredIds.map((costCodeId) => ({
          project_id: project.id,
          cost_code_id: costCodeId,
          budgeted_amount: 0,
        }))
      );
      if (pccError) {
        // Rollback: delete orphaned project
        await supabase.from("projects").delete().eq("id", project.id);
        return { error: `Failed to assign cost codes: ${pccError.message}` };
      }
    }
  }

  // Insert build_stages
  if (input.start_date) {
    const stages = calculateHomeConstructionDates(input.start_date);
    const { error: stageError } = await supabase.from("build_stages").insert(
      stages.map((s) => ({
        project_id:          project.id,
        stage_number:        s.stage_number,
        stage_name:          s.stage_name,
        track:               s.track,
        status:              "not_started",
        planned_start_date:  s.planned_start_date,
        planned_end_date:    s.planned_end_date,
        baseline_start_date: s.baseline_start_date,
        baseline_end_date:   s.baseline_end_date,
      }))
    );
    if (stageError) {
      // Rollback: delete orphaned project (cascades to cost codes)
      await supabase.from("projects").delete().eq("id", project.id);
      return { error: `Failed to create build stages: ${stageError.message}` };
    }
  }

  // Create loan record if loan number and lender are provided
  if (input.loan_number?.trim() && input.lender_id) {
    const loanNum = input.loan_number.trim();

    // Mint the per-loan COA liability account BEFORE inserting the loans row.
    // fundDraw requires loans.coa_account_id to post the Loan Payable JE, so
    // a loan without it is unusable downstream.
    const coa = await mintLoanCoaAccount(supabase, project.id, loanNum);
    if (coa.error || !coa.coaAccountId) {
      revalidateAfterProjectMutation(project.id);
      return { projectId: project.id, error: `Project created, but loan COA account failed: ${coa.error}` };
    }

    const { error: loanError } = await supabase.from("loans").insert({
      project_id: project.id,
      lender_id: input.lender_id,
      loan_number: loanNum,
      loan_amount: 0,
      loan_type: "term_loan",
      status: "active",
      coa_account_id: coa.coaAccountId,
    });
    // Loan failure is non-fatal — project and stages are already created.
    // Roll back the orphaned COA account, then surface the error.
    if (loanError) {
      await supabase.from("chart_of_accounts").delete().eq("id", coa.coaAccountId);
      revalidateAfterProjectMutation(project.id);
      return { projectId: project.id, error: `Project created, but loan record failed: ${loanError.message}` };
    }
  }

  revalidateAfterProjectMutation(project.id);
  return { projectId: project.id };
}

export interface CreateLandDevInput {
  name: string;
  address: string;
  size_acres: string;
  number_of_lots: string;
  number_of_phases: string;
  start_date: string;
  lender_id: string;
  status?: string;
  loan_number?: string;
  selected_cost_code_ids: string[];
}

export async function createLandDevProject(
  input: CreateLandDevInput
): Promise<{ error?: string; projectId?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Insert project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      address: input.address.trim() || null,
      size_acres: input.size_acres ? parseFloat(input.size_acres) : null,
      number_of_lots: input.number_of_lots ? parseInt(input.number_of_lots, 10) : null,
      number_of_phases: input.number_of_phases ? parseInt(input.number_of_phases, 10) : null,
      start_date: input.start_date || null,
      lender_id: input.lender_id || null,
      project_type: "land_development",
      status: (input.status as "planning" | "active" | "on_hold" | "completed" | "cancelled") ?? "planning",
      total_budget: 0,
    })
    .select("id")
    .single();

  if (projectError || !project) {
    return { error: projectError?.message ?? "Failed to create project" };
  }

  // Insert project_cost_codes — filter out G&A codes and validate project type match
  if (input.selected_cost_code_ids.length > 0) {
    const { data: validCodes } = await supabase
      .from("cost_codes")
      .select("id, project_type")
      .in("id", input.selected_cost_code_ids)
      .neq("project_type", "general_admin");

    const validIds = new Set((validCodes ?? [])
      .filter(c => c.project_type === "land_development" || c.project_type === null)
      .map(c => c.id));
    const filteredIds = input.selected_cost_code_ids.filter(id => validIds.has(id));

    if (filteredIds.length > 0) {
      const { error: pccError } = await supabase.from("project_cost_codes").insert(
        filteredIds.map((costCodeId) => ({
          project_id: project.id,
          cost_code_id: costCodeId,
          budgeted_amount: 0,
        }))
      );
      if (pccError) {
        await supabase.from("projects").delete().eq("id", project.id);
        return { error: `Failed to assign cost codes: ${pccError.message}` };
      }
    }
  }

  // Insert build_stages
  if (input.start_date) {
    const stages = calculateLandDevDates(input.start_date);
    const { error: stageError } = await supabase.from("build_stages").insert(
      stages.map((s) => ({
        project_id:          project.id,
        stage_number:        s.stage_number,
        stage_name:          s.stage_name,
        track:               s.track,
        status:              "not_started",
        planned_start_date:  s.planned_start_date,
        planned_end_date:    s.planned_end_date,
        baseline_start_date: s.baseline_start_date,
        baseline_end_date:   s.baseline_end_date,
      }))
    );
    if (stageError) {
      await supabase.from("projects").delete().eq("id", project.id);
      return { error: `Failed to create build stages: ${stageError.message}` };
    }
  }

  // Create loan record if loan number and lender are provided
  if (input.loan_number?.trim() && input.lender_id) {
    const loanNum = input.loan_number.trim();

    const coa = await mintLoanCoaAccount(supabase, project.id, loanNum);
    if (coa.error || !coa.coaAccountId) {
      revalidateAfterProjectMutation(project.id);
      return { projectId: project.id, error: `Project created, but loan COA account failed: ${coa.error}` };
    }

    const { error: loanError } = await supabase.from("loans").insert({
      project_id: project.id,
      lender_id: input.lender_id,
      loan_number: loanNum,
      loan_amount: 0,
      loan_type: "term_loan",
      status: "active",
      coa_account_id: coa.coaAccountId,
    });
    if (loanError) {
      await supabase.from("chart_of_accounts").delete().eq("id", coa.coaAccountId);
      revalidateAfterProjectMutation(project.id);
      return { projectId: project.id, error: `Project created, but loan record failed: ${loanError.message}` };
    }
  }

  revalidateAfterProjectMutation(project.id);
  return { projectId: project.id };
}
