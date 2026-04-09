import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Pencil } from "lucide-react";
import InvoiceDetailActions from "@/components/invoices/InvoiceDetailActions";
import DeleteInvoiceButton from "@/components/invoices/DeleteInvoiceButton";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  approved:       "bg-blue-100 text-blue-700",
  scheduled:      "bg-purple-100 text-purple-700",
  paid:           "bg-green-100 text-green-700",
  disputed:       "bg-red-100 text-red-600",
};

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      id, vendor, invoice_number, invoice_date, due_date,
      amount, status, ai_confidence, ai_notes,
      pending_draw, direct_cash_payment, manually_reviewed, file_name, file_path,
      payment_date, payment_method, source, contract_id,
      projects ( id, name ),
      vendors ( id, name ),
      contracts ( id, amount, status, cost_codes ( code, name ) )
    `)
    .eq("id", id)
    .single();

  if (!invoice) notFound();

  const [lineItemsResult, drawLinksResult] = await Promise.all([
    supabase
      .from("invoice_line_items")
      .select("id, cost_code, description, amount")
      .eq("invoice_id", id)
      .order("created_at"),
    supabase
      .from("draw_invoices")
      .select("draw_id")
      .eq("invoice_id", id),
  ]);

  const lineItems = lineItemsResult.data;
  const drawIds = (drawLinksResult.data ?? []).map((l) => l.draw_id);

  // Check if locked in a funded draw
  let isInFundedDraw = false;
  if (drawIds.length > 0) {
    const { data: funded } = await supabase
      .from("loan_draws")
      .select("id")
      .in("id", drawIds)
      .eq("status", "funded")
      .limit(1);
    isInFundedDraw = (funded?.length ?? 0) > 0;
  }

  const project = invoice.projects as { id: string; name: string } | null;
  type ContractRef = { id: string; amount: number; status: string; cost_codes: { code: string; name: string } | null };
  const linkedContract = invoice.contracts as ContractRef | null;
  const isLowConf = invoice.ai_confidence === "low";
  const lineTotal = (lineItems ?? []).reduce((s, li) => s + (li.amount ?? 0), 0);

  // Generate a 1-hour signed URL for the stored invoice file
  let signedFileUrl: string | null = null;
  if (invoice.file_path) {
    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 3600);
    signedFileUrl = signed?.signedUrl ?? null;
  }

  const fileExt = invoice.file_name?.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(fileExt);

  // Allow editing on paid/cleared invoices — just vendor name and invoice number
  const isEditable = !isInFundedDraw;
  const isFullyEditable = !isInFundedDraw && invoice.status !== "paid" && invoice.status !== "cleared";
  const isDeletable = !isInFundedDraw;

  return (
    <>
      <Header title={invoice.file_name ?? "Invoice"} />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-5">
          <Link
            href="/invoices"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Accounts Payable
          </Link>

          {/* Low confidence warning */}
          {isLowConf && invoice.status === "pending_review" && !invoice.manually_reviewed && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
              <div>
                <p className="font-medium">Low AI confidence — cannot approve yet</p>
                <p className="mt-0.5 text-amber-700">
                  Edit this invoice and save changes before approving.
                  {invoice.ai_notes && ` AI note: ${invoice.ai_notes}`}
                </p>
              </div>
            </div>
          )}

          {/* Invoice header card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {invoice.vendor ?? "Unknown Vendor"}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {invoice.invoice_number ? `#${invoice.invoice_number}` : "No invoice number"}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {invoice.pending_draw && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#4272EF]/10 text-[#4272EF]">
                    Pending Draw
                  </span>
                )}
                {(invoice as { direct_cash_payment?: boolean }).direct_cash_payment && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    Auto-Draft
                  </span>
                )}
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    STATUS_COLORS[invoice.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {invoice.status.replace("_", " ")}
                </span>
                {isEditable && (
                  <Link
                    href={`/invoices/${id}/edit`}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] transition-colors"
                  >
                    <Pencil size={14} />
                    {isFullyEditable ? "Edit Invoice" : "Edit Vendor / #"}
                  </Link>
                )}
                {isDeletable && (
                  <DeleteInvoiceButton
                    invoiceId={id}
                    vendorName={invoice.vendor ?? "Unknown Vendor"}
                    invoiceNumber={invoice.invoice_number}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Project</p>
                <p className="text-gray-800">{project?.name ?? "G&A"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Invoice Date</p>
                <p className="text-gray-800">{invoice.invoice_date ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Due Date</p>
                <p className="text-gray-800">{invoice.due_date ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Total</p>
                <p className="text-lg font-semibold text-gray-900">{fmt(invoice.amount)}</p>
              </div>
              {linkedContract && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Contract</p>
                  <Link
                    href={`/contracts/${linkedContract.id}/edit`}
                    className="text-sm text-[#4272EF] hover:underline font-medium"
                  >
                    {linkedContract.cost_codes
                      ? `${linkedContract.cost_codes.code} – ${linkedContract.cost_codes.name}`
                      : "View Contract"
                    }
                  </Link>
                  <p className="text-xs text-gray-400">{fmt(linkedContract.amount)} · {linkedContract.status}</p>
                </div>
              )}
              {invoice.payment_date && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Paid</p>
                  <p className="text-gray-800">
                    {invoice.payment_date}
                    {invoice.payment_method && ` via ${invoice.payment_method}`}
                  </p>
                </div>
              )}
              {invoice.ai_confidence && invoice.source === "upload" && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">AI Confidence</p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      invoice.ai_confidence === "high"
                        ? "bg-green-100 text-green-700"
                        : invoice.ai_confidence === "medium"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {invoice.ai_confidence}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Line Items</h3>

            {(lineItems ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">No line items recorded.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Code</th>
                    <th className="text-left pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Description</th>
                    <th className="text-right pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(lineItems ?? []).map((li) => (
                    <tr key={li.id}>
                      <td className="py-2 pr-4 text-xs font-mono text-gray-500">{li.cost_code}</td>
                      <td className="py-2 pr-4 text-gray-700">{li.description ?? "—"}</td>
                      <td className="py-2 text-right font-medium text-gray-900">{fmt(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td colSpan={2} className="pt-3 text-sm font-semibold text-gray-700">Total</td>
                    <td className="pt-3 text-right text-sm font-semibold text-gray-900">{fmt(lineTotal)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            )}
          </div>

          {/* File viewer */}
          {signedFileUrl && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">
                  {invoice.file_name ?? "Invoice File"}
                </h3>
                <a
                  href={signedFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#4272EF] hover:underline"
                >
                  Open in new tab ↗
                </a>
              </div>
              {isImage ? (
                <div className="p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedFileUrl}
                    alt={invoice.file_name ?? "Invoice"}
                    className="max-w-full rounded"
                  />
                </div>
              ) : (
                <iframe
                  src={signedFileUrl}
                  title={invoice.file_name ?? "Invoice"}
                  className="w-full border-0"
                  style={{ height: 900 }}
                />
              )}
            </div>
          )}

          {/* Actions */}
          <InvoiceDetailActions
            invoiceId={invoice.id}
            status={invoice.status}
          />
        </div>
      </main>
    </>
  );
}
