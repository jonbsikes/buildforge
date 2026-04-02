"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Bank Accounts
// ---------------------------------------------------------------------------

export interface BankAccountInput {
  bank_name: string;
  account_name: string;
  account_last_four: string;
  account_type: string;
  notes: string;
}

export async function createBankAccount(
  input: BankAccountInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      bank_name: input.bank_name.trim(),
      account_name: input.account_name.trim(),
      account_last_four: input.account_last_four.replace(/\D/g, "").slice(-4),
      account_type: input.account_type,
      notes: input.notes.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/banking/accounts");
  return { id: data.id };
}

export async function updateBankAccount(
  id: string,
  input: BankAccountInput
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("bank_accounts")
    .update({
      bank_name: input.bank_name.trim(),
      account_name: input.account_name.trim(),
      account_last_four: input.account_last_four.replace(/\D/g, "").slice(-4),
      account_type: input.account_type,
      notes: input.notes.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/banking/accounts");
  return {};
}

export async function deleteBankAccount(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/banking/accounts");
  return {};
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export interface LoanInput {
  project_id: string;
  lender_id: string;
  loan_number: string;
  loan_amount: string;
  loan_type: string;
  credit_limit: string;
  current_balance: string;
  interest_rate: string;
  origination_date: string;
  maturity_date: string;
  status: string;
  notes: string;
}

export async function createLoan(
  input: LoanInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const loanAmount = parseFloat(input.loan_amount);
  if (isNaN(loanAmount) || loanAmount <= 0) return { error: "Loan amount must be a positive number" };

  const interestRate = input.interest_rate ? parseFloat(input.interest_rate) : null;
  if (interestRate !== null && isNaN(interestRate)) return { error: "Interest rate must be a valid number" };

  const creditLimit = input.loan_type === "line_of_credit" && input.credit_limit ? parseFloat(input.credit_limit) : null;
  if (creditLimit !== null && isNaN(creditLimit)) return { error: "Credit limit must be a valid number" };

  const currentBalance = input.loan_type === "line_of_credit" && input.current_balance ? parseFloat(input.current_balance) : 0;
  if (isNaN(currentBalance)) return { error: "Current balance must be a valid number" };

  const { data, error } = await supabase
    .from("loans")
    .insert({
      project_id: input.project_id,
      lender_id: input.lender_id,
      loan_number: input.loan_number.trim(),
      loan_amount: loanAmount,
      loan_type: input.loan_type || "term_loan",
      credit_limit: creditLimit,
      current_balance: currentBalance,
      interest_rate: interestRate,
      origination_date: input.origination_date || null,
      maturity_date: input.maturity_date || null,
      status: input.status,
      notes: input.notes.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/banking/loans");
  return { id: data.id };
}

export async function updateLoan(
  id: string,
  input: LoanInput
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const loanAmount = parseFloat(input.loan_amount);
  if (isNaN(loanAmount) || loanAmount <= 0) return { error: "Loan amount must be a positive number" };

  const interestRate = input.interest_rate ? parseFloat(input.interest_rate) : null;
  if (interestRate !== null && isNaN(interestRate)) return { error: "Interest rate must be a valid number" };

  const creditLimit = input.loan_type === "line_of_credit" && input.credit_limit ? parseFloat(input.credit_limit) : null;
  if (creditLimit !== null && isNaN(creditLimit)) return { error: "Credit limit must be a valid number" };

  const currentBalance = input.loan_type === "line_of_credit" && input.current_balance ? parseFloat(input.current_balance) : 0;
  if (isNaN(currentBalance)) return { error: "Current balance must be a valid number" };

  const { error } = await supabase
    .from("loans")
    .update({
      project_id: input.project_id,
      lender_id: input.lender_id,
      loan_number: input.loan_number.trim(),
      loan_amount: loanAmount,
      loan_type: input.loan_type || "term_loan",
      credit_limit: creditLimit,
      current_balance: currentBalance,
      interest_rate: interestRate,
      origination_date: input.origination_date || null,
      maturity_date: input.maturity_date || null,
      status: input.status,
      notes: input.notes.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/banking/loans");
  return {};
}

export async function deleteLoan(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("loans").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/banking/loans");
  return {};
}
