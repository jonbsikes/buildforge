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

  // Determine project type so we can name the COA account appropriately
  const { data: project } = await supabase
    .from("projects")
    .select("project_type, name")
    .eq("id", input.project_id)
    .maybeSingle();

  const loanNum = input.loan_number.trim();
  const isLandDev = project?.project_type === "land_development";
  const coaName = isLandDev
    ? `Dev Loan Payable — #${loanNum}`
    : `Constr Loan — #${loanNum}`;

  // Find the next available account number in the loan liability range (2201+)
  const { data: maxAcctRow } = await supabase
    .from("chart_of_accounts")
    .select("account_number")
    .eq("type", "liability")
    .eq("subtype", "loan")
    .gte("account_number", "2201")
    .order("account_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextAcctNum = maxAcctRow
    ? String(parseInt(maxAcctRow.account_number) + 1)
    : "2201";

  // Create the COA liability account for this loan
  const { data: coaAcct, error: coaErr } = await supabase
    .from("chart_of_accounts")
    .insert({
      account_number: nextAcctNum,
      name: coaName,
      type: "liability",
      subtype: "loan",
      is_system: false,
      is_active: true,
    })
    .select("id")
    .single();

  if (coaErr || !coaAcct) return { error: coaErr?.message ?? "Failed to create COA account for loan" };

  const { data, error } = await supabase
    .from("loans")
    .insert({
      project_id: input.project_id,
      lender_id: input.lender_id,
      loan_number: loanNum,
      loan_amount: loanAmount,
      loan_type: input.loan_type || "term_loan",
      credit_limit: creditLimit,
      current_balance: currentBalance,
      interest_rate: interestRate,
      origination_date: input.origination_date || null,
      maturity_date: input.maturity_date || null,
      status: input.status,
      notes: input.notes.trim() || null,
      coa_account_id: coaAcct.id,
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

// ---------------------------------------------------------------------------
// accrueConstructionInterest
// Records a monthly interest accrual for a construction loan.
//
// For active construction projects:
//   Dr Capitalized Interest (1220) / Cr Accrued Interest Payable (2110)
//   → Interest is added to the asset cost basis; shows on balance sheet as WIP.
//
// For completed projects or G&A loans:
//   Dr Interest Expense (6710) / Cr Accrued Interest Payable (2110)
//   → Interest flows directly to the income statement.
//
// Called from the loan detail page UI each month, or can be batched.
// ---------------------------------------------------------------------------

export interface AccrueInterestInput {
  loan_id: string;
  project_id: string | null;
  amount: number;
  accrual_date: string;  // YYYY-MM-DD
  description?: string;
  capitalize: boolean;   // true = Dr 1220, false = Dr 6710
}

export async function accrueConstructionInterest(
  input: AccrueInterestInput
): Promise<{ error?: string; journalEntryId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!input.amount || input.amount <= 0) return { error: "Interest amount must be positive" };
  if (!input.accrual_date) return { error: "Accrual date is required" };

  const debitAccountNumber = input.capitalize ? "1220" : "6710";

  const { data: glAccounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", [debitAccountNumber, "2110"]);

  const debitAcctId = glAccounts?.find(a => a.account_number === debitAccountNumber)?.id;
  const acct2110 = glAccounts?.find(a => a.account_number === "2110")?.id;

  if (!debitAcctId || !acct2110) {
    return { error: "Required GL accounts not found. Ensure accounts 1220/6710 and 2110 exist in Chart of Accounts." };
  }

  const desc = input.description?.trim() ||
    (input.capitalize ? "Capitalized interest — construction loan" : "Interest expense — construction loan");

  const { data: je, error: jeErr } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: input.accrual_date,
      reference: `INT-${input.loan_id.slice(0, 8)}-${input.accrual_date.slice(0, 7)}`,
      description: desc,
      status: "posted",
      source_type: "manual",
      loan_id: input.loan_id,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (jeErr || !je) return { error: jeErr?.message ?? "Failed to create journal entry" };

  const { error: lineErr } = await supabase.from("journal_entry_lines").insert([
    {
      journal_entry_id: je.id,
      account_id: debitAcctId,
      project_id: input.project_id ?? null,
      loan_id: input.loan_id,
      description: desc,
      debit: input.amount,
      credit: 0,
    },
    {
      journal_entry_id: je.id,
      account_id: acct2110,
      project_id: input.project_id ?? null,
      loan_id: input.loan_id,
      description: `Accrued interest payable — ${input.accrual_date.slice(0, 7)}`,
      debit: 0,
      credit: input.amount,
    },
  ]);

  if (lineErr) return { error: lineErr.message };

  revalidatePath("/banking/loans");
  if (input.project_id) revalidatePath(`/projects/${input.project_id}/loans`);
  return { journalEntryId: je.id };
}

// ---------------------------------------------------------------------------
// recordLotCost
// Records a lot purchase with closing costs.
//
// For Home Construction:
//   Dr Construction WIP (1210) / Cr Loan Payable or Cash (1000)
//
// For Land Development:
//   Dr CIP — Land (1230) / Cr Loan Payable or Cash (1000)
//
// The total debit is the combined lot purchase price + closing costs.
// If a loan_id is provided, the credit goes to the loan's COA account;
// otherwise, it credits Cash (1000).
// ---------------------------------------------------------------------------

export interface LotCostInput {
  project_id: string;
  loan_id?: string | null;      // optional — the construction/dev loan that funded the lot purchase
  amount: number;               // lot purchase price
  closing_costs: number;        // closing fees, title, etc.
  entry_date: string;           // YYYY-MM-DD — closing date
  description?: string;
  cost_code?: number;           // default to 34 (Lot Cost) for home construction, or 1 for land dev
}

export async function recordLotCost(
  input: LotCostInput
): Promise<{ error?: string; journalEntryId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Validate inputs
  const purchasePrice = parseFloat(String(input.amount)) || 0;
  const closingCosts = parseFloat(String(input.closing_costs)) || 0;
  const totalAmount = purchasePrice + closingCosts;

  if (totalAmount <= 0) {
    return { error: "Total lot cost (purchase price + closing costs) must be positive" };
  }
  if (!input.entry_date) {
    return { error: "Entry date (closing date) is required" };
  }

  // Look up the project to determine type
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("project_type, name")
    .eq("id", input.project_id)
    .maybeSingle();

  if (projErr || !project) {
    return { error: projErr?.message ?? "Project not found" };
  }

  // Determine the debit account based on project type
  const debitAccountNumber =
    project.project_type === "land_development" ? "1230" : "1210";

  // Determine the credit account
  let creditAccountNumber = "1000"; // Default to Cash
  let creditAccountId: string | undefined;

  if (input.loan_id) {
    // Look up the loan's COA account
    const { data: loan, error: loanErr } = await supabase
      .from("loans")
      .select("coa_account_id")
      .eq("id", input.loan_id)
      .maybeSingle();

    if (loanErr || !loan?.coa_account_id) {
      return {
        error:
          loanErr?.message ?? "Loan not found or has no associated COA account",
      };
    }
    creditAccountId = loan.coa_account_id;
  }

  // Fetch the GL account IDs
  const accountsToFetch = [debitAccountNumber];
  if (!creditAccountId) {
    accountsToFetch.push(creditAccountNumber);
  }

  const { data: glAccounts, error: acctErr } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", accountsToFetch);

  if (acctErr || !glAccounts) {
    return {
      error: acctErr?.message ?? "Failed to fetch GL accounts",
    };
  }

  const debitAcctId = glAccounts.find(
    (a) => a.account_number === debitAccountNumber
  )?.id;
  if (!debitAcctId) {
    return {
      error: `Required GL account ${debitAccountNumber} not found in Chart of Accounts`,
    };
  }

  if (!creditAccountId) {
    creditAccountId = glAccounts.find(
      (a) => a.account_number === creditAccountNumber
    )?.id;
    if (!creditAccountId) {
      return {
        error: `Required GL account ${creditAccountNumber} not found in Chart of Accounts`,
      };
    }
  }

  // Build description
  const desc =
    input.description?.trim() ||
    `Lot cost — ${project.name} (purchase: $${purchasePrice.toFixed(2)}, closing: $${closingCosts.toFixed(2)})`;

  // Create journal entry header
  const { data: je, error: jeErr } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: input.entry_date,
      reference: `LOT-${input.project_id.slice(0, 8)}-${input.entry_date.slice(0, 7)}`,
      description: desc,
      status: "posted",
      source_type: "lot_cost",
      source_id: input.project_id,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (jeErr || !je) {
    return { error: jeErr?.message ?? "Failed to create journal entry" };
  }

  // Create journal entry lines (debit WIP/CIP, credit loan/cash)
  const { error: lineErr } = await supabase
    .from("journal_entry_lines")
    .insert([
      {
        journal_entry_id: je.id,
        account_id: debitAcctId,
        project_id: input.project_id,
        description: `Lot cost debit — purchase $${purchasePrice.toFixed(2)} + closing $${closingCosts.toFixed(2)}`,
        debit: totalAmount,
        credit: 0,
      },
      {
        journal_entry_id: je.id,
        account_id: creditAccountId,
        project_id: input.project_id,
        description: `Lot cost credit — ${project.name}`,
        debit: 0,
        credit: totalAmount,
      },
    ]);

  if (lineErr) {
    return { error: lineErr.message };
  }

  // Revalidate paths
  revalidatePath("/banking/loans");
  revalidatePath(`/projects/${input.project_id}`);

  return { journalEntryId: je.id };
}
