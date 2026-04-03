"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitDraw, fundDraw, markDrawPaid } from "@/app/actions/draws";
import { drawDisplayName } from "@/lib/draws";

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

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  funded:    "bg-blue-100 text-blue-700",
  paid:      "bg-green-100 text-green-700",
};

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function ActionButton({ draw }: { draw: Draw }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  function run(action: () => Promise<{ error?: string }>, e: React.MouseEvent) {
    e.stopPropagation(); // don't navigate to detail
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
            onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
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
              onClick={(e) => { e.stopPropagation(); setShowConfirm(false); }}
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
            onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
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
              onClick={(e) => { e.stopPropagation(); setShowConfirm(false); }}
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
        {!showConfirm ? (
          <button
            onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
            disabled={isPending}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            Mark Paid
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Mark as paid?</span>
            <button
              onClick={(e) => run(() => markDrawPaid(draw.id), e)}
              disabled={isPending}
              className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-60"
            >
              {isPending ? "…" : "Yes"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowConfirm(false); }}
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

  return null;
}

export default function DrawsTableClient({ draws }: Props) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {["Draw", "Date", "Lender", "Total", "Status", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {draws.map((draw) => (
              <tr
                key={draw.id}
                onClick={() => router.push(`/draws/${draw.id}`)}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {drawDisplayName(draw.draw_date)}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{draw.draw_date}</td>
                <td className="px-4 py-3 text-gray-700">{draw.lenderName ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{fmt(draw.total_amount)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_COLORS[draw.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {draw.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ActionButton draw={draw} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
