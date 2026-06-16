export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: string;
          actual_balance_minor: number;
          currency: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type: string;
          actual_balance_minor?: number;
          currency?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: string;
          actual_balance_minor?: number;
          currency?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
          // ↓ Added by Story 1.7 (0007_profiles_display_name.sql)
          display_name: string | null;
          // ↓ Added by Story 1.8
          currency: string;
          onboarding_step: number;
          onboarding_completed_at: string | null;
          // ↓ Added by Story 1.9
          checklist_completed_at: string | null;
          // ↓ Added by Story 6.3
          chart_preferences: Record<string, boolean> | null;
          // ↓ Added by Story 7.5
          transaction_defaults: {
            defaultType?: string;
            defaultSplitMethod?: string;
          } | null;
          // ↓ Added by Story 9.2
          reminder_enabled: boolean;
          reminder_time: string | null;
          reminder_timezone: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
          // ↓ Added by Story 1.7
          display_name?: string | null;
          // ↓ Added by Story 1.8
          currency?: string;
          onboarding_step?: number;
          onboarding_completed_at?: string | null;
          // ↓ Added by Story 1.9
          checklist_completed_at?: string | null;
          // ↓ Added by Story 6.3
          chart_preferences?: Record<string, boolean> | null;
          // ↓ Added by Story 7.5
          transaction_defaults?: Record<string, string> | null;
          // ↓ Added by Story 9.2
          reminder_enabled?: boolean;
          reminder_time?: string | null;
          reminder_timezone?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
          // ↓ Added by Story 1.7
          display_name?: string | null;
          // ↓ Added by Story 1.8
          currency?: string;
          onboarding_step?: number;
          onboarding_completed_at?: string | null;
          // ↓ Added by Story 1.9
          checklist_completed_at?: string | null;
          // ↓ Added by Story 6.3
          chart_preferences?: Record<string, boolean> | null;
          // ↓ Added by Story 7.5
          transaction_defaults?: Record<string, string> | null;
          // ↓ Added by Story 9.2
          reminder_enabled?: boolean;
          reminder_time?: string | null;
          reminder_timezone?: string | null;
        };
        Relationships: [];
      };
      // ↓ Added by Story 1.10
      transactions: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          category_id: string;
          amount_minor: number;
          date: string;
          note: string | null;
          type: string;
          created_at: string;
          updated_at: string;
          // ↓ Added by Story 5.1
          macro_application_id: string | null;
          // ↓ Added by Story 7.1a
          is_shared: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          category_id: string;
          amount_minor: number;
          date: string;
          note?: string | null;
          type: string;
          created_at?: string;
          updated_at?: string;
          // ↓ Added by Story 5.1
          macro_application_id?: string | null;
          // ↓ Added by Story 7.1a
          is_shared?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          account_id?: string;
          category_id?: string;
          amount_minor?: number;
          date?: string;
          note?: string | null;
          type?: string;
          created_at?: string;
          updated_at?: string;
          // ↓ Added by Story 5.1
          macro_application_id?: string | null;
          // ↓ Added by Story 7.1a
          is_shared?: boolean;
        };
        Relationships: [];
      };
      // ↓ Added by Story 4.5 (is_shared added by Story 7.1b)
      goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_minor: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          is_shared: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          target_minor: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          is_shared?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          target_minor?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          is_shared?: boolean;
        };
        Relationships: [];
      };
      // ↓ Added by Story 5.1
      macros: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount_minor: number;
          account_id: string | null;
          goal_id: string | null;
          category_id: string;
          last_used_at: string | null;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          amount_minor: number;
          account_id?: string | null;
          goal_id?: string | null;
          category_id: string;
          last_used_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          amount_minor?: number;
          account_id?: string | null;
          goal_id?: string | null;
          category_id?: string;
          last_used_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // ↓ Added by Story 5.3
      goal_contributions: {
        Row: {
          id: string;
          goal_id: string;
          user_id: string;
          amount_minor: number;
          date: string;
          created_at: string;
          macro_application_id: string | null;
        };
        Insert: {
          id?: string;
          goal_id: string;
          user_id: string;
          amount_minor: number;
          date?: string;
          created_at?: string;
          macro_application_id?: string | null;
        };
        Update: {
          id?: string;
          goal_id?: string;
          user_id?: string;
          amount_minor?: number;
          date?: string;
          created_at?: string;
          macro_application_id?: string | null;
        };
        Relationships: [];
      };
      // ↓ Added by Story 7.2
      invite_codes: {
        Row: {
          id: string;
          family_unit_id: string;
          creator_id: string;
          code_hash: string;
          expires_at: string;
          used_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_unit_id: string;
          creator_id: string;
          code_hash: string;
          expires_at: string;
          used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_unit_id?: string;
          creator_id?: string;
          code_hash?: string;
          expires_at?: string;
          used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // ↓ Added by Story 7.2
      redemption_attempts: {
        Row: {
          id: string;
          user_id: string;
          attempted_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          attempted_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          attempted_at?: string;
        };
        Relationships: [];
      };
      // ↓ Added by Story 7.1a
      family_units: {
        Row: {
          id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      // ↓ Added by Story 7.6
      transaction_splits: {
        Row: {
          id: string;
          transaction_id: string;
          payer_id: string;
          payer_share_minor: number;
          partner_share_minor: number;
          split_method: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          payer_id: string;
          payer_share_minor: number;
          partner_share_minor: number;
          split_method: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          transaction_id?: string;
          payer_id?: string;
          payer_share_minor?: number;
          partner_share_minor?: number;
          split_method?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      // ↓ Added by Story 8.1
      settlements: {
        Row: {
          id: string;
          family_unit_id: string;
          settled_by_id: string;
          amount_minor: number;
          direction: "a_to_b" | "b_to_a";
          settled_at: string;
          period_label: string;
        };
        Insert: {
          id?: string;
          family_unit_id: string;
          settled_by_id: string;
          amount_minor: number;
          direction: "a_to_b" | "b_to_a";
          settled_at?: string;
          period_label: string;
        };
        Update: {
          id?: string;
          family_unit_id?: string;
          settled_by_id?: string;
          amount_minor?: number;
          direction?: "a_to_b" | "b_to_a";
          settled_at?: string;
          period_label?: string;
        };
        Relationships: [];
      };
      // ↓ Added by Story 8.3
      reconciliation_adjustments: {
        Row: {
          id: string;
          family_unit_id: string;
          account_id: string;
          transaction_id: string | null;
          delta_minor: number;
          note: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_unit_id: string;
          account_id: string;
          transaction_id?: string | null;
          delta_minor: number;
          note?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_unit_id?: string;
          account_id?: string;
          transaction_id?: string | null;
          delta_minor?: number;
          note?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      // ↓ Added by Story 9.1
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type:
            | "logging_reminder"
            | "budget_threshold"
            | "month_end_summary"
            | "partner_shared_transaction";
          title: string;
          body: string;
          link: string | null;
          metadata: Record<string, unknown>;
          read_at: string | null;
          dismissed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type:
            | "logging_reminder"
            | "budget_threshold"
            | "month_end_summary"
            | "partner_shared_transaction";
          title: string;
          body: string;
          link?: string | null;
          metadata?: Record<string, unknown>;
          read_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
          dismissed_at?: string | null;
        };
        Relationships: [];
      };
      // ↓ Added by Story 4.2; extended by Story 9.3 (budget_limit_minor)
      budget_threshold_events: {
        Row: {
          id: string;
          budget_id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          pct_used: number;
          actual_minor: number;
          budget_limit_minor: number;
          fired_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          budget_id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          pct_used: number;
          actual_minor: number;
          budget_limit_minor?: number;
          fired_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          budget_id?: string;
          user_id?: string;
          period_start?: string;
          period_end?: string;
          pct_used?: number;
          actual_minor?: number;
          budget_limit_minor?: number;
          fired_at?: string;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      // ↓ Added by Story 7.1a
      family_members: {
        Row: {
          id: string;
          family_unit_id: string;
          user_id: string;
          join_date: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          family_unit_id: string;
          user_id: string;
          join_date: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          family_unit_id?: string;
          user_id?: string;
          join_date?: string;
          joined_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      // ↓ Added by Story 1.10; updated 0013 (+p_subcategory_id); updated 0026 (+p_is_shared); updated 0027 (returns UUID)
      rpc_log_transaction: {
        Args: {
          p_account_id: string;
          p_category_id: string;
          p_amount_minor: number;
          p_date: string;
          p_note?: string | null;
          p_subcategory_id?: string | null;
          p_is_shared?: boolean;
        };
        Returns: string;
      };
      // ↓ Added by Story 7.6
      rpc_split_transaction: {
        Args: {
          p_transaction_id: string;
          p_split_method: string;
          p_payer_id: string;
          p_payer_share_minor: number;
          p_partner_share_minor: number;
        };
        Returns: undefined;
      };
      rpc_apply_macro: {
        Args: { p_macro_id: string; p_date?: string };
        Returns: string;
      };
      // ↓ Added by Story 7.1b
      auth_can_view_transaction: {
        Args: {
          p_owner_id: string;
          p_is_shared: boolean;
          p_created_date: string;
        };
        Returns: boolean;
      };
      // ↓ Added by Story 7.2
      rpc_generate_invite: {
        Args: { p_code_hash: string; p_expires_at: string };
        Returns: undefined;
      };
      rpc_revoke_invite: {
        Args: { p_invite_id: string };
        Returns: undefined;
      };
      rpc_preview_invite: {
        Args: { p_code_hash: string };
        Returns: string | null;
      };
      rpc_redeem_invite: {
        Args: { p_code_hash: string };
        Returns: undefined;
      };
      rpc_get_family_status: {
        Args: Record<string, never>;
        Returns: Record<string, unknown>;
      };
      // ↓ Added by Story 7.7
      rpc_edit_shared_transaction: {
        Args: {
          p_transaction_id: string;
          p_note: string | null;
          p_category_id: string;
        };
        Returns: undefined;
      };
      rpc_get_transaction_owner_categories: {
        Args: { p_transaction_id: string };
        Returns: { cat_id: string; name: string; type: string }[];
      };
      // ↓ Added by Story 7.8
      rpc_reclassify_transaction: {
        Args: { p_transaction_id: string; p_new_is_shared: boolean };
        Returns: undefined;
      };
      // ↓ Added by Story 8.1
      rpc_settle_up: {
        Args: { p_family_unit_id: string };
        Returns: number;
      };
      // ↓ Added by Story 8.2
      rpc_mark_settled: {
        Args: { p_family_unit_id: string };
        Returns: string; // UUID of the settlement record
      };
      // ↓ Added by Story 8.3
      rpc_reconciliation_adjustment: {
        Args: {
          p_family_unit_id: string;
          p_account_id: string;
          p_delta_minor: number;
          p_note?: string | null;
          p_transaction_id?: string | null;
        };
        Returns: string; // UUID of the new reconciliation_adjustments row
      };
      // ↓ Added by Story 9.3
      rpc_process_budget_threshold_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      // ↓ Added by Story 9.4
      rpc_send_month_end_summary_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      // ↓ Added by Story 7.9
      rpc_get_contribution_analysis: {
        Args: { p_period_start?: string | null; p_period_end?: string | null };
        Returns: {
          contributor_id: string;
          total_paid_minor: number;
          transaction_count: number;
          goal_contribution_minor: number;
        }[];
      };
      // ↓ Added by Story 9.5
      rpc_notify_partner_shared_transaction: {
        Args: { p_transaction_id: string };
        Returns: void;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
