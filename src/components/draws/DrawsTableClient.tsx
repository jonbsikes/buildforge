"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitDraw, fundDraw } from "@/app/actions/draws";
import { drawDisplayName } from "@/lib/draws";
import StatusDot from "@/components/ui/StatusDot";

interface Draw {
  id: string;
  draw_date: string;
  total_amount: number | null;
  status: string;
  lenderName: string | null;
}

interface Props {
  draws: Draw[];
}

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}/${y}`;
}

function ActionButton({ draw }: { draw: Draw }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  function run(action: () => Promise<{ error?: string }>, e: React.MouseEvent) {
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  if (draw.status === "paid") return null;

  if (draw.status === "draft") {
    return (
      <div onClick={handleClick} className="flex items-center gap-2">
        {!showConfirm ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowConfirm(true);
            }}
            disabled={isPending}
            className="px-3 py-1.5 bg-[#4272EF] text-white rounded-lg text-xs font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            Submit
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Submit to bank?</span>
            <button
              onClick={(e) => run(() => submitDraw(draw.id), e)}
              disabled={isPending}
              className="px-2.5 py-1 bg-[#4272EF] text-white rounded text-xs font-medium hover:bg-[#3461de] disabled:opacity-60"
            >
              {isPending ? "…" : "Yes"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirm(false);
              }}
              className="px-2.5 py-1 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
            >
              No
            </button>
          </div>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  if (draw.status === "submitted") {
    return (
      <div onClick={handleClick} className="flex items-center gap-2">
        {!showConfirm ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowConfirm(true);
            }}
            disabled={isPending}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            Mark Funded
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Mark as funded?</span>
            <button
              onClick={(e) => run(() => fundDraw(draw.id), e)}
              disabled={isPending}
              className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "…" : "Yes"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirm(false);
              }}
              className="px-2.5 py-1 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
            >
              No
            </button>
          </div>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  if (draw.status === "funded") {
    return (
      <div onClick={handleClick} className="flex items-center gap-2">
        <span className="text-xs text-gray-500 italic">Write checks via draw detail</span>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  return null;
}

export default function DrawsTableClient({ draws }: Props) {
  const router = useRouter();

  // Summary stats
  const statsByStatus = {
    draft: draws.filter((d) => d.status === "draft").length,
    submitted: draws.filter((d) => d.status === "submitted").length,
    funded: draws.filter((d) => d.status === "funded").length,
    paid: draws.filter((d) => d.status === "paid").length,
  };
  const totalAmount = draws.reduce((acc, d) => acc + (d.total_amount ?? 0), 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Summary strip */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Draft:</span>
          <span className="font-medium text-gray-900">{statsByStatus.draft}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Submitted:</span>
          <span className="font-medium text-gray-900">{statsByStatus.submitted}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Funded:</span>
          <span className="font-medium text-gray-900">{statsByStatus.funded}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Paid:</span>
          <span className="font-medium text-gray-900">{statsByStatus.paid}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 border-l border-gray-300 pl-6">
          <span className="text-gray-500">Total:</span>
          <span className="font-medium text-gray-900 tabular-nums">{fmt(totalAmount)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Draw</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Lender</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Total</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {draws.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">No draws yet.</td>
              </tr>
            ) : draws.map((draw) => (
              <tr
                key={draw.id}
                onClick={() => router.push(`/draws/${draw.id}`)}
                className="hover:bg-gray-50 transition-colors cursor-pointer group"
              >
                <td className="px-4 py-2 font-medium text-gray-900">{drawDisplayName(draw.draw_date)}</td>
                <td className="px-4 py-2 text-gray-600 text-xs">{fmtDate(draw.draw_date)}</td>
                <td className="px-4 py-2 text-gray-700">{draw.lenderName ?? "\u2014"}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900 tabular-nums">{fmt(draw.total_amount)}</td>
                <td className="px-4 py-2"><StatusDot status={draw.status} /></td>
                <td className="px-4 py-2">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ActionButton draw={draw} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
