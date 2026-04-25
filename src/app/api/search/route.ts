import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type SearchHit = {
  id: string;
  kind: "project" | "vendor" | "invoice" | "contact";
  label: string;
  sublabel?: string | null;
  href: string;
};

/**
 * Lightweight search index for the Cmd+K palette.
 * Per UI Review § 02 #14.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ hits: [] });
  }

  const supabase = await createClient();
  const like = `%${q}%`;

  const [projectsRes, vendorsRes, invoicesRes, contactsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, address, subdivision, status")
      .or(
        `name.ilike.${like},address.ilike.${like},subdivision.ilike.${like}`
      )
      .limit(8),
    supabase
      .from("vendors")
      .select("id, name, trade")
      .or(`name.ilike.${like},trade.ilike.${like}`)
      .limit(8),
    supabase
      .from("invoices")
      .select("id, vendor, invoice_number, total_amount, amount, status")
      .or(`vendor.ilike.${like},invoice_number.ilike.${like}`)
      .limit(8),
    supabase
      .from("contacts")
      .select("id, name, type")
      .ilike("name", like)
      .limit(8),
  ]);

  const hits: SearchHit[] = [];
  for (const p of projectsRes.data ?? []) {
    hits.push({
      id: `project:${p.id}`,
      kind: "project",
      label: p.name,
      sublabel: [p.subdivision, p.address].filter(Boolean).join(" · ") || null,
      href: `/projects/${p.id}`,
    });
  }
  for (const v of vendorsRes.data ?? []) {
    hits.push({
      id: `vendor:${v.id}`,
      kind: "vendor",
      label: v.name,
      sublabel: v.trade ?? null,
      href: `/vendors/${v.id}`,
    });
  }
  for (const inv of invoicesRes.data ?? []) {
    const amt = inv.total_amount ?? inv.amount ?? 0;
    hits.push({
      id: `invoice:${inv.id}`,
      kind: "invoice",
      label: inv.vendor ?? inv.invoice_number ?? "Invoice",
      sublabel: `${inv.invoice_number ?? ""} · $${Math.round(amt).toLocaleString()}`.trim(),
      href: `/invoices/${inv.id}`,
    });
  }
  for (const c of contactsRes.data ?? []) {
    hits.push({
      id: `contact:${c.id}`,
      kind: "contact",
      label: c.name,
      sublabel: c.type ?? null,
      href: `/contacts`,
    });
  }

  return NextResponse.json({ hits });
}
