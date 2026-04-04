export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          account_last_four: string | null
          account_name: string
          account_type: string | null
          bank_name: string
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
        }
        Insert: {
          account_last_four?: string | null
          account_name: string
          account_type?: string | null
          bank_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
        }
        Update: {
          account_last_four?: string | null
          account_name?: string
          account_type?: string | null
          bank_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
        }
        Relationships: []
      }
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
          track: string | null
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
          track?: string | null
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
          track?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_number: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          subtype: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          account_number: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          subtype?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          account_number?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          subtype?: string | null
          type?: string
          user_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "contracts_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_codes: {
        Row: {
          category: Database["public"]["Enums"]["cost_category"]
          code: string
          created_at: string
          gl_account_id: string | null
          id: string
          is_active: boolean
          name: string
          project_type: Database["public"]["Enums"]["project_type"] | null
          sort_order: number | null
          updated_at: string
          user_id: string | null
          wip_treatment: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["cost_category"]
          code: string
          created_at?: string
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          project_type?: Database["public"]["Enums"]["project_type"] | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
          wip_treatment?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["cost_category"]
          code?: string
          created_at?: string
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          project_type?: Database["public"]["Enums"]["project_type"] | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
          wip_treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_codes_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "cost_items_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_items_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "draw_invoices_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "loan_draws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "field_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "field_todos_field_log_id_fkey"
            columns: ["field_log_id"]
            isOneToOne: false
            referencedRelation: "field_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_todos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "gl_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number | null
          cost_code: string | null
          created_at: string
          description: string | null
          id: string
          invoice_id: string
        }
        Insert: {
          amount?: number | null
          cost_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
        }
        Update: {
          amount?: number | null
          cost_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_cost_code_fkey"
            columns: ["cost_code"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
          email_message_id: string | null
          extracted_data: Json | null
          file_name: string | null
          file_path: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          manually_reviewed: boolean
          payment_date: string | null
          payment_method: string | null
          pending_draw: boolean
          processed: boolean
          project_id: string | null
          source: string
          status: string
          total_amount: number | null
          updated_at: string
          user_id: string | null
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
          email_message_id?: string | null
          extracted_data?: Json | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          manually_reviewed?: boolean
          payment_date?: string | null
          payment_method?: string | null
          pending_draw?: boolean
          processed?: boolean
          project_id?: string | null
          source?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
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
          email_message_id?: string | null
          extracted_data?: Json | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          manually_reviewed?: boolean
          payment_date?: string | null
          payment_method?: string | null
          pending_draw?: boolean
          processed?: boolean
          project_id?: string | null
          source?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
          vendor?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          description: string
          entry_date: string
          id: string
          reference: string | null
          source_id: string | null
          source_type: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          entry_date: string
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          entry_date?: string
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          project_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          project_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_draws: {
        Row: {
          created_at: string
          draw_date: string
          draw_number: number
          id: string
          lender_id: string | null
          loan_id: string | null
          notes: string | null
          project_id: string | null
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
          loan_id?: string | null
          notes?: string | null
          project_id?: string | null
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
          loan_id?: string | null
          notes?: string | null
          project_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_draws_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_draws_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_draws_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          coa_account_id: string | null
          created_at: string
          credit_limit: number | null
          current_balance: number | null
          id: string
          interest_rate: number | null
          lender_id: string
          loan_amount: number
          loan_number: string
          loan_type: string
          maturity_date: string | null
          notes: string | null
          origination_date: string | null
          project_id: string
          status: string
        }
        Insert: {
          coa_account_id?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          id?: string
          interest_rate?: number | null
          lender_id: string
          loan_amount: number
          loan_number: string
          loan_type?: string
          maturity_date?: string | null
          notes?: string | null
          origination_date?: string | null
          project_id: string
          status?: string
        }
        Update: {
          coa_account_id?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          id?: string
          interest_rate?: number | null
          lender_id?: string
          loan_amount?: number
          loan_number?: string
          loan_type?: string
          maturity_date?: string | null
          notes?: string | null
          origination_date?: string | null
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
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
      project_cost_codes: {
        Row: {
          budgeted_amount: number
          cost_code_id: string
          created_at: string
          id: string
          notes: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          budgeted_amount?: number
          cost_code_id: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          budgeted_amount?: number
          cost_code_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_codes_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cost_codes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_phases: {
        Row: {
          created_at: string
          id: string
          lots_sold: number
          name: string | null
          notes: string | null
          number_of_lots: number | null
          phase_number: number | null
          project_id: string
          size_acres: number | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          lots_sold?: number
          name?: string | null
          notes?: string | null
          number_of_lots?: number | null
          phase_number?: number | null
          project_id: string
          size_acres?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          lots_sold?: number
          name?: string | null
          notes?: string | null
          number_of_lots?: number | null
          phase_number?: number | null
          project_id?: string
          size_acres?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          block: string | null
          created_at: string
          description: string | null
          end_date: string | null
          home_size_sf: number | null
          id: string
          lender_id: string | null
          lot: string | null
          lot_size_acres: number | null
          name: string
          number_of_lots: number | null
          number_of_phases: number | null
          plan: string | null
          project_type: Database["public"]["Enums"]["project_type"]
          size_acres: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          subdivision: string | null
          total_budget: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          block?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          home_size_sf?: number | null
          id?: string
          lender_id?: string | null
          lot?: string | null
          lot_size_acres?: number | null
          name: string
          number_of_lots?: number | null
          number_of_phases?: number | null
          plan?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          size_acres?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          subdivision?: string | null
          total_budget?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          block?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          home_size_sf?: number | null
          id?: string
          lender_id?: string | null
          lot?: string | null
          lot_size_acres?: number | null
          name?: string
          number_of_lots?: number | null
          number_of_phases?: number | null
          plan?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          size_acres?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          subdivision?: string | null
          total_budget?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "sales_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "selections_cost_code_id_fkey"
            columns: ["cost_code_id"]
            isOneToOne: false
            referencedRelation: "cost_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          accounting_contact_email: string | null
          accounting_contact_name: string | null
          accounting_contact_phone: string | null
          ach_account_number: string | null
          ach_account_type: string | null
          ach_bank_name: string | null
          ach_routing_number: string | null
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
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          trade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accounting_contact_email?: string | null
          accounting_contact_name?: string | null
          accounting_contact_phone?: string | null
          ach_account_number?: string | null
          ach_account_type?: string | null
          ach_bank_name?: string | null
          ach_routing_number?: string | null
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
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          trade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accounting_contact_email?: string | null
          accounting_contact_name?: string | null
          accounting_contact_phone?: string | null
          ach_account_number?: string | null
          ach_account_type?: string | null
          ach_bank_name?: string | null
          ach_routing_number?: string | null
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
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
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
      generate_notifications: { Args: never; Returns: Json }
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
        | "general_admin"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      project_type: "land_development" | "home_construction" | "general_admin"
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cost_category: [
        "land",
        "siteworks",
        "foundation",
        "framing",
        "roofing",
        "electrical",
        "plumbing",
        "hvac",
        "insulation",
        "drywall",
        "flooring",
        "cabinetry",
        "painting",
        "landscaping",
        "permits",
        "professional_fees",
        "contingency",
        "other",
        "general_admin",
      ],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      project_type: ["land_development", "home_construction", "general_admin"],
      sale_type: [
        "lot_sale",
        "house_sale",
        "progress_payment",
        "deposit",
        "variation",
        "other",
      ],
      stage_status: ["not_started", "in_progress", "completed", "blocked"],
    },
  },
} as const
