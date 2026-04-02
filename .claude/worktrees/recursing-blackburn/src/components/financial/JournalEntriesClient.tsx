// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, BookOpen, Trash2, ChevronDown, ChevronRight, AlertCircle, Info, HardHat, Home, DollarSign } from "lucide-react";
import { createJournalEntry, voidJournalEntry, type JournalLineInput } from "@/app/actions/journal-entries";

type Account = { id: string; account_number: string; name: string; type: string; subtype: string | null };
type Project = { id: string; name: string };

type JournalLine = {
  id: string;
  account_id: string;
  account: { account_number: string; name: string };
  project_id: string | null;
  project: { name: string } | null;
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
  created_at: string;
  total_debits: number;
  lines?: JournalLine[];
};

type EntryType = "general" | "wip_costs" | "home_closing" | "capitalized_interest";

const EMPTY_LINE = (): JournalLineInput & { _key: number } => ({
  _key: Date.now() + Math.random(),
  account_id: "",
  project_id: null,
  description: "",
  debit: 0,
  credit: 0,
});

const ENTRY_TYPES: { value: EntryType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "general",              label: "General",              icon: <BookOpen size={13} />,   description: "Adjustments, contributions, corrections" },
  { value: "wip_costs",           label: "Construction WIP",     icon: <HardHat size={13} />,    description: "Capitalize costs to balance sheet" },
  { value: "home_closing",        label: "Home Closing",         icon: <Home size={13} />,       description: "Transfer WIP to COGS + record sale" },
  { value: "capitalized_interest",label: "Capitalized Interest", icon: <DollarSign size={13} />, description: "Capitalize loan interest to WIP" },
];

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function JournalEntriesClient() {
  const supabase = createClient();
  const [entries, setEntries]     = useState<JournalEntry[]>([]);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  // Form state
  const [entryType, setEntryType] = useState<EntryType>("general");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus]       = useState<"draft" | "posted">("posted");
  const [lines, setLines]         = useState<(JournalLineInput & { _key: number })[]>([EMPTY_LINE(), EMPTY_LINE()]);
  const [projectWipBalance, setProjectWipBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: entriesData }, { data: accsData }, { data: projData }] = await Promise.all([
      supabase.from("journal_entries").select("id, entry_date, reference, description, status, source_type, created_at").order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("chart_of_accounts").select("id, account_number, name, type, subtype").eq("is_active", true).order("account_number"),
      supabase.from("projects").select("id, name").order("name"),
    ]);
    const enriched: JournalEntry[] = [];
    for (const e of entriesData ?? []) {
      const { data: lineData } = await supabase.from("journal_entry_lines").select("debit").eq("journal_entry_id", e.id);
      const total = (lineData ?? []).reduce((s: number, l: { debit: number }) => s + Number(l.debit), 0);
      enriched.push({ ...e, total_debits: total });
    }
    setEntries(enriched);
    setAccounts(accsData ?? []);
    setProjects(projData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadProjectWip(projectId: string) {
    if (!projectId) { setProjectWipBalance(null); return; }
    const wipAcct = accounts.find((a) => a.account_number === "1210");
    if (!wipAcct) { setProjectWipBalance(null); return; }
    const { data } = await supabase
      .from("journal_entry_lines")
      .select("debit, credit, journal_entry:journal_entries(status)")
      .eq("account_id", wipAcct.id)
      .eq("project_id", projectId);
    const posted = (data ?? []).filter((l: any) => l.journal_entry?.status === "posted");
    const balance = posted.reduce((s: number, l: any) => s + Number(l.debit) - Number(l.credit), 0);
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
    } else {
      setLines([EMPTY_LINE(), EMPTY_LINE()]);
    }
  }

  async function loadLines(entryId: string) {
    const { data } = await supabase
      .from("journal_entry_lines")
      .select("id, account_id, account:chart_of_accounts(account_number, name), project_id, project:projects(name), description, debit, credit")
      .eq("journal_entry_id", entryId)
      .order("created_at");
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, lines: (data as unknown as JournalLine[]) ?? [] } : e)));
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
        if (field === "debit" && num > 0) return { ...l, debit: num, credit: 0 };
        if (field === "credit" && num > 0) return { ...l, credit: num, debit: 0 };
        return { ...l, [field]: num };
      }
      if (field === "project_id") {
        if (entryType === "home_closing") loadProjectWip(value as string);
        return { ...l, project_id: value as string | null };
      }
      return { ...l, [field]: value };
    }));
  }

  function setAllProject(projectId: string | null) {
    setLines((prev) => prev.map((l) => ({ ...l, project_id: projectId })));
    if (entryType === "home_closing" && projectId) loadProjectWip(projectId);
    else setProjectWipBalance(null);
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!description.trim()) { setFormError("Description is required."); return; }
    const filledLines = lines.filter((l) => l.account_id);
    if (filledLines.length < 2) { setFormError("At least 2 line items are required."); return; }
    if (!balanced) { setFormError(`Entry does not balance. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}`); return; }
    setSaving(true);
    try {
      await createJournalEntry({ entry_date: entryDate, reference, description, status, lines: filledLines });
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
    if (!confirm("Void this journal entry? This cannot be undone.")) return;
    await voidJournalEntry(id);
    load();
  }

  const statusBadge = (s: string) => {
    if (s === "posted") return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Posted</span>;
    if (s === "draft")  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Draft</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Voided</span>;
  };

  const groupedAccounts = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    const label = a.type === "asset" ? "Assets" : a.type === "liability" ? "Liabilities" : a.type === "equity" ? "Equity" : a.type === "revenue" ? "Revenue" : a.type === "cogs" ? "Cost of Goods Sold" : "Operating Expenses";
    if (!acc[label]) acc[label] = [];
    acc[label].push(a);
    return acc;
  }, {});

  const showProjectControl = entryType !== "general";
  const sharedProject = showProjectControl ? (lines[0]?.project_id ?? null) : null;

  const wipBanner: Record<EntryType, React.ReactNode> = {
    general: null,
    wip_costs: (
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 mb-4">
        <Info size={14} className="flex-shrink-0 mt-0.5 text-blue-500" />
        <div>
          <strong>WIP Routing:</strong> Debit <strong>1210 Construction WIP</strong> (not 5xxx COGS) during active projects. Credit <strong>2000 Accounts Payable</strong> for unpaid invoices or <strong>1000 Cash</strong> for direct payments. COGS accounts are only used at closing.
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
            <div>② <strong>Record Sale:</strong> DR 1100 Accounts Receivable · CR 4000 Home Sales Revenue (sale price)</div>
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
  };

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#4272EF] focus:ring-1 focus:ring-[#4272EF]";
  const selectCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#4272EF]";

  return (
    <div className="max-w-6xl mx-auto space-y-4">
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

          {/* Entry Type */}
          <div className="mb-5">
            <label className="block text-xs text-gray-500 font-medium mb-2">Entry Type</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Record framing costs for Lot 14" required className={inputCls} />
              </div>
            </div>

            {/* Line items */}
            <div className="overflow-x-auto mb-4 border border-gray-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-xs text-gray-500 font-medium px-3 py-2 w-72">Account</th>
                    {!showProjectControl && <th className="text-left text-xs text-gray-500 font-medium px-3 py-2 w-36">Project</th>}
                    <th className="text-left text-xs text-gray-500 font-medium px-3 py-2">Memo</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-3 py-2 w-32">Debit</th>
                    <th className="text-right text-xs text-gray-500 font-medium px-3 py-2 w-32">Credit</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lines.map((line) => (
                    <tr key={line._key} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2">
                        <select value={line.account_id} onChange={(e) => updateLine(line._key, "account_id", e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#4272EF]">
                          <option value="">— Select account —</option>
                          {Object.entries(groupedAccounts).map(([group, accs]) => (
                            <optgroup key={group} label={group}>
                              {accs.map((a) => <option key={a.id} value={a.id}>{a.account_number} · {a.name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      {!showProjectControl && (
                        <td className="px-3 py-2">
                          <select value={line.project_id ?? ""} onChange={(e) => updateLine(line._key, "project_id", e.target.value || null)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-[#4272EF]">
                            <option value="">— None —</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <input type="text" value={line.description} onChange={(e) => updateLine(line._key, "description", e.target.value)} placeholder="Optional" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#4272EF]" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={line.debit || ""} onChange={(e) => updateLine(line._key, "debit", e.target.value)} placeholder="0.00" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 text-right placeholder-gray-400 focus:outline-none focus:border-[#4272EF]" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={line.credit || ""} onChange={(e) => updateLine(line._key, "credit", e.target.value)} placeholder="0.00" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-900 text-right placeholder-gray-400 focus:outline-none focus:border-[#4272EF]" />
                      </td>
                      <td className="px-2">
                        <button type="button" onClick={() => removeLine(line._key)} disabled={lines.length <= 2} className="text-gray-300 hover:text-red-500 disabled:opacity-20 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-100">
                  <tr>
                    <td colSpan={showProjectControl ? 2 : 3} className="px-3 py-2">
                      <button type="button" onClick={addLine} className="text-[#4272EF] hover:underline text-xs font-medium">+ Add line</button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-sm font-semibold ${balanced ? "text-gray-900" : "text-red-600"}`}>${totalDebits.toFixed(2)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-sm font-semibold ${balanced ? "text-gray-900" : "text-red-600"}`}>${totalCredits.toFixed(2)}</span>
                    </td>
                    <td></td>
                  </tr>
                  {!balanced && totalDebits > 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 pb-2">
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
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button type="submit" disabled={saving || !balanced} className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>
                {saving ? "Saving…" : `Save ${status === "draft" ? "Draft" : "& Post"}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WIP reference cards */}
      {!showForm && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <HardHat size={13} />, label: "During Construction", color: "blue",  lines: ["DR 1210 WIP", "CR 2000 Accounts Payable"] },
            { icon: <DollarSign size={13} />, label: "Loan Interest",    color: "amber", lines: ["DR 1220 Capitalized Interest", "CR 2110 Accrued Interest"] },
            { icon: <Home size={13} />,    label: "At Home Closing",     color: "green", lines: ["DR 5000 Cost of Sales  ·  CR 1210 WIP", "DR 1100 A/R  ·  CR 4000 Revenue"] },
          ].map((card) => (
            <div key={card.label} className={`px-4 py-3 rounded-lg border text-sm ${
              card.color === "blue"  ? "border-blue-200 bg-blue-50" :
              card.color === "amber" ? "border-amber-200 bg-amber-50" :
                                       "border-green-200 bg-green-50"
            }`}>
              <p className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${
                card.color === "blue"  ? "text-blue-700" :
                card.color === "amber" ? "text-amber-700" : "text-green-700"
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
                <>
                  <tr
                    key={entry.id}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${entry.status === "voided" ? "opacity-40" : ""}`}
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <td className="px-4 py-3 text-gray-400">{expandedId === entry.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="px-2 py-3 text-gray-600 whitespace-nowrap text-xs">{entry.entry_date}</td>
                    <td className="px-2 py-3 text-gray-400 font-mono text-xs">{entry.reference ?? "—"}</td>
                    <td className="px-2 py-3 text-gray-800 font-medium">{entry.description}</td>
                    <td className="px-2 py-3 text-gray-400 text-xs capitalize">{entry.source_type ?? "manual"}</td>
                    <td className="px-2 py-3 text-right text-gray-800 font-medium">${fmt(entry.total_debits)}</td>
                    <td className="px-2 py-3">{statusBadge(entry.status)}</td>
                    <td className="px-2 py-3">
                      {entry.status !== "voided" && entry.source_type === "manual" && (
                        <button onClick={(e) => { e.stopPropagation(); handleVoid(entry.id); }} className="text-gray-300 hover:text-red-500 p-1 transition-colors" title="Void entry">
                          <Trash2 size={13} />
                        </button>
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
                                <td className="py-1.5 pr-4 text-gray-400">{line.description ?? "—"}</td>
                                <td className="py-1.5 pr-4 text-right text-gray-700">{line.debit > 0 ? `$${fmt(Number(line.debit))}` : ""}</td>
                                <td className="py-1.5 text-right text-gray-700">{line.credit > 0 ? `$${fmt(Number(line.credit))}` : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-200">
                              <td colSpan={3} className="pt-2 text-gray-500 font-medium">Total</td>
                              <td className="pt-2 text-right text-gray-900 font-semibold pr-4">${fmt(entry.lines.reduce((s, l) => s + Number(l.debit), 0))}</td>
                              <td className="pt-2 text-right text-gray-900 font-semibold">${fmt(entry.lines.reduce((s, l) => s + Number(l.credit), 0))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </