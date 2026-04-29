"use client";

import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type MessageDetail = {
  id: string;
  from?: string;
  subject?: string;
  result: string;
  reason?: string;
};

type PollResponse = {
  error?: string;
  processed?: number;
  skipped?: number;
  errors?: number;
  watermarkAdvanced?: boolean;
  messagesScanned?: number;
  details?: MessageDetail[];
};

export default function PollEmailButton() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [details, setDetails] = useState<MessageDetail[]>([]);

  async function handlePoll() {
    setLoading(true);
    setSummary(null);
    setDetails([]);

    let gotNew = false;
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSummary("Not signed in — refresh and try again");
        return;
      }

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) {
        setSummary("Missing NEXT_PUBLIC_SUPABASE_URL — check env config");
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
        setSummary(`Network error: ${(netErr as Error).message}`);
        return;
      }

      // Read the body as text first so we can show useful detail even when
      // the Edge Function fails to boot (returns plain-text error from the
      // Supabase runtime instead of JSON, e.g. when an env var is missing).
      const raw = await res.text();
      let data: PollResponse = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // Non-JSON response (boot error, 502, etc.) — show the first line.
        const firstLine = raw.split("\n")[0]?.slice(0, 200) || "(empty response)";
        setSummary(`Edge function ${res.status}: ${firstLine}`);
        return;
      }

      if (data.details?.length) setDetails(data.details);

      if (!res.ok || data.error) {
        setSummary(`Error: ${data.error ?? `HTTP ${res.status}`}`);
        return;
      }

      const processed = data.processed ?? 0;
      const skipped = data.skipped ?? 0;
      const errors = data.errors ?? 0;
      gotNew = processed > 0;

      if (processed === 0 && skipped === 0 && errors === 0) {
        setSummary("No new invoices found");
      } else {
        setSummary(
          `${processed} new invoice${processed !== 1 ? "s" : ""} imported` +
          (skipped > 0 ? `, ${skipped} skipped` : "") +
          (errors > 0 ? `, ${errors} error${errors !== 1 ? "s" : ""}` : "")
        );
      }
    } finally {
      setLoading(false);
      // Don't auto-clear when there are details to read — the user needs time
      // to read why a message was skipped or errored. Only auto-reload on a
      // successful import.
      if (gotNew) {
        setTimeout(() => {
          setSummary(null);
          setDetails([]);
          window.location.reload();
        }, 3000);
      }
    }
  }

  const hasDetails = details.length > 0;

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
      {summary && (
        <div className="absolute right-0 top-full mt-2 bg-gray-900 text-white text-xs rounded-lg z-10 shadow-lg overflow-hidden min-w-[280px] max-w-[480px]">
          <div className="flex items-start justify-between gap-3 px-3 py-2">
            <span>{summary}</span>
            <button
              onClick={() => {
                setSummary(null);
                setDetails([]);
              }}
              className="text-gray-400 hover:text-white"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          {hasDetails && (
            <ul className="border-t border-gray-700 bg-gray-950 px-3 py-2 space-y-1.5 max-h-64 overflow-y-auto">
              {details.map((d, i) => (
                <li key={`${d.id}-${i}`} className="leading-snug">
                  <div className="font-medium text-gray-200">
                    [{d.result}] {d.from ?? d.id}
                  </div>
                  {d.subject && (
                    <div className="text-gray-400 truncate">{d.subject}</div>
                  )}
                  {d.reason && (
                    <div className="text-gray-300">{d.reason}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
