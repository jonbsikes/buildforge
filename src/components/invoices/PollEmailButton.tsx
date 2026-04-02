"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function PollEmailButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handlePoll() {
    setLoading(true);
    setResult(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/poll-gmail-invoices`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data = await res.json();

      if (data.error) {
        setResult(`Error: ${data.error}`);
      } else {
        const { processed, skipped, errors } = data;
        if (processed === 0 && skipped === 0 && errors === 0) {
          setResult("No new invoices found");
        } else {
          setResult(
            `${processed} new invoice${processed !== 1 ? "s" : ""} imported` +
            (skipped > 0 ? `, ${skipped} skipped` : "") +
            (errors > 0 ? `, ${errors} error${errors !== 1 ? "s" : ""}` : "")
          );
        }
      }
    } catch {
      setResult("Failed to connect");
    } finally {
      setLoading(false);
      // Auto-clear result and reload after 3 seconds if we got new invoices
      setTimeout(() => {
        setResult(null);
        window.location.reload();
      }, 3000);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handlePoll}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Checking…
          </>
        ) : (
          <>
            <Mail size={16} />
            Check Email
          </>
        )}
      </button>
      {result && (
        <div className="absolute right-0 top-full mt-2 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-10 shadow-lg">
          {result}
        </div>
      )}
    </div>
  );
}
