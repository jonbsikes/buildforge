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

    let gotNew = false;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setResult("Not signed in — refresh and try again");
        return;
      }

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) {
        setResult("Missing NEXT_PUBLIC_SUPABASE_URL — check env config");
        return;
      }

      let res: Response;
      try {
        res = await fetch(`${url}/functions/v1/poll-gmail-invoices`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        });
      } catch (netErr) {
        // Network reachability failure (DNS, offline, CORS preflight). The
        // Edge Function URL never received the request.
        setResult(`Network error: ${(netErr as Error).message}`);
        return;
      }

      // Read the body as text first so we can show useful detail even when
      // the Edge Function fails to boot (returns plain-text error from the
      // Supabase runtime instead of JSON, e.g. when an env var is missing).
      const raw = await res.text();
      let data: { error?: string; processed?: number; skipped?: number; errors?: number } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // Non-JSON response (boot error, 502, etc.) — show the first line.
        const firstLine = raw.split("\n")[0]?.slice(0, 200) || "(empty response)";
        setResult(`Edge function ${res.status}: ${firstLine}`);
        return;
      }

      if (!res.ok || data.error) {
        setResult(`Error: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }

      const processed = data.processed ?? 0;
      const skipped = data.skipped ?? 0;
      const errors = data.errors ?? 0;
      gotNew = processed > 0;

      if (processed === 0 && skipped === 0 && errors === 0) {
        setResult("No new invoices found");
      } else {
        setResult(
          `${processed} new invoice${processed !== 1 ? "s" : ""} imported` +
          (skipped > 0 ? `, ${skipped} skipped` : "") +
          (errors > 0 ? `, ${errors} error${errors !== 1 ? "s" : ""}` : "")
        );
      }
    } finally {
      setLoading(false);
      // Only reload when we actually got new invoices — otherwise leave the
      // result message visible so the user can read any error detail.
      setTimeout(() => {
        setResult(null);
        if (gotNew) window.location.reload();
      }, gotNew ? 3000 : 6000);
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
