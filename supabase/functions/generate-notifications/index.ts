import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req: Request) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const warn30 = new Date(today);
  warn30.setDate(warn30.getDate() + 30);
  const warn30Str = warn30.toISOString().split("T")[0];

  const generated: string[] = [];

  const { data: users } = await supabase.from("profiles").select("id").limit(500);
  let userIds: string[] = (users ?? []).map((u: { id: string }) => u.id);
  if (userIds.length === 0) {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    userIds = (authUsers?.users ?? []).map((u) => u.id);
  }

  if (userIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: "No users found", generated: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Includes read notifications so dismissals stay dismissed — otherwise the cron would
  // re-create a notification the user just marked read.
  async function notifExists(userId: string, type: string, referenceId: string): Promise<boolean> {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", type)
      .eq("reference_id", referenceId);
    return (count ?? 0) > 0;
  }

  async function createNotif(
    userId: string,
    type: string,
    referenceId: string,
    referenceType: string,
    message: string
  ) {
    if (await notifExists(userId, type, referenceId)) return;
    await supabase.from("notifications").insert({
      user_id: userId,
      type,
      reference_id: referenceId,
      reference_type: referenceType,
      message,
      is_read: false,
    });
    generated.push(`${type}:${referenceId}`);
  }

  const { data: pastDueInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, vendor, due_date, amount, total_amount")
    .lt("due_date", todayStr)
    .not("status", "in", "(paid,disputed)");

  for (const inv of pastDueInvoices ?? []) {
    const amount = (inv.total_amount ?? inv.amount ?? 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
    const msg = `Invoice ${inv.invoice_number ?? inv.id} from ${inv.vendor ?? "Unknown Vendor"} (${amount}) was due ${inv.due_date} and is past due.`;
    for (const uid of userIds) {
      await createNotif(uid, "invoice_past_due", inv.id, "invoice", msg);
    }
  }

  const { data: pendingInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, vendor, amount, total_amount")
    .eq("status", "pending_review");

  for (const inv of pendingInvoices ?? []) {
    const amount = (inv.total_amount ?? inv.amount ?? 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
    const msg = `Invoice ${inv.invoice_number ?? inv.id} from ${inv.vendor ?? "Unknown Vendor"} (${amount}) is awaiting review and approval.`;
    for (const uid of userIds) {
      await createNotif(uid, "invoice_pending_review", inv.id, "invoice", msg);
    }
  }

  const { data: coiExpiring } = await supabase
    .from("vendors")
    .select("id, name, coi_expiry_date")
    .not("coi_expiry_date", "is", null)
    .gte("coi_expiry_date", todayStr)
    .lte("coi_expiry_date", warn30Str);

  for (const v of coiExpiring ?? []) {
    const msg = `${v.name}'s Certificate of Insurance expires on ${v.coi_expiry_date} (within 30 days). Collect a new COI.`;
    for (const uid of userIds) {
      await createNotif(uid, "coi_expiring", v.id, "vendor", msg);
    }
  }

  const { data: coiExpired } = await supabase
    .from("vendors")
    .select("id, name, coi_expiry_date")
    .not("coi_expiry_date", "is", null)
    .lt("coi_expiry_date", todayStr);

  for (const v of coiExpired ?? []) {
    const msg = `${v.name}'s Certificate of Insurance expired on ${v.coi_expiry_date}. This vendor is blocked until a new COI is provided.`;
    for (const uid of userIds) {
      await createNotif(uid, "coi_expired", v.id, "vendor", msg);
    }
  }

  const { data: licExpiring } = await supabase
    .from("vendors")
    .select("id, name, license_expiry_date")
    .not("license_expiry_date", "is", null)
    .gte("license_expiry_date", todayStr)
    .lte("license_expiry_date", warn30Str);

  for (const v of licExpiring ?? []) {
    const msg = `${v.name}'s contractor license expires on ${v.license_expiry_date} (within 30 days). Verify renewal.`;
    for (const uid of userIds) {
      await createNotif(uid, "license_expiring", v.id, "vendor", msg);
    }
  }

  const { data: licExpired } = await supabase
    .from("vendors")
    .select("id, name, license_expiry_date")
    .not("license_expiry_date", "is", null)
    .lt("license_expiry_date", todayStr);

  for (const v of licExpired ?? []) {
    const msg = `${v.name}'s contractor license expired on ${v.license_expiry_date}. Do not issue new work orders until renewed.`;
    for (const uid of userIds) {
      await createNotif(uid, "license_expired", v.id, "vendor", msg);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, generated: generated.length, items: generated }),
    { headers: { "Content-Type": "application/json" } }
  );
});
