import { useState, useEffect, useRef } from "react";
import {
  Home, HardHat, Plus, DollarSign, Menu, Bell, Search, ChevronRight,
  ChevronLeft, ArrowLeft, FileText, ClipboardList, Camera, MapPin,
  Calendar, Hammer, TreePine, AlertTriangle, TrendingUp, X, Check,
  Clock, Building2, BarChart2, Users, Truck, Folder, BookOpen, Banknote,
  Receipt, LogOut, Settings, Filter, MoreHorizontal, ChevronDown,
  CircleDot, Layers, Eye, Download, Milestone
} from "lucide-react";

// ─── Sample Data ───────────────────────────────────────────────────────────────
const PROJECTS = [
  { id: 1, name: "Lot 12 — The Oakmont", address: "1847 Prairie Wind Dr", subdivision: "Prairie Sky Estates", type: "home", status: "active", block: "B", lot: "12", plan: "Oakmont", sqft: 2450, stage: "Framing — Exterior Walls", stageNum: 12, progress: 35, budget: 285000, spent: 102400, todos: 3, daysUnder: 47,
    extStages: [
      { name: "Flatwork", status: "complete" }, { name: "Framing — Ext Walls", status: "in_progress" },
      { name: "Roof Trusses", status: "not_started" }, { name: "Roofing", status: "not_started", date: "3/9" },
    ],
    intStages: [
      { name: "Underslab Plumbing", status: "complete" }, { name: "Electrical Rough", status: "not_started" },
      { name: "Plumbing Rough", status: "not_started" }, { name: "HVAC Rough", status: "not_started", date: "3/12" },
    ],
    delayedCount: 0,
  },
  { id: 2, name: "Lot 15 — The Winslow", address: "1853 Prairie Wind Dr", subdivision: "Prairie Sky Estates", type: "home", status: "active", block: "B", lot: "15", plan: "Winslow", sqft: 1890, stage: "Foundation — Poured Walls", stageNum: 6, progress: 15, budget: 242000, spent: 38200, todos: 1, daysUnder: 18,
    extStages: [
      { name: "Excavation", status: "complete" }, { name: "Footings", status: "complete" },
      { name: "Foundation Walls", status: "in_progress" }, { name: "Waterproofing", status: "not_started", date: "2/15" },
    ],
    intStages: [
      { name: "Underslab Plumbing", status: "not_started" }, { name: "Electrical Rough", status: "not_started", date: "3/20" },
    ],
    delayedCount: 0,
  },
  { id: 3, name: "Lot 8 — The Ridgeview", address: "1835 Prairie Wind Dr", subdivision: "Prairie Sky Estates", type: "home", status: "active", block: "A", lot: "8", plan: "Ridgeview", sqft: 3100, stage: "Interior Trim — Doors", stageNum: 38, progress: 72, budget: 365000, spent: 271800, todos: 5, daysUnder: 112,
    extStages: [
      { name: "Flatwork — Driveway", status: "complete" }, { name: "Final Grade", status: "in_progress" },
      { name: "Landscape/Irrigation", status: "not_started", date: "2/23" },
    ],
    intStages: [
      { name: "Construction Clean", status: "complete" }, { name: "Paint & Tile", status: "complete" },
      { name: "Electrical — Final", status: "in_progress" }, { name: "Flooring Install", status: "not_started", date: "2/25" },
    ],
    delayedCount: 15,
  },
  { id: 4, name: "Whitetail Ridge Phase 1", address: "County Road 14 & Elm", subdivision: null, type: "land", status: "active", acres: 42, lots: 28, lotsSold: 11, stage: "Rough Grading", stageNum: 4, progress: 22, budget: 890000, spent: 198400, todos: 2, daysUnder: 63,
    extStages: [
      { name: "Site Clearing", status: "complete" }, { name: "Rough Grading", status: "in_progress" },
      { name: "Storm Sewer", status: "not_started" }, { name: "Sanitary Sewer", status: "not_started", date: "3/15" },
    ],
    intStages: [],
    delayedCount: 0,
  },
];

const INVOICES = [
  { id: 1, vendor: "Midwest Concrete LLC", amount: 14250, project: "Lot 12 — The Oakmont", costCode: "Foundation", status: "pending_review", dueDate: "Apr 15", confidence: "high" },
  { id: 2, vendor: "Prestige Lumber Co", amount: 28400, project: "Lot 12 — The Oakmont", costCode: "Framing", status: "approved", dueDate: "Apr 18", confidence: "high" },
  { id: 3, vendor: "Henderson Electric", amount: 6800, project: "Lot 8 — The Ridgeview", costCode: "Electrical Rough", status: "pending_review", dueDate: "Apr 12", confidence: "medium" },
  { id: 4, vendor: "ABC Plumbing", amount: 9200, project: "Lot 15 — The Winslow", costCode: "Plumbing Rough", status: "approved", dueDate: "Apr 20", confidence: "high" },
  { id: 5, vendor: "Prairie Excavation", amount: 42000, project: "Whitetail Ridge Phase 1", costCode: "Rough Grading", status: "released", dueDate: "Apr 8", confidence: "high" },
  { id: 6, vendor: "Tri-County Inspections", amount: 450, project: "Lot 8 — The Ridgeview", costCode: "Permits & Inspections", status: "cleared", dueDate: "Apr 5", confidence: "high" },
];

const STAGES_LOT12 = [
  { num: 1, name: "Permit & Stake", status: "complete", track: "exterior", days: "Jan 2–8" },
  { num: 2, name: "Excavation", status: "complete", track: "exterior", days: "Jan 9–13" },
  { num: 3, name: "Footings", status: "complete", track: "exterior", days: "Jan 14–18" },
  { num: 4, name: "Foundation Walls", status: "complete", track: "exterior", days: "Jan 19–26" },
  { num: 5, name: "Waterproofing", status: "complete", track: "exterior", days: "Jan 27–29" },
  { num: 6, name: "Backfill", status: "complete", track: "exterior", days: "Jan 30–Feb 1" },
  { num: 7, name: "Flatwork — Basement", status: "complete", track: "exterior", days: "Feb 2–5" },
  { num: 8, name: "Underslab Plumbing", status: "complete", track: "interior", days: "Feb 2–4" },
  { num: 9, name: "Framing — Subfloor", status: "complete", track: "exterior", days: "Feb 6–8" },
  { num: 10, name: "Framing — Walls 1st", status: "complete", track: "exterior", days: "Feb 9–15" },
  { num: 11, name: "Framing — Walls 2nd", status: "complete", track: "exterior", days: "Feb 16–20" },
  { num: 12, name: "Framing — Ext Walls", status: "in_progress", track: "exterior", days: "Feb 21–28" },
  { num: 13, name: "Roof Trusses", status: "not_started", track: "exterior", days: "Mar 1–5" },
  { num: 14, name: "Roof Decking", status: "not_started", track: "exterior", days: "Mar 6–8" },
  { num: 15, name: "Roofing", status: "not_started", track: "exterior", days: "Mar 9–13" },
  { num: 16, name: "Windows & Doors", status: "not_started", track: "exterior", days: "Mar 14–16" },
  { num: 17, name: "Electrical Rough", status: "not_started", track: "interior", days: "Mar 5–11" },
  { num: 18, name: "Plumbing Rough", status: "not_started", track: "interior", days: "Mar 5–11" },
  { num: 19, name: "HVAC Rough", status: "not_started", track: "interior", days: "Mar 12–16" },
  { num: 20, name: "Insulation", status: "not_started", track: "interior", days: "Mar 17–19" },
];

const ALERTS = [
  { type: "invoice", msg: "3 invoices pending review", color: "amber", icon: "file" },
  { type: "overdue", msg: "1 invoice past due", color: "red", icon: "alert" },
  { type: "vendor", msg: "Henderson Electric COI expires in 12 days", color: "amber", icon: "truck" },
  { type: "budget", msg: "Lot 8 — Ridgeview is 4% over budget", color: "amber", icon: "trending" },
];

const THIS_WEEK = [
  { type: "stage", text: "Framing — Ext Walls completes", project: "Lot 12 — Oakmont", date: "Apr 14", badge: "Completing", badgeColor: "green" },
  { type: "stage", text: "Roof Trusses starts", project: "Lot 12 — Oakmont", date: "Apr 15", badge: "Starting", badgeColor: "blue" },
  { type: "invoice", text: "Midwest Concrete — $14,250 due", project: "Lot 12 — Oakmont", date: "Apr 15", badge: "Due", badgeColor: "amber" },
  { type: "todo", text: "Confirm window order with supplier", project: "Lot 12 — Oakmont", date: "Apr 16", badge: "To-Do", badgeColor: "purple" },
  { type: "stage", text: "Rough Grading continues", project: "Whitetail Ridge", date: "Apr 17", badge: "In Progress", badgeColor: "blue" },
];

// ─── Utility Components ────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function ProgressRing({ progress, size = 44, strokeWidth = 4, className = "" }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  const color = progress >= 70 ? "#10B981" : progress >= 40 ? "#4272EF" : "#F59E0B";
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color, fontVariantNumeric: "tabular-nums" }}>{progress}%</span>
    </div>
  );
}

function BudgetBar({ spent, budget }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 110) : 0;
  const over = spent > budget && budget > 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span className="text-slate-500">{fmt(spent)} spent</span>
        <span className={over ? "text-red-500 font-semibold" : "text-slate-400"}>{fmt(budget)}</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: over ? "#EF4444" : pct > 85 ? "#F59E0B" : "#4272EF" }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    complete: "bg-emerald-100 text-emerald-700",
    in_progress: "bg-blue-100 text-blue-700",
    not_started: "bg-slate-100 text-slate-500",
    delayed: "bg-orange-100 text-orange-700",
    pending_review: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700",
    released: "bg-purple-100 text-purple-700",
    cleared: "bg-emerald-100 text-emerald-700",
    active: "bg-blue-100 text-blue-700",
  };
  const labels = {
    complete: "Complete", in_progress: "In Progress", not_started: "Not Started",
    delayed: "Delayed", pending_review: "Pending Review", approved: "Approved",
    released: "Released", cleared: "Cleared", active: "Active",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || "bg-slate-100 text-slate-500"}`}>
      {labels[status] || status}
    </span>
  );
}

// ─── Stage Track Strip (like current UI) ────────────────────────────────────────

function StageStripItem({ stage, isLast }) {
  const color = stage.status === "complete" ? "text-green-600" :
                stage.status === "in_progress" ? "text-blue-600" :
                stage.status === "delayed" ? "text-red-600" : "text-slate-400";
  const icon = stage.status === "complete" ? "✓" :
               stage.status === "in_progress" ? "●" :
               "›";
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      <span className={`text-xs font-bold ${color}`}>{icon}</span>
      <span className={`text-xs whitespace-nowrap ${stage.status === "not_started" ? "text-slate-400" : color} ${stage.status === "in_progress" ? "font-semibold" : ""}`}>
        {stage.name}
      </span>
      {stage.date && <span className="text-xs text-slate-300 ml-0.5">({stage.date})</span>}
      {!isLast && <span className="text-slate-300 mx-0.5">›</span>}
    </span>
  );
}

function StageStrip({ extStages, intStages, delayedCount, compact = false }) {
  if (!extStages || extStages.length === 0) return null;
  return (
    <div className={`${compact ? "text-[10px]" : "text-xs"}`}>
      {delayedCount > 0 && (
        <div className="flex items-center gap-1 mb-1">
          <AlertTriangle size={11} className="text-amber-500" />
          <span className="text-amber-600 font-semibold text-xs">{delayedCount} delayed</span>
        </div>
      )}
      <div className="flex items-center gap-1 mb-0.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 w-6">EXT</span>
        <div className="flex items-center gap-0 flex-wrap">
          {extStages.map((s, i) => <StageStripItem key={i} stage={s} isLast={i === extStages.length - 1} />)}
        </div>
      </div>
      {intStages && intStages.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 w-6">INT</span>
          <div className="flex items-center gap-0 flex-wrap">
            {intStages.map((s, i) => <StageStripItem key={i} stage={s} isLast={i === intStages.length - 1} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mobile Bottom Tab Bar ──────────────────────────────────────────────────────

function BottomTabBar({ active, onNavigate, onFab }) {
  const tabs = [
    { key: "home", label: "Home", Icon: Home },
    { key: "projects", label: "Projects", Icon: HardHat },
    { key: "fab", label: "", Icon: Plus },
    { key: "money", label: "Money", Icon: DollarSign },
    { key: "more", label: "More", Icon: Menu },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 px-2 pb-5 pt-1.5" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
      <div className="flex items-end justify-around max-w-lg mx-auto">
        {tabs.map(({ key, label, Icon }) => {
          if (key === "fab") {
            return (
              <button key={key} onClick={onFab} className="relative -mt-5 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 active:scale-95 transition-transform">
                  <Plus size={26} color="white" strokeWidth={2.5} />
                </div>
              </button>
            );
          }
          const isActive = active === key;
          return (
            <button key={key} onClick={() => onNavigate(key)} className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-0">
              <Icon size={22} className={isActive ? "text-blue-600" : "text-slate-400"} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className={`text-xs ${isActive ? "text-blue-600 font-semibold" : "text-slate-400"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Desktop Icon Rail + Flyout ─────────────────────────────────────────────────

function DesktopNav({ active, onNavigate }) {
  const [flyout, setFlyout] = useState(null);
  const sections = [
    { key: "home", label: "Dashboard", Icon: Home },
    { key: "projects", label: "Projects", Icon: Building2, children: [
      { key: "projects", label: "All Projects" },
      { key: "project-stages", label: "Stage Progress" },
      { key: "project-gantt", label: "Gantt Report" },
      { key: "project-cost", label: "Job Cost" },
      { key: "project-budget", label: "Budget Variance" },
    ]},
    { key: "money", label: "Financial", Icon: DollarSign, children: [
      { key: "invoices", label: "Accounts Payable" },
      { key: "journal", label: "Journal Entries" },
      { key: "banking", label: "Bank Accounts" },
      { key: "loans", label: "Loans" },
      { key: "draws", label: "Draw Requests" },
      { key: "reports-divider", label: "───── Reports ─────", divider: true },
      { key: "fin-summary", label: "Summary" },
      { key: "fin-income", label: "Income Statement" },
      { key: "fin-balance", label: "Balance Sheet" },
      { key: "fin-cashflow", label: "Cash Flow" },
      { key: "fin-aging", label: "AP Aging" },
      { key: "fin-wip", label: "WIP Report" },
    ]},
    { key: "more", label: "Manage", Icon: Layers, children: [
      { key: "vendors", label: "Vendors" },
      { key: "contacts", label: "Contacts" },
      { key: "documents", label: "Documents" },
    ]},
  ];

  return (
    <div className="flex h-screen" onMouseLeave={() => setFlyout(null)}>
      {/* Icon Rail */}
      <div className="w-16 bg-slate-900 flex flex-col items-center py-4 gap-1 z-30 shrink-0">
        {/* Logo */}
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
          <span className="text-white font-bold text-sm">BF</span>
        </div>

        {sections.map(({ key, label, Icon, children }) => {
          const isActive = active === key || (children && children.some(c => c.key === active));
          return (
            <button
              key={key}
              onClick={() => { if (!children) onNavigate(key); else setFlyout(flyout === key ? null : key); }}
              onMouseEnter={() => { if (children) setFlyout(key); }}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? "bg-blue-600/20 text-blue-400" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="text-[9px] font-medium leading-tight">{label}</span>
            </button>
          );
        })}

        <div className="flex-1" />

        {/* User */}
        <button className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">JS</button>
      </div>

      {/* Flyout */}
      {flyout && (
        <div className="w-64 bg-slate-800 border-r border-slate-700 py-4 px-3 z-20 shrink-0" onMouseEnter={() => {}} onMouseLeave={() => setFlyout(null)}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">
            {sections.find(s => s.key === flyout)?.label}
          </h3>
          <div className="space-y-0.5">
            {sections.find(s => s.key === flyout)?.children?.map(child => {
              if (child.divider) return <div key={child.key} className="text-xs text-slate-600 px-3 py-2 font-medium">{child.label}</div>;
              const isActive = active === child.key;
              return (
                <button key={child.key} onClick={() => { onNavigate(child.key); setFlyout(null); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? "bg-blue-600/20 text-blue-400 font-medium" : "text-slate-300 hover:text-white hover:bg-white/5"}`}>
                  {child.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quick Action Sheet (FAB expanded) ──────────────────────────────────────────

function QuickActionSheet({ onClose }) {
  const actions = [
    { icon: ClipboardList, label: "Field Log", desc: "Log site activity", color: "bg-blue-500" },
    { icon: Camera, label: "Snap Invoice", desc: "Photograph & process", color: "bg-emerald-500" },
    { icon: Check, label: "New To-Do", desc: "Create a task", color: "bg-purple-500" },
    { icon: FileText, label: "Quick Note", desc: "Add to current project", color: "bg-amber-500" },
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl px-5 pt-3 pb-8 z-10" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          {actions.map(({ icon: Icon, label, desc, color }) => (
            <button key={label} onClick={onClose} className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 active:scale-98 transition-all text-left">
              <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center shrink-0`}>
                <Icon size={20} color="white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Dashboard ──────────────────────────────────────────────────────────

function MobileDashboard({ onProjectTap }) {
  const [alertExpanded, setAlertExpanded] = useState(false);
  return (
    <div className="pb-24">
      {/* Greeting */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <p className="text-sm text-slate-500">Good morning</p>
          <h1 className="text-2xl font-bold text-slate-900">Jon</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <Bell size={20} className="text-slate-600" />
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">4</span>
          </button>
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">JS</div>
        </div>
      </div>

      {/* Alert Banner */}
      <div className="px-4 mb-4">
        <button onClick={() => setAlertExpanded(!alertExpanded)} className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-amber-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-amber-800">{ALERTS.length} items need attention</p>
            <p className="text-xs text-amber-600">3 invoices · 1 past due · 1 COI expiring</p>
          </div>
          <ChevronDown size={18} className={`text-amber-400 transition-transform ${alertExpanded ? "rotate-180" : ""}`} />
        </button>
        {alertExpanded && (
          <div className="mt-2 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {ALERTS.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${a.color === "red" ? "bg-red-500" : "bg-amber-500"}`} />
                <span className="text-sm text-slate-700 flex-1">{a.msg}</span>
                <ChevronRight size={14} className="text-slate-300" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Project Carousel */}
      <div className="mb-5">
        <div className="flex items-center justify-between px-5 mb-3">
          <h2 className="text-base font-bold text-slate-900">Active Projects</h2>
          <button className="text-sm font-medium text-blue-600">View all</button>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
          {PROJECTS.map(p => (
            <button key={p.id} onClick={() => onProjectTap(p)} className="snap-start shrink-0 w-72 bg-white border border-slate-200 rounded-xl p-4 text-left shadow-sm active:scale-98 transition-transform">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {p.type === "home" ? <HardHat size={13} className="text-blue-500 shrink-0" /> : <TreePine size={13} className="text-emerald-500 shrink-0" />}
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">{p.subdivision || "Land Dev"}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 truncate">{p.name}</h3>
                  <p className="text-xs text-slate-400 truncate">{p.address}</p>
                </div>
                <ProgressRing progress={p.progress} size={48} strokeWidth={4} />
              </div>
              {/* Stage Strip — the two-track EXT/INT view */}
              <div className="mb-3 py-2 px-2 bg-slate-50 rounded-lg">
                <StageStrip extStages={p.extStages} intStages={p.intStages} delayedCount={p.delayedCount} compact />
              </div>
              <BudgetBar spent={p.spent} budget={p.budget} />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">{p.daysUnder} days</span>
                {p.todos > 0 && <span className="text-xs font-medium text-amber-600">{p.todos} to-dos</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mb-5">
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: ClipboardList, label: "Field Log", color: "text-blue-600", bg: "bg-blue-50" },
            { icon: Camera, label: "Invoice", color: "text-emerald-600", bg: "bg-emerald-50" },
            { icon: Check, label: "To-Do", color: "text-purple-600", bg: "bg-purple-50" },
            { icon: Banknote, label: "Draws", color: "text-amber-600", bg: "bg-amber-50" },
          ].map(({ icon: Icon, label, color, bg }) => (
            <button key={label} className={`${bg} rounded-xl py-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform`}>
              <Icon size={22} className={color} />
              <span className={`text-xs font-semibold ${color}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* This Week */}
      <div className="px-4">
        <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Calendar size={16} className="text-blue-600" /> This Week
        </h2>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-50 overflow-hidden shadow-sm">
          {THIS_WEEK.map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                item.type === "stage" ? "bg-blue-50" : item.type === "invoice" ? "bg-slate-100" : "bg-purple-50"
              }`}>
                {item.type === "stage" ? <Hammer size={16} className="text-blue-500" /> :
                 item.type === "invoice" ? <FileText size={16} className="text-slate-500" /> :
                 <ClipboardList size={16} className="text-purple-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{item.text}</p>
                <p className="text-xs text-slate-400">{item.project} · {item.date}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                item.badgeColor === "green" ? "bg-emerald-50 text-emerald-600" :
                item.badgeColor === "blue" ? "bg-blue-50 text-blue-600" :
                item.badgeColor === "amber" ? "bg-amber-50 text-amber-600" :
                "bg-purple-50 text-purple-600"
              }`}>{item.badge}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Project Detail ──────────────────────────────────────────────────────

function MobileProjectDetail({ project, onBack }) {
  const [activeTab, setActiveTab] = useState("stages");
  const tabs = project.type === "home"
    ? ["stages", "costs", "gantt", "budget", "logs", "selections", "docs"]
    : ["stages", "costs", "gantt", "budget", "logs", "docs"];

  return (
    <div className="pb-24">
      {/* Hero */}
      <div className="bg-white border-b border-slate-200 px-4 pt-3 pb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 font-medium mb-3">
          <ArrowLeft size={16} /> Projects
        </button>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status="active" />
              <span className="text-xs text-slate-400">{project.daysUnder} days</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-0.5">{project.name}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1"><MapPin size={12} /> {project.address}</p>
          </div>
          <ProgressRing progress={project.progress} size={56} strokeWidth={5} />
        </div>
        {project.type === "home" && (
          <div className="flex gap-4 mt-3 text-xs text-slate-500">
            <span>Block {project.block} · Lot {project.lot}</span>
            <span>{project.plan}</span>
            <span>{project.sqft?.toLocaleString()} SF</span>
          </div>
        )}
      </div>

      {/* Sticky Tabs */}
      <div className="sticky top-0 bg-white border-b border-slate-200 z-10">
        <div className="flex overflow-x-auto px-4 gap-1" style={{ scrollbarWidth: "none" }}>
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab ? "text-blue-600 border-blue-600" : "text-slate-400 border-transparent hover:text-slate-600"
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 py-4">
        {activeTab === "stages" && (
          <div className="space-y-2">
            {/* Exterior Track */}
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <div className="w-5 h-0.5 bg-blue-400 rounded" /> Exterior Track
            </h3>
            {STAGES_LOT12.filter(s => s.track === "exterior").map(s => (
              <div key={s.num} className={`bg-white border rounded-xl p-4 transition-colors ${
                s.status === "in_progress" ? "border-blue-300 shadow-sm shadow-blue-100" :
                s.status === "complete" ? "border-slate-100" : "border-slate-200"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    s.status === "complete" ? "bg-emerald-100 text-emerald-600" :
                    s.status === "in_progress" ? "bg-blue-100 text-blue-600" :
                    "bg-slate-100 text-slate-400"
                  }`}>
                    {s.status === "complete" ? <Check size={16} /> : s.num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${s.status === "not_started" ? "text-slate-400" : "text-slate-900"}`}>{s.name}</p>
                    <p className="text-xs text-slate-400">{s.days}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                {s.status === "in_progress" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button className="flex-1 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg active:scale-98 transition-transform">Mark Complete</button>
                    <button className="flex-1 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg active:scale-98 transition-transform">Add Log</button>
                  </div>
                )}
              </div>
            ))}

            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-6 mb-2 flex items-center gap-2">
              <div className="w-5 h-0.5 bg-purple-400 rounded" /> Interior Track
            </h3>
            {STAGES_LOT12.filter(s => s.track === "interior").map(s => (
              <div key={s.num} className={`bg-white border rounded-xl p-4 ${
                s.status === "complete" ? "border-slate-100" : "border-slate-200"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    s.status === "complete" ? "bg-emerald-100 text-emerald-600" :
                    "bg-slate-100 text-slate-400"
                  }`}>
                    {s.status === "complete" ? <Check size={16} /> : s.num}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${s.status === "not_started" ? "text-slate-400" : "text-slate-900"}`}>{s.name}</p>
                    <p className="text-xs text-slate-400">{s.days}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "costs" && (
          <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-semibold text-slate-900">Total Budget</span>
                <span className="text-lg font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(project.budget)}</span>
              </div>
              <BudgetBar spent={project.spent} budget={project.budget} />
            </div>
            {[
              { code: "Excavation", budgeted: 8500, spent: 8200 },
              { code: "Foundation", budgeted: 32000, spent: 28400 },
              { code: "Framing", budgeted: 48000, spent: 28400 },
              { code: "Roofing", budgeted: 18000, spent: 0 },
              { code: "Electrical Rough", budgeted: 14000, spent: 0 },
              { code: "Plumbing Rough", budgeted: 12000, spent: 0 },
            ].map((c, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-900">{c.code}</span>
                  <span className="text-sm font-semibold text-slate-700" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.spent)} <span className="text-slate-400 font-normal">/ {fmt(c.budgeted)}</span></span>
                </div>
                <BudgetBar spent={c.spent} budget={c.budgeted} />
              </div>
            ))}
          </div>
        )}

        {activeTab !== "stages" && activeTab !== "costs" && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <Layers size={28} className="text-slate-300" />
            </div>
            <p className="text-sm text-slate-500 mb-1 font-medium capitalize">{activeTab} Tab</p>
            <p className="text-xs text-slate-400">Interactive preview — tap tabs to explore</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Desktop Dashboard ──────────────────────────────────────────────────────────

function DesktopDashboard({ onProjectTap }) {
  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Good morning, Jon</p>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
            <Bell size={20} className="text-slate-600" />
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">4</span>
          </button>
          <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
            <span className="text-sm font-medium text-slate-700">Jon Sikes</span>
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">JS</div>
          </div>
        </div>
      </div>

      <div className="p-8">
        {/* KPI Strip */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Projects", value: "4", icon: Building2, color: "blue" },
            { label: "Open To-Dos", value: "11", icon: ClipboardList, color: "purple", sub: "3 urgent" },
            { label: "Needs Attention", value: "4", icon: AlertTriangle, color: "amber" },
            { label: "AP Outstanding", value: "$54,250", icon: Receipt, color: "slate" },
          ].map(({ label, value, icon: Icon, color, sub }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  color === "blue" ? "bg-blue-50" : color === "purple" ? "bg-purple-50" : color === "amber" ? "bg-amber-50" : "bg-slate-50"
                }`}>
                  <Icon size={20} className={
                    color === "blue" ? "text-blue-600" : color === "purple" ? "text-purple-600" : color === "amber" ? "text-amber-600" : "text-slate-600"
                  } />
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
              <p className="text-sm text-slate-500">{label}</p>
              {sub && <p className="text-xs text-red-500 font-medium mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="col-span-2 space-y-6">
            {/* Project Health Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">Project Health</h2>
                <button className="text-sm font-medium text-blue-600 hover:text-blue-700">View all projects</button>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <MapPin size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prairie Sky Estates</span>
                <span className="text-xs text-slate-300">3 homes</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {PROJECTS.filter(p => p.type === "home").map(p => (
                  <button key={p.id} onClick={() => onProjectTap(p)} className="bg-white border border-slate-200 rounded-xl p-5 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 mr-3">
                        <h3 className="text-sm font-bold text-slate-900 truncate">{p.name}</h3>
                        <p className="text-xs text-slate-400">Block {p.block} · Lot {p.lot} · {p.sqft?.toLocaleString()} SF</p>
                      </div>
                      <ProgressRing progress={p.progress} size={44} />
                    </div>
                    {/* Stage Strip */}
                    <div className="mb-3 py-1.5 px-2 bg-slate-50 rounded-lg">
                      <StageStrip extStages={p.extStages} intStages={p.intStages} delayedCount={p.delayedCount} compact />
                    </div>
                    <BudgetBar spent={p.spent} budget={p.budget} />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <TreePine size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Land Development</span>
              </div>
              {PROJECTS.filter(p => p.type === "land").map(p => (
                <button key={p.id} onClick={() => onProjectTap(p)} className="w-full bg-white border border-slate-200 rounded-xl p-5 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 mr-3">
                      <h3 className="text-sm font-bold text-slate-900">{p.name}</h3>
                      <p className="text-xs text-slate-400">{p.acres} acres · {p.lots} lots · {p.lotsSold} sold</p>
                    </div>
                    <ProgressRing progress={p.progress} size={44} />
                  </div>
                  {/* Stage Strip */}
                  <div className="mb-3 py-1.5 px-2 bg-slate-50 rounded-lg">
                    <StageStrip extStages={p.extStages} intStages={p.intStages} delayedCount={p.delayedCount} compact />
                  </div>
                  <BudgetBar spent={p.spent} budget={p.budget} />
                </button>
              ))}
            </div>

            {/* This Week */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Calendar size={16} className="text-blue-600" />
                <h2 className="font-bold text-slate-900">This Week</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {THIS_WEEK.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.type === "stage" ? "bg-blue-50" : item.type === "invoice" ? "bg-slate-100" : "bg-purple-50"
                    }`}>
                      {item.type === "stage" ? <Hammer size={14} className="text-blue-500" /> :
                       item.type === "invoice" ? <FileText size={14} className="text-slate-500" /> :
                       <ClipboardList size={14} className="text-purple-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.text}</p>
                      <p className="text-xs text-slate-400">{item.project} · {item.date}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      item.badgeColor === "green" ? "bg-emerald-50 text-emerald-600" :
                      item.badgeColor === "blue" ? "bg-blue-50 text-blue-600" :
                      item.badgeColor === "amber" ? "bg-amber-50 text-amber-600" :
                      "bg-purple-50 text-purple-600"
                    }`}>{item.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Needs Attention */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Needs Attention</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {ALERTS.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${a.color === "red" ? "bg-red-500" : "bg-amber-500"}`} />
                    <span className="text-sm text-slate-700 flex-1">{a.msg}</span>
                    <ChevronRight size={14} className="text-slate-300" />
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Quick Actions</h2>
              </div>
              <div className="p-3 grid grid-cols-2 gap-2">
                {[
                  { icon: FileText, label: "New Invoice", color: "text-blue-600" },
                  { icon: ClipboardList, label: "Field Log", color: "text-emerald-600" },
                  { icon: Building2, label: "Projects", color: "text-purple-600" },
                  { icon: Banknote, label: "Draws", color: "text-amber-600" },
                ].map(({ icon: Icon, label, color }) => (
                  <button key={label} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors border border-slate-100">
                    <Icon size={16} className={color} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Desktop AP Table ───────────────────────────────────────────────────────────

function DesktopAPTable() {
  const [selectedRows, setSelectedRows] = useState([]);
  const toggleRow = (id) => setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  const toggleAll = () => setSelectedRows(prev => prev.length === INVOICES.length ? [] : INVOICES.map(i => i.id));

  return (
    <div className="flex-1 overflow-auto">
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Accounts Payable</h1>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
            <Plus size={16} /> New Invoice
          </button>
        </div>
      </div>

      <div className="p-8">
        {/* Summary Strip */}
        <div className="flex gap-6 mb-6">
          {[
            { label: "Pending Review", value: "2", amount: "$21,050", color: "amber" },
            { label: "Approved", value: "2", amount: "$37,600", color: "blue" },
            { label: "Released", value: "1", amount: "$42,000", color: "purple" },
            { label: "Past Due", value: "1", amount: "$6,800", color: "red" },
          ].map(({ label, value, amount, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-2 h-8 rounded-full ${
                color === "amber" ? "bg-amber-400" : color === "blue" ? "bg-blue-400" : color === "purple" ? "bg-purple-400" : "bg-red-400"
              }`} />
              <div>
                <p className="text-sm font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{amount}</p>
                <p className="text-xs text-slate-500">{value} {label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search invoices..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <button className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
            <Filter size={14} /> Status
          </button>
          <button className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
            <Filter size={14} /> Project
          </button>
          <button className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
            <Filter size={14} /> Vendor
          </button>
        </div>

        {/* Bulk Action Bar */}
        {selectedRows.length > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
            <span className="text-sm font-medium text-blue-700">{selectedRows.length} selected</span>
            <div className="w-px h-5 bg-blue-200" />
            <button className="text-sm font-medium text-blue-700 hover:text-blue-800">Approve All</button>
            <button className="text-sm font-medium text-blue-700 hover:text-blue-800">Issue Checks</button>
            <button className="text-sm font-medium text-blue-700 hover:text-blue-800">Add to Draw</button>
            <div className="flex-1" />
            <button onClick={() => setSelectedRows([])} className="text-sm text-blue-500 hover:text-blue-600">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={selectedRows.length === INVOICES.length} onChange={toggleAll} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Cost Code</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Due</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {INVOICES.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedRows.includes(inv.id)} onChange={() => toggleRow(inv.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{inv.vendor}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 truncate max-w-48">{inv.project}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.costCode}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-slate-600">{inv.dueDate}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(inv.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      {inv.status === "pending_review" && (
                        <button className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center hover:bg-emerald-100" title="Approve">
                          <Check size={14} className="text-emerald-600" />
                        </button>
                      )}
                      {inv.status === "approved" && (
                        <button className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center hover:bg-blue-100" title="Issue Check">
                          <FileText size={14} className="text-blue-600" />
                        </button>
                      )}
                      <button className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center hover:bg-slate-100">
                        <MoreHorizontal size={14} className="text-slate-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile AP View (Card-based) ────────────────────────────────────────────────

function MobileAPView() {
  const [filter, setFilter] = useState("all");
  const filters = ["all", "pending_review", "approved", "released", "cleared"];
  const filtered = filter === "all" ? INVOICES : INVOICES.filter(i => i.status === filter);

  return (
    <div className="pb-24">
      <div className="bg-white border-b border-slate-200 px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-slate-900 mb-3">Accounts Payable</h1>
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
              }`}>
              {f === "all" ? "All" : f === "pending_review" ? "Pending" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {filtered.map(inv => (
          <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-bold text-slate-900">{inv.vendor}</p>
                <p className="text-xs text-slate-400 truncate">{inv.project} · {inv.costCode}</p>
              </div>
              <p className="text-lg font-bold text-slate-900 shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(inv.amount)}</p>
            </div>
            <div className="flex items-center justify-between">
              <StatusBadge status={inv.status} />
              <span className="text-xs text-slate-400">Due {inv.dueDate}</span>
            </div>
            {inv.status === "pending_review" && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <button className="flex-1 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg active:scale-98 transition-transform">Approve</button>
                <button className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg active:scale-98 transition-transform">Review</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Device Frame ───────────────────────────────────────────────────────────────

function PhoneFrame({ children }) {
  return (
    <div className="relative mx-auto" style={{ width: 375, height: 812 }}>
      {/* Phone bezel */}
      <div className="absolute inset-0 bg-slate-900 rounded-[3rem] shadow-2xl shadow-slate-900/50" />
      {/* Screen */}
      <div className="absolute top-3 left-3 right-3 bottom-3 bg-slate-50 rounded-[2.5rem] overflow-hidden">
        {/* Status bar */}
        <div className="bg-white px-8 pt-3 pb-1 flex items-center justify-between text-xs font-semibold text-slate-900">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              <div className="w-1 h-2.5 bg-slate-900 rounded-sm" />
              <div className="w-1 h-3 bg-slate-900 rounded-sm" />
              <div className="w-1 h-3.5 bg-slate-900 rounded-sm" />
              <div className="w-1 h-2 bg-slate-300 rounded-sm" />
            </div>
            <span className="ml-1">5G</span>
            <div className="w-6 h-3 border border-slate-900 rounded-sm ml-1 flex items-center p-0.5">
              <div className="w-3/4 h-full bg-slate-900 rounded-sm" />
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="h-full overflow-y-auto" style={{ paddingBottom: 80 }}>
          {children}
        </div>
      </div>
      {/* Dynamic Island */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full" />
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────

export default function BuildForgeRedesign() {
  const [view, setView] = useState("overview"); // overview, mobile-dash, mobile-project, mobile-ap, desktop-dash, desktop-ap
  const [mobileTab, setMobileTab] = useState("home");
  const [showFab, setShowFab] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [desktopNav, setDesktopNav] = useState("home");

  if (view === "overview") {
    return (
      <div className="min-h-screen bg-slate-100" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
        {/* Navigation Header */}
        <div className="bg-slate-900 text-white px-6 py-5">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">BF</span>
              </div>
              <h1 className="text-xl font-bold">BuildForge UI Redesign</h1>
            </div>
            <p className="text-slate-400 text-sm">Interactive prototype — click any screen to explore</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-6">
          {/* Design Principles */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            {[
              { title: "Mobile-First Field Work", desc: "Bottom tab bar, FAB for quick actions, large touch targets, horizontal project carousel. Designed for one-handed use on a job site.", color: "blue" },
              { title: "Desktop Power Tools", desc: "Icon rail navigation, data-dense tables with inline actions, bulk operations, keyboard shortcuts. Built for office accounting.", color: "purple" },
              { title: "Construction-Native UX", desc: "Inspired by Procore & Buildertrend. Stage-driven project views, progress rings, budget bars, and draw-centric workflows.", color: "emerald" },
            ].map(({ title, desc, color }) => (
              <div key={title} className={`rounded-xl p-5 border ${
                color === "blue" ? "bg-blue-50 border-blue-200" : color === "purple" ? "bg-purple-50 border-purple-200" : "bg-emerald-50 border-emerald-200"
              }`}>
                <h3 className={`text-sm font-bold mb-2 ${color === "blue" ? "text-blue-900" : color === "purple" ? "text-purple-900" : "text-emerald-900"}`}>{title}</h3>
                <p className={`text-xs leading-relaxed ${color === "blue" ? "text-blue-700" : color === "purple" ? "text-purple-700" : "text-emerald-700"}`}>{desc}</p>
              </div>
            ))}
          </div>

          {/* Screen Previews */}
          <h2 className="text-lg font-bold text-slate-900 mb-4">Screens</h2>
          <div className="grid grid-cols-2 gap-6 mb-10">
            {/* Mobile Screens */}
            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Mobile Experience</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "mobile-dash", label: "Dashboard", desc: "Today view with project carousel", icon: Home },
                  { key: "mobile-project", label: "Project Detail", desc: "Stage tracker with sticky tabs", icon: HardHat },
                  { key: "mobile-ap", label: "Accounts Payable", desc: "Card-based invoice list", icon: Receipt },
                ].map(({ key, label, desc, icon: Icon }) => (
                  <button key={key} onClick={() => { setView(key); if (key === "mobile-project") setSelectedProject(PROJECTS[0]); }}
                    className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
                      <Icon size={20} className="text-blue-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop Screens */}
            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Desktop Experience</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "desktop-dash", label: "Dashboard", desc: "Command center with health grid", icon: BarChart2 },
                  { key: "desktop-ap", label: "Accounts Payable", desc: "Power table with bulk actions", icon: Receipt },
                ].map(({ key, label, desc, icon: Icon }) => (
                  <button key={key} onClick={() => setView(key)}
                    className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
                      <Icon size={20} className="text-purple-600" />
                    </div>
                    <p className="text-sm font-bold text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Key Changes Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Key Changes from Current Design</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              {[
                ["Sidebar drawer on mobile", "Bottom tab bar + FAB (always visible, one-handed)"],
                ["240px always-open sidebar", "64px icon rail + hover flyout (reclaim space)"],
                ["Flat border-only cards", "Subtle shadows + hover lift (visual depth)"],
                ["System font stack", "Inter typeface with tabular figures (financial precision)"],
                ["Table-only invoice views", "Cards on mobile, dense table on desktop (context-appropriate)"],
                ["Static KPI numbers", "KPI cards with sparkline trends (glanceable health)"],
                ["Small tap targets on mobile", "48px minimum + swipe gestures (field-ready)"],
                ["Hamburger menu navigation", "Direct bottom-tab access to all primary sections"],
              ].map(([from, to], i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-red-400 shrink-0 mt-0.5">—</span>
                  <div>
                    <span className="text-slate-400 line-through">{from}</span>
                    <br />
                    <span className="text-slate-700 font-medium">{to}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Mobile Views ──────────────────�