export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      build_stages: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          baseline_end_date: string | null
          baseline_start_date: string | null
          created_at: string
          id: string
          notes: string | null
          planned_end_date: string | null
          planned_start_date: string | null
          project_id: string
          stage_name: string
          stage_number: number
          status: string
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          baseline_end_date?: string | null
          baseline_start_date?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          project_id: string
          stage_name: string
          stage_number: number
          status?: string
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          baseline_end_date?: string | null
          baseline_start_date?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          project_id?: string
          stage_name?: string
          stage_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          amount: number
          cost_code_id: string | null
          created_at: string
          description: string
          id: string
          notes: string | null
          project_id: string
          signed_date: string | null
          status: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          amount?: number
          cost_code_id?: string | null
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          project_id: string
          signed_date?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          cost_code_id?: string | null
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          project_id?: string
          signed_date?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: []
      }
      cost_codes: {
        Row: {
          category: Database["public"]["Enums"]["cost_category"]
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          project_type: Database["public"]["Enums"]["project_type"] | null
          sort_order: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["cost_category"]
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          project_type?: Database["public"]["Enums"]["project_type"] | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["cost_category"]
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          project_type?: Database["public"]["Enums"]["project_type"] | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cost_items: {
        Row: {
          actual_amount: number
          budgeted_amount: number
          category: Database["public"]["Enums"]["cost_category"]
          cost_code_id: string | null
          created_at: string
          description: string
          id: string
          invoice_date: string | null
          invoice_file_path: string | null
          invoice_number: string | null
          notes: string | null
          project_id: string
          stage_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          actual_amount?: number
          budgeted_amount?: number
          category?: Database["public"]["Enums"]["cost_category"]
          cost_code_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_date?: string | null
          invoice_file_path?: string | null
          invoice_number?: string | null
          notes?: string | null
          project_id: string
          stage_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          actual_amount?: number
          budgeted_amount?: number
          category?: Database["public"]["Enums"]["cost_category"]
          cost_code_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_date?: string | null
          invoice_file_path?: string | null
          invoice_number?: string | null
          notes?: string | null
          project_id?: string
          stage_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          file_name: string
          file_size_kb: number | null
          folder: string
          id: string
          mime_type: string | null
          notes: string | null
          project_id: string | null
          storage_path: string
          uploaded_by: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_kb?: number | null
          folder?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          project_id?: string | null
          storage_path: string
          uploaded_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_kb?: number | null
          folder?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          project_id?: string | null
          storage_path?: string
          uploaded_by?: string | null
          vendor_id?: string | null
        }
        Relationships: []
      }
      draw_invoices: {
        Row: {
          draw_id: string
          id: string
          invoice_id: string
        }
        Insert: {
          draw_id: string
          id?: string
          invoice_id: string
        }
        Update: {
          draw_id?: string
          id?: string
          invoice_id?: string
        }
        Relationships: []
      }
      field_logs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          log_date: string
          notes: string
          project_id: string
          project_stage_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          log_date?: string
          notes: string
          project_id: string
          project_stage_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          log_date?: string
          notes?: string
          project_id?: string
          project_stage_id?: string | null
        }
        Relationships: []
      }
      field_todos: {
        Row: {
          created_at: string
          created_by: string
          description: string
          due_date: string | null
          field_log_id: string | null
          id: string
          priority: string
          project_id: string
          resolved_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          due_date?: string | null
          field_log_id?: string | null
          id?: string
          priority?: string
          project_id: string
          resolved_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string | null
          field_log_id?: string | null
          id?: string
          priority?: string
          project_id?: string
          resolved_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      gl_entries: {
        Row: {
          amount: number
          created_at: string
          credit_account: string
          debit_account: string
          description: string
          entry_date: string
          id: string
          project_id: string | null
          source_id: string | null
          source_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          credit_account: string
          debit_account: string
          description: string
          entry_date?: string
          id?: string
          project_id?: string | null
          source_id?: string | null
          source_type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_account?: string
          debit_account?: string
          description?: string
          entry_date?: string
          id?: string
          project_id?: string | null
          source_id?: string | null
          source_type?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          ai_confidence: string
          ai_notes: string | null
          amount: number | null
          contract_id: string | null
          cost_code_id: string | null
          cost_item_id: string | null
          created_at: string
          due_date: string | null
          extracted_data: Json | null
          file_name: string
          file_path: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          payment_date: string | null
          payment_method: string | null
          processed: boolean
          project_id: string
          source: string
          status: string
          total_amount: number | null
          updated_at: string
          vendor: string | null
          vendor_id: string | null
        }
        Insert: {
          ai_confidence?: string
          ai_notes?: string | null
          amount?: number | null
          contract_id?: string | null
          cost_code_id?: string | null
          cost_item_id?: string | null
          created_at?: string
          due_date?: string | null
          extracted_data?: Json | null
          file_name: string
          file_path: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          payment_date?: string | null
          payment_method?: string | null
          processed?: boolean
          project_id: string
          source?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          vendor?: string | null
          vendor_id?: string | null
        }
        Update: {
          ai_confidence?: string
          ai_notes?: string | null
          amount?: number | null
          contract_id?: string | null
          cost_code_id?: string | null
          cost_item_id?: string | null
          created_at?: string
          due_date?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_path?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          payment_date?: string | null
          payment_method?: string | null
          processed?: boolean
          project_id?: string
          source?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          vendor?: string | null
          vendor_id?: string | null
        }
        Relationships: []
      }
      loan_draws: {
        Row: {
          created_at: string
          draw_date: string
          draw_number: number
          id: string
          lender_id: string | null
          notes: string | null
          project_id: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          draw_date?: string
          draw_number: number
          id?: string
          lender_id?: string | null
          notes?: string | null
          project_id: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          draw_date?: string
          draw_number?: number
          id?: string
          lender_id?: string | null
          notes?: string | null
          project_id?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      milestones: {
        Row: {
          completed_date: string | null
          created_at: string
          due_date: string | null
          id: string
          is_completed: boolean
          name: string
          notes: string | null
          project_id: string
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean
          name: string
          notes?: string | null
          project_id: string
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean
          name?: string
          notes?: string | null
          project_id?: string
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          reference_type: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          lender_id: string | null
          name: string
          project_type: Database["public"]["Enums"]["project_type"]
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          subdivision: string | null
          total_budget: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          lender_id?: string | null
          name: string
          project_type?: Database["public"]["Enums"]["project_type"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          subdivision?: string | null
          total_budget?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          lender_id?: string | null
          name?: string
          project_type?: Database["public"]["Enums"]["project_type"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          subdivision?: string | null
          total_budget?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          buyer_name: string | null
          contract_price: number | null
          created_at: string
          deposit_amount: number | null
          deposit_received_date: string | null
          description: string
          id: string
          is_settled: boolean
          notes: string | null
          project_id: string
          sale_type: Database["public"]["Enums"]["sale_type"]
          settled_amount: number | null
          settled_date: string | null
          settlement_date: string | null
          updated_at: string
        }
        Insert: {
          buyer_name?: string | null
          contract_price?: number | null
          created_at?: string
          deposit_amount?: number | null
          deposit_received_date?: string | null
          description: string
          id?: string
          is_settled?: boolean
          notes?: string | null
          project_id: string
          sale_type?: Database["public"]["Enums"]["sale_type"]
          settled_amount?: number | null
          settled_date?: string | null
          settlement_date?: string | null
          updated_at?: string
        }
        Update: {
          buyer_name?: string | null
          contract_price?: number | null
          created_at?: string
          deposit_amount?: number | null
          deposit_received_date?: string | null
          description?: string
          id?: string
          is_settled?: boolean
          notes?: string | null
          project_id?: string
          sale_type?: Database["public"]["Enums"]["sale_type"]
          settled_amount?: number | null
          settled_date?: string | null
          settlement_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      selections: {
        Row: {
          category: string
          cost_code_id: string | null
          created_at: string
          id: string
          item_name: string
          notes: string | null
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          cost_code_id?: string | null
          created_at?: string
          id?: string
          item_name: string
          notes?: string | null
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          cost_code_id?: string | null
          created_at?: string
          id?: string
          item_name?: string
          notes?: string | null
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          budget: number
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          order_index: number
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["stage_status"]
          updated_at: string
        }
        Insert: {
          budget?: number
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          order_index?: number
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          updated_at?: string
        }
        Update: {
          budget?: number
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          order_index?: number
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          updated_at?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          coi_expiry_date: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          license_expiry_date: string | null
          name: string
          notes: string | null
          phone: string | null
          trade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          coi_expiry_date?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          license_expiry_date?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          trade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          coi_expiry_date?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          license_expiry_date?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          trade?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      cost_category:
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
        | "other"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      project_type: "land_development" | "home_construction"
      sale_type:
        | "lot_sale"
        | "house_sale"
        | "progress_payment"
        | "deposit"
        | "variation"
        | "other"
      stage_status: "not_started" | "in_progress" | "completed" | "blocked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"]
export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      cost_category: ["land","siteworks","foundation","framing","roofing","electrical","plumbing","hvac","insulation","drywall","flooring","cabinetry","painting","landscaping","permits","professional_fees","contingency","other"],
      project_status: ["planning","active","on_hold","completed","cancelled"],
      project_type: ["land_development","home_construction"],
      sale_type: ["lot_sale","house_sale","progress_payment","deposit","variation","other"],
      stage_status: ["not_started","in_progress","completed","blocked"],
    },
  },
} as const
