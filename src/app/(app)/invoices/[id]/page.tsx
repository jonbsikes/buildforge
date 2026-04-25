import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Pencil } from "lucide-react";
import InvoiceDetailActions from "@/components/invoices/InvoiceDetailActions";
import DeleteInvoiceButton from "@/components/invoices/DeleteInvoiceButton";
import StatusBadge from "@/components/ui/StatusBadge";
import MetadataChip from "@/components/ui/MetadataChip";
import Money from "@/components/ui/Money";
import DateValue from "@/components/ui/DateValue";
import LifecycleStepper, { type LifecycleStep } from "@/components/ui/LifecycleStepper";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      id, vendor, invoice_number, invoice_date, due_date,
      amount, total_amount, status, ai_confidence, ai_notes,
      pending_draw, direct_cash_payment, manually_reviewed, file_name, file_path,
      payment_date, payment_method, source, contract_id, discount_taken,
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
      .select("id, cost_code, description, amount, project_id, projects ( name )")
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

  // Lifecycle stepper data — per UI Review § 06 #42.
  const isVoid = invoice.status === "void";
  const isDisputed = invoice.status === "disputed";
  const lifecycle: LifecycleStep[] =
    isVoid
      ? [
          { id: "pending_review", label: "Pending review" },
          { id: "void", label: "Void" },
        ]
      : isDisputed
      ? [
          { id: "pending_review", label: "Pending review" },
          { id: "disputed", label: "Disputed" },
        ]
      : [
          { id: "pending_review", label: "Pending review" },
          { id: "approved", label: "Approved" },
          { id: "released", label: "Check issued" },
          {
            id: "cleared",
            label: "Cleared",
            caption: invoice.payment_date ? <DateValue value={invoice.payment_date} kind="absolute" /> : undefined,
          },
        ];
  const lifecycleCurrent = isVoid
    ? "void"
    : isDisputed
    ? "disputed"
    : (invoice.status ?? "pending_review");

  return (
    <>
      <Header
        title={invoice.invoice_number ? `Invoice #${invoice.invoice_number}` : "Invoice"}
        breadcrumbs={[
          { label: "Accounts Payable", href: "/invoices" },
          { label: invoice.vendor ?? "Vendor", href: undefined },
          { label: invoice.invoice_number ? `#${invoice.invoice_number}` : "Invoice" },
        ]}
      />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Lifecycle stepper */}
          <div className="bg-white rounded-xl border border-[color:var(--card-border)] px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[color:var(--text-secondary)] mb-3">
              Status
            </p>
            <LifecycleStepper
              steps={lifecycle}
              current={lifecycleCurrent}
              ended={isVoid || isDisputed}
            />
          </div>

          {/* Low confidence warning — above split view */}
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

          {/* Split view: PDF on left (lg:w-1/2), metadata on right (lg:w-1/2) */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* LEFT PANEL: PDF Preview (sticky on desktop) */}
            {signedFileUrl && (
              <div className="lg:w-1/2 lg:sticky lg:top-6 lg:self-start">
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
                      style={{ minHeight: 600, height: "calc(100vh - 8rem)" }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* RIGHT PANEL: Invoice metadata, line items, and actions */}
            <div className={`space-y-5 ${signedFileUrl ? "lg:w-1/2" : "w-full"}`}>
              {/* Invoice header card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                {/* Top row: vendor, status badges, action buttons */}
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {invoice.vendor ?? "Unknown Vendor"}
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {invoice.invoice_number ? `Invoice #${invoice.invoice_number}` : "No invoice number"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {invoice.pending_draw && <MetadataChip variant="accent">Pending Draw</MetadataChip>}
                    {(invoice as { direct_cash_payment?: boolean }).direct_cash_payment && (
                      <MetadataChip>Auto-Draft</MetadataChip>
                    )}
                    <StatusBadge status={invoice.status} />
                  </div>
                </div>

                {/* Large amount display */}
                <div className="mb-6 pb-6 border-b border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Total Amount</p>
                  <p className="text-3xl font-bold text-gray-900">
                    <Money value={invoice.amount} decimals />
                  </p>
                  {(invoice.discount_taken as number) > 0 && (
                    <div className="mt-2">
                      <p className="text-sm text-green-600">
                        Discount: <Money value={invoice.discount_taken as number} decimals className="text-green-600" />
                      </p>
                      <p className="text-sm text-gray-500">
                        Net paid: <Money value={(invoice.amount ?? 0) - (invoice.discount_taken as number)} decimals className="text-gray-500" />
                      </p>
                    </div>
                  )}
                </div>

                {/* Metadata grid: invoice date, due date, payment info */}
                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Invoice Date</p>
                    <p className="text-gray-800 font-medium">
                      <DateValue value={invoice.invoice_date} />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Due Date</p>
                    <p className="text-gray-800 font-medium">
                      <DateValue value={invoice.due_date} kind="smart" />
                    </p>
                  </div>
                  {invoice.payment_date && (
                    <>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Payment Date</p>
                        <p className="text-gray-800 font-medium">
                          <DateValue value={invoice.payment_date} />
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Payment Method</p>
                        <p className="text-gray-800 font-medium">{invoice.payment_method ?? "—"}</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Edit and Delete buttons */}
                {(isEditable || isDeletable) && (
                  <div className="flex items-center gap-3">
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
                )}
              </div>

              {/* Project & Cost Code card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Project</p>
                    {(() => {
                      const lineProjectIds = new Set((lineItems ?? []).map((li) => (li as { project_id?: string | null }).project_id ?? null));
                      if (lineProjectIds.size > 1) {
                        return <p className="text-sm font-medium text-[#4272EF]">Multiple Projects (see line items)</p>;
                      }
                      return project ? (
                        <p className="text-sm font-medium text-gray-900">{project.name}</p>
                      ) : (
                        <p className="text-sm font-medium text-gray-500">G&A (Company-wide)</p>
                      );
                    })()}
                  </div>

                  {linkedContract && (
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Linked Contract</p>
                      <Link
                        href={`/contracts/${linkedContract.id}/edit`}
                        className="text-sm font-medium text-[#4272EF] hover:underline"
                      >
                        {linkedContract.cost_codes
                          ? `${linkedContract.cost_codes.code} – ${linkedContract.cost_codes.name}`
                          : "View Contract"
                        }
                      </Link>
                      <p className="text-xs text-gray-500 mt-1">
                        <Money value={linkedContract.amount} decimals className="text-gray-500" /> · {linkedContract.status}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Confidence card (only if email/upload source) */}
              {invoice.ai_confidence && (invoice.source === "email" || invoice.source === "upload") && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <p className="text-xs text-gray-400 mb-2">AI Extraction Confidence</p>
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      status={
                        invoice.ai_confidence === "high"
                          ? "complete"
                          : invoice.ai_confidence === "medium"
                            ? "active"
                            : "warning"
                      }
                    >
                      {invoice.ai_confidence.charAt(0).toUpperCase() + invoice.ai_confidence.slice(1)}
                    </StatusBadge>
                    {invoice.ai_notes && (
                      <p className="text-xs text-gray-600">{invoice.ai_notes}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Line items card */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Line Items</h3>
                {(lineItems ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400">No line items recorded.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Project</th>
                        <th className="text-left pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Code</th>
                        <th className="text-left pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Description</th>
                        <th className="text-right pb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(lineItems ?? []).map((li) => {
                        const liProject = (li as { projects?: { name: string } | null }).projects;
                        return (
                          <tr key={li.id}>
                            <td className="py-1.5 pr-4 text-xs text-gray-500">{liProject?.name ?? "G&A"}</td>
                            <td className="py-1.5 pr-4 text-xs font-mono text-gray-500">{li.cost_code}</td>
                            <td className="py-1.5 pr-4 text-gray-700">{li.description ?? "\u2014"}</td>
                            <td className="py-1.5 text-right font-medium text-gray-900">
                              <Money value={li.amount} decimals />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={3} className="pt-2 text-sm font-semibold text-gray-700">Total</td>
                        <td className="pt-2 text-right text-sm font-semibold text-gray-900">
                          <Money value={lineTotal} decimals />
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Actions */}
              <InvoiceDetailActions
                invoiceId={invoice.id}
                status={invoice.status}
                invoiceAmount={((invoice.total_amount ?? invoice.amount) as number) ?? 0}
                discountTaken={(invoice.discount_taken as number) ?? 0}
              />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
