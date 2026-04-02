export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── Enums / string unions ──────────────────────────────────────────────────
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
export type ProjectType = "land_development" | "home_construction";
export type StageStatus = "not_started" | "in_progress" | "completed" | "blocked";
export type InvoiceStatus = "pending_review" | "approved" | "scheduled" | "paid" | "disputed";
export type InvoiceSource = "email" | "upload";
export type AIConfidence = "high" | "medium" | "low";
export type PaymentMethod = "check" | "ach" | "wire" | "credit_card";
export type VendorType = "subcontractor" | "supplier" | "utility" | "professional";
export type ContactType = "lender" | "title_company" | "architect" | "engineer" | "inspector" | "municipality" | "realtor" | "other";
export type POStatus = "draft" | "sent" | "acknowledged" | "closed";
export type ContractStatus = "draft" | "active" | "complete";
export type ChangeOrderStatus = "pending" | "approved" | "rejected";
export type LoanType = "construction" | "land" | "lot" | "bridge";
export type LoanStatus = "active" | "paid_off" | "extended";
export type DrawStatus = "draft" | "submitted" | "approved" | "funded";
export type PaymentType = "interest" | "principal" | "interest_reserve";
export type DocumentType = "inspection_report" | "permit" | "approval" | "other";
export type VendorDocType = "coi" | "w9" | "license" | "contract" | "other";

// Legacy (kept for backward compat)
export type SaleType = "lot_sale" | "house_sale" | "progress_payment" | "deposit" | "variation" | "other";
export type CostCategory =
  | "land" | "siteworks" | "foundation" | "framing" | "roofing"
  | "electrical" | "plumbing" | "hvac" | "insulation" | "drywall"
  | "flooring" | "cabinetry" | "painting" | "landscaping" | "permits"
  | "professional_fees" | "contingency" | "other";

// ── Row interfaces ─────────────────────────────────────────────────────────

interface ContactRow {
  id: string;
  user_id: string;
  name: string;
  type: ContactType;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  address: string | null;
  description: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  total_budget: number;
  contract_price: number | null;
  lender_id: string | null;
  target_close: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

interface CostCodeRow {
  code: number;
  category: string;
  description: string;
}

interface BuildStageRow {
  stage_number: number;
  name: string;
}

interface ProjectStageRow {
  id: string;
  project_id: string;
  stage_number: number;
  status: StageStatus;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface StagePhotoRow {
  id: string;
  project_stage_id: string;
  file_url: string;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

interface StageDocumentRow {
  id: string;
  project_stage_id: string;
  file_url: string;
  document_type: DocumentType;
  name: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

interface ProjectBudgetRow {
  id: string;
  project_id: string;
  cost_code: number;
  budgeted_amount: number;
  committed_amount: number;
  actual_amount: number;
}

interface VendorRow {
  id: string;
  user_id: string;
  name: string;
  type: VendorType;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  w9_on_file: boolean;
  coi_expiry: string | null;
  license_number: string | null;
  license_expiry: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface VendorDocumentRow {
  id: string;
  vendor_id: string;
  document_type: VendorDocType;
  file_url: string;
  expiry_date: string | null;
  uploaded_at: string;
}

interface PurchaseOrderRow {
  id: string;
  project_id: string;
  vendor_id: string | null;
  cost_code: number | null;
  po_number: string;
  description: string;
  amount: number;
  status: POStatus;
  issued_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ContractRow {
  id: string;
  project_id: string;
  vendor_id: string | null;
  cost_code: number | null;
  po_id: string | null;
  description: string;
  contract_amount: number;
  status: ContractStatus;
  signed_date: string | null;
  created_at: string;
  updated_at: string;
}

interface ChangeOrderRow {
  id: string;
  contract_id: string;
  description: string;
  amount: number;
  status: ChangeOrderStatus;
  created_at: string;
}

interface InvoiceRow {
  id: string;
  project_id: string;
  vendor_id: string | null;
  po_id: string | null;
  contract_id: string | null;
  cost_code: number | null;
  cost_item_id: string | null;
  file_path: string;
  file_name: string;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  amount: number | null;
  status: InvoiceStatus;
  due_date: string | null;
  payment_date: string | null;
  payment_method: PaymentMethod | null;
  ai_confidence: AIConfidence | null;
  ai_notes: string | null;
  source: InvoiceSource;
  extracted_data: Json | null;
  processed: boolean;
  created_at: string;
  updated_at: string;
}

interface InvoiceFileRow {
  id: string;
  invoice_id: string;
  file_url: string;
  file_type: string;
  uploaded_at: string;
}

interface LoanRow {
  id: string;
  project_id: string;
  lender_id: string | null;
  loan_number: string | null;
  loan_type: LoanType;
  total_amount: number;
  interest_rate: number;
  rate_type: string;
  origination_date: string | null;
  maturity_date: string | null;
  status: LoanStatus;
  created_at: string;
  updated_at: string;
}

interface LoanDrawRow {
  id: string;
  loan_id: string;
  draw_number: number;
  amount_requested: number;
  amount_approved: number | null;
  status: DrawStatus;
  submitted_date: string | null;
  funded_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LoanDrawItemRow {
  id: string;
  draw_id: string;
  cost_code: number | null;
  invoice_id: string | null;
  description: string;
  amount: number;
}

interface LoanPaymentRow {
  id: string;
  loan_id: string;
  payment_date: string;
  payment_type: PaymentType;
  amount: number;
  notes: string | null;
  created_at: string;
}

// Legacy tables
interface StageRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: StageStatus;
  order_index: number;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

interface CostItemRow {
  id: string;
  project_id: string;
  stage_id: string | null;
  cost_code: number | null;
  category: CostCategory;
  description: string;
  budgeted_amount: number;
  actual_amount: number;
  vendor: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  invoice_file_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SaleRow {
  id: string;
  project_id: string;
  sale_type: SaleType;
  description: string;
  buyer_name: string | null;
  contract_price: number | null;
  deposit_amount: number | null;
  deposit_received_date: string | null;
  settlement_date: string | null;
  is_settled: boolean;
  settled_amount: number | null;
  settled_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  stage_id: string | null;
  name: string;
  due_date: string | null;
  completed_date: string | null;
  is_completed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type TodoStatus = "open" | "in_progress" | "done";
export type TodoPriority = "low" | "normal" | "urgent";

interface FieldLogRow {
  id: string;
  project_id: string;
  project_stage_id: string | null;
  log_date: string;
  notes: string;
  created_by: string;
  created_at: string;
}

interface FieldTodoRow {
  id: string;
  project_id: string;
  field_log_id: string | null;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  due_date: string | null;
  resolved_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Database type ─────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      contacts: {
        Row: ContactRow;
        Insert: Omit<ContactRow, "id" | "created_at">;
        Update: Partial<Omit<ContactRow, "id" | "created_at">>;
        Relationships: [];
      };
      projects: {
        Row: ProjectRow;
        Insert: Omit<ProjectRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ProjectRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      cost_codes: {
        Row: CostCodeRow;
        Insert: CostCodeRow;
        Update: Partial<CostCodeRow>;
        Relationships: [];
      };
      build_stages: {
        Row: BuildStageRow;
        Insert: BuildStageRow;
        Update: Partial<BuildStageRow>;
        Relationships: [];
      };
      project_stages: {
        Row: ProjectStageRow;
        Insert: Omit<ProjectStageRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ProjectStageRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      stage_photos: {
        Row: StagePhotoRow;
        Insert: Omit<StagePhotoRow, "id" | "uploaded_at">;
        Update: Partial<Omit<StagePhotoRow, "id" | "uploaded_at">>;
        Relationships: [];
      };
      stage_documents: {
        Row: StageDocumentRow;
        Insert: Omit<StageDocumentRow, "id" | "uploaded_at">;
        Update: Partial<Omit<StageDocumentRow, "id" | "uploaded_at">>;
        Relationships: [];
      };
      project_budget: {
        Row: ProjectBudgetRow;
        Insert: Omit<ProjectBudgetRow, "id">;
        Update: Partial<Omit<ProjectBudgetRow, "id">>;
        Relationships: [];
      };
      vendors: {
        Row: VendorRow;
        Insert: Omit<VendorRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<VendorRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      vendor_documents: {
        Row: VendorDocumentRow;
        Insert: Omit<VendorDocumentRow, "id" | "uploaded_at">;
        Update: Partial<Omit<VendorDocumentRow, "id" | "uploaded_at">>;
        Relationships: [];
      };
      purchase_orders: {
        Row: PurchaseOrderRow;
        Insert: Omit<PurchaseOrderRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<PurchaseOrderRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      contracts: {
        Row: ContractRow;
        Insert: Omit<ContractRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ContractRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      change_orders: {
        Row: ChangeOrderRow;
        Insert: Omit<ChangeOrderRow, "id" | "created_at">;
        Update: Partial<Omit<ChangeOrderRow, "id" | "created_at">>;
        Relationships: [];
      };
      invoices: {
        Row: InvoiceRow;
        Insert: Omit<InvoiceRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<InvoiceRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      invoice_files: {
        Row: InvoiceFileRow;
        Insert: Omit<InvoiceFileRow, "id" | "uploaded_at">;
        Update: Partial<Omit<InvoiceFileRow, "id" | "uploaded_at">>;
        Relationships: [];
      };
      loans: {
        Row: LoanRow;
        Insert: Omit<LoanRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<LoanRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      loan_draws: {
        Row: LoanDrawRow;
        Insert: Omit<LoanDrawRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<LoanDrawRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      loan_draw_items: {
        Row: LoanDrawItemRow;
        Insert: Omit<LoanDrawItemRow, "id">;
        Update: Partial<Omit<LoanDrawItemRow, "id">>;
        Relationships: [];
      };
      loan_payments: {
        Row: LoanPaymentRow;
        Insert: Omit<LoanPaymentRow, "id" | "created_at">;
        Update: Partial<Omit<LoanPaymentRow, "id" | "created_at">>;
        Relationships: [];
      };
      stages: {
        Row: StageRow;
        Insert: Omit<StageRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<StageRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      cost_items: {
        Row: CostItemRow;
        Insert: Omit<CostItemRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<CostItemRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      sales: {
        Row: SaleRow;
        Insert: Omit<SaleRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<SaleRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      milestones: {
        Row: MilestoneRow;
        Insert: Omit<MilestoneRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<MilestoneRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      field_logs: {
        Row: FieldLogRow;
        Insert: Omit<FieldLogRow, "id" | "created_at">;
        Update: Partial<Omit<FieldLogRow, "id" | "created_at">>;
        Relationships: [];
      };
      field_todos: {
        Row: FieldTodoRow;
        Insert: Omit<FieldTodoRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<FieldTodoRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, never>;
    Enums: {
      project_status: ProjectStatus;
      project_type: ProjectType;
      stage_status: StageStatus;
      invoice_status: InvoiceStatus;
    };
  };
}
