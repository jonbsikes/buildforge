"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, BookOpen, Trash2, ChevronDown, ChevronRight, AlertCircle, Info, HardHat, Home, DollarSign, Landmark, Percent, Tag, RotateCcw } from "lucide-react";
import { createJournalEntry, voidJournalEntry, reverseJournalEntry, type JournalLineInput } from "@/app/actions/journal-entries";
import ConfirmButton from "@/components/ui/ConfirmButton";
import StatusBadge from "@/components/ui/StatusBadge";

type Account  = { id: string; account_number: string; name: string; type: string; subtype: string | null };
type CostCode = { id: string; code: number; description: string; category: string };
type Project  = { id: string; name: string };
type Loan     = { id: string; loan_number: string; project_id: string; loan_type: string; coa_account_id: string | null; project?: { name: string } | null };

type JournalLine = {
  id: string;
  account_id: string;
  account: { account_number: string; name: string };
  project_id: string | null;
  project: { name: string } | null;
  cost_code_id: string | null;
  cost_code: { code: number; description: string } | null;
  description: string | null;
  debit: number;
  credit: number;
};

type JournalEntry = {
  id: string;
  entry_date: string;
  reference: string | null;
  description: string;
  status: "draft" | "posted" | "voided";
  source_type: string | null;
  loan_id: string | null;
  loan?: { loan_number: string } | null;
  created_at: string;
  total_debits: number;
  lines?: JournalLine[];
};

type EntryType = "general" | "wip_costs" | "home_closing" | "capitalized_interest" | "loan_draw" | "loan_interest";

// Accounts where a cost code should be shown (WIP / CIP / Land Inventory debit lines)
const WIP_ACCOUNT_NUMBERS = new Set(["1210", "1220", "1230", "1200"]);

const EMPTY_LINE = (): JournalLineInput & { _key: number } => ({
  _key: Date.now() + Math.random(),
  account_id: "",
  project_id: null,
  cost_code_id: null,
  description: "",
  debit: 0,
  credit: 0,
});

const ENTRY_TYPES: { value: EntryType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "general",               label: "General",               icon: <BookOpen size={13} />,   description: "Adjustments, contributions, corrections" },
  { value: "wip_costs",            label: "Construction WIP",      icon: <HardHat size={13} />,    description: "Capitalize direct costs to balance sheet WIP" },
  { value: "home_closing",         label: "Home Closing",          icon: <Home size={13} />,       description: "Transfer WIP to COGS + record sale" },
  { value: "capitalized_interest", label: "Capitalized Interest",  icon: <DollarSign size={13} />, description: "Capitalize loan interest to WIP" },
  { value: "loan_draw",            label: "Loan Draw",             icon: <Landmark size={13} />,   description: "Record funded draw — cash in, loan payable up" },
  { value: "loan_interest",        label: "Loan Interest Payment", icon: <Percent size={13} />,    description: "Record interest payment on construction loan" },
];

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function JournalEntriesClient() {
  const supabase = createClient();
  const [entries, setEntries]         = useState<JournalEntry[]>([]);
  const [accounts, setAccounts]       = useState<Account[]>([]);
  const [costCodes, setCostCodes]     = useState<CostCode[]>([]);
  const [projects, setProjects]       = useState<Project[]>([]);
  const [loans, setLoans]             = useState<Loan[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState("");
  const [toastError, setToastError]   = useState<string | null>(null);

  // Form state
  const [selectedLoanId, setSelectedLoanId]     = useState<string | null>(null);
  const [entryType, setEntryType]               = useState<EntryType>("general");
  const [entryDate, setEntryDate]               = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference]               = useState("");
  const [description, setDescription]           = useState("");
  const [status, setStatus]                     = useState<"draft" | "posted">("posted");
  const [lines, setLines]                       = useState<(JournalLineInput & { _key: number })[]>([EMPTY_LINE(), EMPTY_LINE()]);
  const [projectWipBalance, setProjectWipBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: entriesData },
      { data: accsData },
      { data: codesData },
      { data: projData },
      { data: loansData },
    ] = await Promise.all([
      supabase
        .from("journal_entries")
        .select("id, entry_date, reference, description, status, source_type, loan_id, loan:loans(loan_number), created_at, journal_entry_lines(debit)")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("chart_of_accounts").select("id, account_number, name, type, subtype").eq("is_active", true).order("account_number"),
      supabase.from("cost_codes").select("id, code, description, category").order("code"),
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("loans").select("id, loan_number, project_id, loan_type, coa_account_id, project:projects(name)").order("loan_number"),
    ]);

    type FetchedEntry = Omit<JournalEntry, "total_debits" | "lines"> & {
      journal_entry_lines?: { debit: number | null }[] | null;
    };
    const enriched: JournalEntry[] = ((entriesData ?? []) as unknown as FetchedEntry[]).map((e) => {
      const total = (e.journal_entry_lines ?? []).reduce((s, l) => s + Number(l.debit ?? 0), 0);
      const { journal_entry_lines: _lines, ...rest } = e;
      return { ...rest, total_debits: total };
    });
    setEntries(enriched);
    setAccounts(accsData ?? []);
    setCostCodes((codesData as unknown as CostCode[]) ?? []);
    setProjects(projData ?? []);
    setLoans((loansData as unknown as Loan[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadProjectWip(projectId: string) {
    if (!projectId) { setProjectWipBalance(null); return; }
    const wipAcct = accounts.find((a) => a.account_number === "1210");
    if (!wipAcct) { setProjectWipBalance(null); return; }
    type WipRow = { debit: number | null; credit: number | null; journal_entry: { status: string } | null };
    const { data } = await supabase
      .from("journal_entry_lines")
      .select("debit, credit, journal_entry:journal_entries(status)")
      .eq("account_id", wipAcct.id)
      .eq("project_id", projectId);
    const posted = ((data ?? []) as unknown as WipRow[]).filter((l) => l.journal_entry?.status === "posted");
    const balance = posted.reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0);
    setProjectWipBalance(balance);
  }

  function getAccountId(number: string) {
    return accounts.find((a) => a.account_number === number)?.id ?? "";
  }

  function applyEntryType(type: EntryType) {
    setEntryType(type);
    setProjectWipBalance(null);
    if (type === "wip_costs") {
      setDescription("Construction costs — capitalize to WIP");
      setLines([
        { ...EMPTY_LINE(), account_id: getAccountId("1210"), description: "Construction cost" },
        { ...EMPTY_LINE(), account_id: getAccountId("2000"), description: "Trade payable" },
      ]);
    } else if (type === "home_closing") {
      setDescription("Home closing — transfer WIP to COGS and record sale");
      setLines([
        { ...EMPTY_LINE(), account_id: getAccountId("5000"), description: "Cost of sales — transfer from WIP" },
        { ...EMPTY_LINE(), account_id: getAccountId("1210"), description: "Clear WIP balance" },
        { ...EMPTY_LINE(), account_id: getAccountId("1100"), description: "Sale proceeds receivable" },
        { ...EMPTY_LINE(), account_id: getAccountId("4000"), description: "Home sale revenue" },
      ]);
    } else if (type === "capitalized_interest") {
      setDescription("Capitalize construction loan interest to WIP");
      setLines([
        { ...EMPTY_LINE(), account_id: getAccountId("1220"), description: "Interest capitalized" },
        { ...EMPTY_LINE(), account_id: getAccountId("2110"), description: "Accrued interest — construction loan" },
      ]);
    } else if (type === "loan_draw") {
      setDescription("Construction loan draw — funded");
      setSelectedLoanId(null);
      setLines([
        { ...EMPTY_LINE(), account_id: getAccountId("1000"), description: "Draw proceeds deposited" },
        { ...EMPTY_LINE(), account_id: "", description: "Loan payable — select loan above to auto-fill" },
      ]);
    } else if (type === "loan_interest") {
      setDescription("Construction loan interest payment");
      setSelectedLoanId(null);
      setLines([
        { ...EMPTY_LINE(), account_id: getAccountId("1220"), description: "Interest capitalized to project" },
        { ...EMPTY_LINE(), account_id: getAccountId("1000"), description: "Cash — interest payment" },
      ]);
    } else {
      setLines([EMPTY_LINE(), EMPTY_LINE()]);
    }
  }

  async function loadLines(entryId: string) {
    const { data } = await supabase
      .from("journal_entry_lines")
      .select("id, account_id, account:chart_of_accounts(account_number, name), project_id, project:projects(name), cost_code_id, cost_code:cost_codes(code, description), description, debit, credit")
      .eq("journal_entry_id", entryId)
      .order("created_at");
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, lines: (data as unknown as JournalLine[]) ?? [] } : e))
    );
  }

  function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!entries.find((e) => e.id === id)?.lines) loadLines(id);
  }

  function addLine() { setLines((prev) => [...prev, EMPTY_LINE()]); }
  function removeLine(key: number) { setLines((prev) => prev.filter((l) => l._key !== key)); }

  function updateLine(key: number, field: keyof JournalLineInput, value: string | number | null) {
    setLines((prev) => prev.map((l) => {
      if (l._key !== key) return l;
      if (field === "debit" || field === "credit") {
        const num = parseFloat(String(value)) || 0;
        if (field === "debit"  && num > 0) return { ...l, debit: num, credit: 0 };
        if (field === "credit" && num > 0) return { ...l, credit: num, debit: 0 };
        return { ...l, [field]: num };
      }
      if (field === "project_id") {
        if (entryType === "home_closing") loadProjectWip(value as string);
        return { ...l, project_id: value as string | null };
      }
      // When changing account: clear cost_code_id if new account is not a WIP account
      if (field === "account_id") {
        const acct = accounts.find((a) => a.id === value);
        const keepCostCode = acct ? WIP_ACCOUNT_NUMBERS.has(acct.account_number) : false;
        return { ...l, account_id: value as string, cost_code_id: keepCostCode ? l.cost_code_id : null };
      }
      return { ...l, [field]: value };
    }));
  }

  function setAllProject(projectId: string | null) {
    setLines((prev) => prev.map((l) => ({ ...l, project_id: projectId })));
    if (entryType === "home_closing" && projectId) loadProjectWip(projectId);
    else setProjectWipBalance(null);
  }

  function handleLoanSelect(loanId: string | null) {
    setSelectedLoanId(loanId);
    if (!loanId) return;
    const loan = loans.find((l) => l.id === loanId);
    // Auto-set project on all lines
    if (loan?.project_id) setAllProject(loan.project_id);
    // Auto-fill the credit (liability) line with the loan's specific COA account
    if (loan?.coa_account_id) {
      setLines((prev) => {
        const updated = [...prev];
        if (updated.length >= 2) {
          updated[1] = { ...updated[1], account_id: loan.coa_account_id! };
        }
        return updated;
      });
    }
  }

  const totalDebits  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredits = lines.reduce((s, l) => s + l.credit, 0);
  const balanced     = Math.abs(totalDebits - totalCredits) < 0.01;

  function resetForm() {
    setEntryType("general");
    setEntryDate(new Date().toISOString().split("T")[0]);
    setReference("");
    setDescription("");
    setStatus("posted");
    setLines([EMPTY_LINE(), EMPTY_LINE()]);
    setFormError("");
    setProjectWipBalance(null);
    setSelectedLoanId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!description.trim()) { setFormError("Description is required."); return; }
    const filledLines = lines.filter((l) => l.account_id);
    if (filledLines.length < 2) { setFormError("At least 2 line items are required."); return; }
    if (!balanced) {
      setFormError(`Entry does not balance. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}`);
      return;
    }
    setSaving(true);
    try {
      const sourceType =
        entryType === "loan_draw"     ? "loan_draw" :
        entryType === "loan_interest" ? "loan_interest" :
        undefined;
      await createJournalEntry({
        entry_date:  entryDate,
        reference,
        description,
        status,
        loan_id:     selectedLoanId,
        source_type: sourceType,
        lines: filledLines.map((l) => ({ ...l, loan_id: selectedLoanId })),
      });
      setShowForm(false);
      resetForm();
      load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid(id: string) {
    await voidJournalEntry(id);
    load();
  }

  async function handleReverse(id: string) {
    const today = new Date().toISOString().split("T")[0];
    const dateInput = prompt("Reversal date (YYYY-MM-DD):", today);
    if (dateInput === null) return; // user cancelled
    const date = dateInput.trim() || today;
    try {
      await reverseJournalEntry(id, date);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setToastError("Reversal failed: " + msg);
    }
  }

  const statusBadge = (s: string) => {
    if (s === "posted") return <StatusBadge status="complete" size="sm">Posted</StatusBadge>;
    if (s === "draft")  return <StatusBadge status="warning" size="sm">Draft</StatusBadge>;
    return <StatusBadge status="planned" size="sm">Voided</StatusBadge>;
  };

  // Group accounts — relabeled COGS to deter incorrect usage during active construction
  const groupedAccounts = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    const label =
      a.type === "asset"     ? "Assets" :
      a.type === "liability" ? "Liabilities" :
      a.type === "equity"    ? "Equity" :
      a.type === "revenue"   ? "Revenue" :
      a.type === "cogs"      ? "Cost of Sales (Closing Entries Only)" :
                               "Operating Expenses (G&A)";
    if (!acc[label]) acc[label] = [];
    acc[label].push(a);
    return acc;
  }, {});

  // Cost codes by category for the dropdown
  const costCodesByCategory = costCodes.reduce<Record<string, CostCode[]>>((acc, cc) => {
    const label =
      cc.category === "land_development"  ? "Land Development" :
      cc.category === "home_construction" ? "Home Construction" :
                                            "G&A";
    if (!acc[label]) acc[label] = [];
    acc[label].push(cc);
    return acc;
  }, {});

  const showProjectControl = entryType !== "general";
  const showLoanControl    = entryType === "loan_draw" || entryType === "loan_interest";
  const sharedProject      = showProjectControl ? (lines[0]?.project_id ?? null) : null;

  // Cost code dropdown is shown on debit lines pointing at WIP/CIP/Land accounts
  function lineNeedsCostCode(line: JournalLineInput & { _key: number }) {
    if (line.debit <= 0) return false;
    const acct = accounts.find((a) => a.id === line.account_id);
    return acct ? WIP_ACCOUNT_NUMBERS.has(acct.account_number) : false;
  }

  // Helper: colSpan of "Add line" cell = columns before Debit/Credit/Delete
  // Columns: Account | [Project if !showProjectControl] | Cost Code | Memo
  const addLineColspan = showProjectControl ? 3 : 4;

  const wipBanner: Record<EntryType, React.ReactNode> = {
    general: null,
    wip_costs: (
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 mb-4">
        <Info size={14} className="flex-shrink-0 mt-0.5 text-blue-500" />
        <div>
          <strong>Construction WIP — during active construction only:</strong> DR <strong>1210 Construction WIP</strong> (not the 5xxx accounts — those are reserved for closings) · CR <strong>2000 AP</strong> for trade payables or <strong>1000 Cash</strong> for direct payments. Add a <strong>cost code</strong> to the debit line so this amount shows up in Job Cost reports.
        </div>
      </div>
    ),
    home_closing: (
      <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 mb-4">
        <Home size={14} className="flex-shrink-0 mt-0.5 text-green-500" />
        <div>
          <strong>Closing Entry — Two parts:</strong>
          <div className="mt-1 space-y-0.5">
            <div>① <strong>Transfer WIP:</strong> DR 5000 Cost of Sales · CR 1210 WIP (total project cost)</div>
            <div>② <strong>Record Sale:</strong> DR 1100 Accounts Receivable · CR 4000 Home Sales Revenue (contract price)</div>
          </div>
          {projectWipBalance !== null && (
            <div className="mt-2 px-2 py-1 bg-green-100 rounded text-green-800 font-medium">
              WIP balance for selected project: ${fmt(projectWipBalance)}
            </div>
          )}
        </div>
      </div>
    ),
    capitalized_interest: (
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 mb-4">
        <DollarSign size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
        <div>
          <strong>Capitalize — don&apos;t expense:</strong> DR <strong>1220 Capitalized Interest</strong> · CR <strong>2110 Accrued Interest</strong>. Keeps interest on the balance sheet as part of project cost until closing. Account 6710 is not used for active construction projects.
        </div>
      </div>
    ),
    loan_draw: (
      <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 mb-4">
        <Landmark size={14} className="flex-shrink-0 mt-0.5 text-indigo-500" />
        <div>
          <strong>Loan Draw:</strong> DR <strong>1000 Cash</strong> (draw proceeds deposited) · CR <strong>per-loan Loan Payable (220x)</strong>. Select the loan above — the project and liability account will auto-fill. Use this only to manually record a draw not processed through the Draw Requests workflow.
        </div>
      </div>
    ),
    loan_interest: (
      <div className="flex items-start gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700 mb-4">
        <Percent size={14} className="flex-shrink-0 mt-0.5 text-purple-500" />
        <div>
          <strong>Interest Payment:</strong> DR <strong>1220 Capitalized Interest</strong> · CR <strong>1000 Cash</strong>. Per GAAP, construction loan interest is capitalized during active construction — not expensed to 6710.
        </div>
      </div>
    ),
  };

  const inputCls  = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#4272EF] focus:ring-1 focus:ring-[#4272EF]";
  const selectCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#4272EF]";

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {toastError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{toastError}</span>
          <button
            type="button"
            onClick={() => setToastError(null)}
            className="text-red-400 hover:text-red-600"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <BookOpen size={15} />
          <span>{entries.length} entries</span>
        </div>
        <button
          onClick={() => { setShowForm(true); resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "#4272EF" }}
        >
          <Plus size={15} /> New Journal Entry
        </button>
      </div>

      {/* New Entry Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-gray-900 font-semibold text-base mb-4">New Journal Entry</h2>

          {/* Entry Type Selector */}
          <div className="mb-5">
            <label className="block text-xs text-gray-500 font-medium mb-2">Entry Type</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ENTRY_TYPES.map((et) => (
                <button
                  key={et.value}
                  type="button"
                  onClick={() => applyEntryType(et.value)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-colors ${
                    entryType === et.value
                      ? "border-[#4272EF] bg-blue-50 text-[#4272EF]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">{et.icon}{et.label}</span>
                  <span className="text-[10px] text-gray-400 leading-tight">{et.description}</span>
                </button>
              ))}
            </div>
          </div>

          {wipBanner[entryType]}

          <form onSubmit={handleSubmit}>
            {/* Header fields */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Date</label>
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Reference #</label>
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="JE-001" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as "draft" | "posted")} className={selectCls}>
                  <option value="posted">Posted</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
              {showLoanControl && (
                <div>
                  <label className="block text-xs text-gray-500 font-medium mb-1">Loan</label>
                  <select value={selectedLoanId ?? ""} onChange={(e) => handleLoanSelect(e.target.value || null)} className={selectCls}>
                    <option value="">— Select loan —</option>
                    {loans.map((l) => (
                      <option key={l.id} value={l.id}>#{l.loan_number} — {l.project?.name ?? "Unlinked"}</option>
                    ))}
                  </select>
                </div>
              )}
              {showProjectControl && (
                <div>
                  <label className="block text-xs text-gray-500 font-medium mb-1">Project (all lines)</label>
                  <select value={sharedProject ?? ""} onChange={(e) => setAllProject(e.target.value || null)} className={selectCls}>
                    <option value="">— Select project —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-2 md:col-span-4">
                <label className="block text-xs text-gray-500 font-medium mb-1">Description / Memo</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Record framing costs for Lot 14"
                  required
                  className={inputCls}
                />
              </div>
            </div>

            {/* Line items table */}
            <div className="overflow-x-auto mb-4 border border-gray-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-xs text-gray-500 font-medium px-3 py-2 w-64">Account</th>
                    {!showProjectControl && (
                      <th className="text-left text-xs text-gray-500 font-medium px-3 py-2 w-32">Project</th>
                    )}
                    <th className="text-left text-xs text-gray-500 font-medium px-3 py-2 w-44">
                      <span className="flex items-center gap-1"><Tag size={11} /> Cost Code</span>
                    </th>
                    <th className="text-left text-xs text-gray-500 font-medium px-3 py-2">Memo</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-3 py-2 w-28">Debit</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-3 py-2 w-28">Credit</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map((line) => {
                    const showCostCode = lineNeedsCostCode(line);
                    return (
                      <tr key={line._key} className="hover:bg-gray-50/50">
                        {/* Account */}
                        <td className="px-3 py-2">
                          <select
                            value={line.account_id}
                            onChange={(e) => updateLine(line._key, "account_id", e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#4272EF]"
                          >
                            <option value="">— Select account —</option>
                            {Object.entries(groupedAccounts).map(([group, accs]) => (
                              <optgroup key={group} label={group}>
                                {accs.map((a) => (
                                  <option key={a.id} value={a.id}>{a.account_number} · {a.name}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </td>
                        {/* Per-line project (general mode only) */}
                        {!showProjectControl && (
                          <td className="px-3 py-2">
                            <select
                              value={line.project_id ?? ""}
                              onChange={(e) => updateLine(line._key, "project_id", e.target.value || null)}
                              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#4272EF]"
                            >
                              <option value="">— None —</option>
                              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                        )}
                        {/* Cost code — shown only on WIP/CIP debit lines */}
                        <td className="px-3 py-2">
                          {showCostCode ? (
                            <select
                              value={line.cost_code_id ?? ""}
                              onChange={(e) => updateLine(line._key, "cost_code_id", e.target.value || null)}
                              className="w-full border border-[#4272EF]/40 rounded px-2 py-1.5 text-sm text-gray-900 bg-blue-50/40 focus:outline-none focus:border-[#4272EF]"
                            >
                              <option value="">— Optional —</option>
                              {Object.entries(costCodesByCategory).map(([cat, codes]) => (
                                <optgroup key={cat} label={cat}>
                                  {codes.map((cc) => (
                                    <option key={cc.id} value={cc.id}>{cc.code} · {cc.description}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-300 text-xs px-2">—</span>
                          )}
                        </td>
                        {/* Memo */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => updateLine(line._key, "description", e.target.value)}
                            placeholder="Optional"
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4272EF]"
                          />
                        </td>
                        {/* Debit */}
                        <td className="px-3 py-2">
                          <input
                            type="number" min="0" step="0.01"
                            value={line.debit || ""}
                            onChange={(e) => updateLine(line._key, "debit", e.target.value)}
                            placeholder="0.00"
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 text-right placeholder-gray-400 focus:outline-none focus:border-[#4272EF]"
                          />
                        </td>
                        {/* Credit */}
                        <td className="px-3 py-2">
                          <input
                            type="number" min="0" step="0.01"
                            value={line.credit || ""}
                            onChange={(e) => updateLine(line._key, "credit", e.target.value)}
                            placeholder="0.00"
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 text-right placeholder-gray-400 focus:outline-none focus:border-[#4272EF]"
                          />
                        </td>
                        {/* Delete */}
                        <td className="px-2">
                          <button
                            type="button"
                            onClick={() => removeLine(line._key)}
                            disabled={lines.length <= 2}
                            className="text-gray-300 hover:text-red-500 disabled:opacity-20 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-100">
                  <tr>
                    <td colSpan={addLineColspan} className="px-3 py-2">
                      <button type="button" onClick={addLine} className="text-[#4272EF] hover:underline text-xs font-medium">
                        + Add line
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-sm font-semibold ${balanced ? "text-gray-900" : "text-red-600"}`}>
                        ${totalDebits.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-sm font-semibold ${balanced ? "text-gray-900" : "text-red-600"}`}>
                        ${totalCredits.toFixed(2)}
                      </span>
                    </td>
                    <td></td>
                  </tr>
                  {!balanced && totalDebits > 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 pb-2">
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle size={11} /> Out of balance by ${Math.abs(totalDebits - totalCredits).toFixed(2)}
                        </p>
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            {formError && (
              <p className="text-red-600 text-sm mb-4 flex items-center gap-1">
                <AlertCircle size={14} /> {formError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !balanced}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#4272EF" }}
              >
                {saving ? "Saving…" : `Save ${status === "draft" ? "Draft" : "& Post"}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick reference cards */}
      {!showForm && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { icon: <HardHat size={13} />,    label: "Construction WIP",  color: "blue",   lines: ["DR 1210 WIP + Cost Code", "CR 2000 AP  or  1000 Cash"] },
            { icon: <Landmark size={13} />,   label: "Loan Draw",         color: "indigo", lines: ["DR 1000 Cash", "CR 220x Loan Payable (per loan)"] },
            { icon: <Percent size={13} />,    label: "Interest Payment",  color: "purple", lines: ["DR 1220 Cap. Interest", "CR 1000 Cash"] },
            { icon: <DollarSign size={13} />, label: "Cap. Interest",     color: "amber",  lines: ["DR 1220 Cap. Interest", "CR 2110 Accrued Int."] },
            { icon: <Home size={13} />,       label: "Home Closing",      color: "green",  lines: ["DR 5000 COGS · CR 1210 WIP", "DR 1100 A/R · CR 4000 Revenue"] },
          ].map((card) => (
            <div key={card.label} className={`px-4 py-3 rounded-lg border text-sm ${
              card.color === "blue"   ? "border-blue-200 bg-blue-50" :
              card.color === "indigo" ? "border-indigo-200 bg-indigo-50" :
              card.color === "purple" ? "border-purple-200 bg-purple-50" :
              card.color === "amber"  ? "border-amber-200 bg-amber-50" :
                                        "border-green-200 bg-green-50"
            }`}>
              <p className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${
                card.color === "blue"   ? "text-blue-700" :
                card.color === "indigo" ? "text-indigo-700" :
                card.color === "purple" ? "text-purple-700" :
                card.color === "amber"  ? "text-amber-700" : "text-green-700"
              }`}>{card.icon}{card.label}</p>
              {card.lines.map((l) => (
                <p key={l} className="text-[11px] text-gray-600 font-mono">{l}</p>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Entries list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <BookOpen size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No journal entries yet.</p>
          <p className="text-gray-400 text-xs mt-1">Click "New Journal Entry" to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
            <h2 className="text-sm font-semibold text-white">General Ledger — Journal Entries</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-8 px-4 py-2.5"></th>
                  <th className="text-left text-xs text-gray-400 font-medium px-2 py-2.5 w-28">Date</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-2 py-2.5 w-28">Reference</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-2 py-2.5">Description</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-2 py-2.5 w-24">Source</th>
                  <th className="text-right text-xs text-gray-400 font-medium px-2 py-2.5 w-32">Amount</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-2 py-2.5 w-24">Status</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${entry.status === "voided" ? "opacity-40" : ""}`}
                      onClick={() => toggleExpand(entry.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {expandedId === entry.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-2 py-3 text-gray-600 whitespace-nowrap text-xs">{entry.entry_date}</td>
                      <td className="px-2 py-3 text-gray-400 font-mono text-xs">{entry.reference ?? "—"}</td>
                      <td className="px-2 py-3 text-gray-800 font-medium">
                        {entry.description}
                        {entry.loan && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-medium">
                            <Landmark size={9} /> #{entry.loan.loan_number}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-gray-400 text-xs capitalize">{entry.source_type ?? "manual"}</td>
                      <td className="px-2 py-3 text-right text-gray-800 font-medium">${fmt(entry.total_debits)}</td>
                      <td className="px-2 py-3">{statusBadge(entry.status)}</td>
                      <td className="px-2 py-3">
                        {entry.status === "posted" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReverse(entry.id); }}
                            className="text-gray-300 hover:text-blue-500 p-1 transition-colors"
                            title="Create reversing entry"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                        {entry.status !== "voided" && entry.source_type === "manual" && (
                          <span onClick={(e) => e.stopPropagation()} className="inline-block">
                            <ConfirmButton
                              trigger={<Trash2 size={13} />}
                              ariaLabel="Void entry"
                              triggerClassName="text-gray-300 hover:text-red-500 p-1 transition-colors"
                              title="Void journal entry?"
                              body="This cannot be undone."
                              confirmLabel="Void"
                              onConfirm={() => handleVoid(entry.id)}
                            />
                          </span>
                        )}
                      </td>
                    </tr>
                    {expandedId === entry.id && entry.lines && (
                      <tr key={`${entry.id}-lines`}>
                        <td colSpan={8} className="px-10 pb-4 bg-gray-50/50">
                          <table className="w-full text-xs mt-2">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left text-gray-400 font-medium pb-1.5 pr-4">Account</th>
                                <th className="text-left text-gray-400 font-medium pb-1.5 pr-4">Project</th>
                                <th className="text-left text-gray-400 font-medium pb-1.5 pr-4">Cost Code</th>
                                <th className="text-left text-gray-400 font-medium pb-1.5 pr-4">Memo</th>
                                <th className="text-right text-gray-400 font-medium pb-1.5 pr-4">Debit</th>
                                <th className="text-right text-gray-400 font-medium pb-1.5">Credit</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {entry.lines.map((line) => (
                                <tr key={line.id}>
                                  <td className="py-1.5 pr-4 text-gray-700">{line.account.account_number} · {line.account.name}</td>
                                  <td className="py-1.5 pr-4 text-gray-400">{line.project?.name ?? "—"}</td>
                                  <td className="py-1.5 pr-4 text-gray-400">
                                    {line.cost_code ? `${line.cost_code.code} · ${line.cost_code.description}` : "—"}
                                  </td>
                                  <td className="py-1.5 pr-4 text-gray-400">{line.description ?? "—"}</td>
                                  <td className="py-1.5 pr-4 text-right text-gray-700">
                                    {line.debit > 0 ? `$${fmt(Number(line.debit))}` : ""}
                                  </td>
                                  <td className="py-1.5 text-right text-gray-700">
                                    {line.credit > 0 ? `$${fmt(Number(line.credit))}` : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-gray-200">
                                <td colSpan={4} className="pt-2 text-gray-500 font-medium">Total</td>
                                <td className="pt-2 text-right text-gray-900 font-semibold pr-4">
                                  ${fmt(entry.lines.reduce((s, l) => s + Number(l.debit), 0))}
                                </td>
                                <td className="pt-2 text-right text-gray-900 font-semibold">
                                  ${fmt(entry.lines.reduce((s, l) => s + Number(l.credit), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
