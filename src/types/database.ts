export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
export type StageStatus = "not_started" | "in_progress" | "completed" | "blocked";
export type CostCategory =
  | "land"
  | "siteworks"
  | "foundation"
  | "framing"
  | "roofing"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "insulation"
  | "drywall"
  | "flooring"
  | "cabinetry"
  | "painting"
  | "landscaping"
  | "permits"
  | "professional_fees"
  | "contingency"
  | "other";

interface ProjectRow {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  status: ProjectStatus;
  total_budget: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

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

interface InvoiceRow {
  id: string;
  project_id: string;
  cost_item_id: string | null;
  file_path: string;
  file_name: string;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  extracted_data: Json | null;
  processed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: ProjectRow;
        Insert: Omit<ProjectRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ProjectRow, "id" | "created_at" | "updated_at">>;
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
      invoices: {
        Row: InvoiceRow;
        Insert: Omit<InvoiceRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<InvoiceRow, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, never>;
    Enums: {
      project_status: ProjectStatus;
      stage_status: StageStatus;
      cost_category: CostCategory;
    };
  };
}
