export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string;
          admin_id: string;
          business_type: string | null;
          country: string;
          created_at: string;
          currency: string | null;
          data: Json;
          deleted_at: string | null;
          email: string | null;
          id: string;
          is_charges_enabled: boolean;
          is_details_submitted: boolean;
          is_payouts_enabled: boolean;
          platform_fee_fixed: number | null;
          platform_fee_percent: number | null;
          processor_fees_applicable: boolean;
          status: string;
          stripe_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_type?: string;
          admin_id: string;
          business_type?: string | null;
          country: string;
          created_at?: string;
          currency?: string | null;
          data?: Json;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          is_charges_enabled?: boolean;
          is_details_submitted?: boolean;
          is_payouts_enabled?: boolean;
          platform_fee_fixed?: number | null;
          platform_fee_percent?: number | null;
          processor_fees_applicable?: boolean;
          status?: string;
          stripe_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_type?: string;
          admin_id?: string;
          business_type?: string | null;
          country?: string;
          created_at?: string;
          currency?: string | null;
          data?: Json;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          is_charges_enabled?: boolean;
          is_details_submitted?: boolean;
          is_payouts_enabled?: boolean;
          platform_fee_fixed?: number | null;
          platform_fee_percent?: number | null;
          processor_fees_applicable?: boolean;
          status?: string;
          stripe_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_admin_id_fkey";
            columns: ["admin_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      organizations: {
        Row: {
          account_id: string | null;
          avatar_url: string | null;
          blocked_at: string | null;
          created_at: string;
          customer_email_settings: Json;
          customer_invoice_next_number: number;
          customer_invoice_prefix: string;
          customer_portal_settings: Json;
          deleted_at: string | null;
          details: Json;
          details_submitted_at: string | null;
          email: string | null;
          feature_settings: Json;
          id: string;
          name: string;
          notification_settings: Json;
          onboarded_at: string | null;
          order_settings: Json;
          profile_settings: Json;
          slug: string;
          socials: Json;
          status: string;
          status_updated_at: string | null;
          subscription_settings: Json;
          subscriptions_billing_engine: boolean;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          account_id?: string | null;
          avatar_url?: string | null;
          blocked_at?: string | null;
          created_at?: string;
          customer_email_settings?: Json;
          customer_invoice_next_number?: number;
          customer_invoice_prefix?: string;
          customer_portal_settings?: Json;
          deleted_at?: string | null;
          details?: Json;
          details_submitted_at?: string | null;
          email?: string | null;
          feature_settings?: Json;
          id?: string;
          name: string;
          notification_settings?: Json;
          onboarded_at?: string | null;
          order_settings?: Json;
          profile_settings?: Json;
          slug: string;
          socials?: Json;
          status?: string;
          status_updated_at?: string | null;
          subscription_settings?: Json;
          subscriptions_billing_engine?: boolean;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          account_id?: string | null;
          avatar_url?: string | null;
          blocked_at?: string | null;
          created_at?: string;
          customer_email_settings?: Json;
          customer_invoice_next_number?: number;
          customer_invoice_prefix?: string;
          customer_portal_settings?: Json;
          deleted_at?: string | null;
          details?: Json;
          details_submitted_at?: string | null;
          email?: string | null;
          feature_settings?: Json;
          id?: string;
          name?: string;
          notification_settings?: Json;
          onboarded_at?: string | null;
          order_settings?: Json;
          profile_settings?: Json;
          slug?: string;
          socials?: Json;
          status?: string;
          status_updated_at?: string | null;
          subscription_settings?: Json;
          subscriptions_billing_engine?: boolean;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_organizations_account_id";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
      user_organizations: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          organization_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          organization_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          organization_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      users: {
        Row: {
          accepted_terms_at: string | null;
          accepted_terms_of_service: boolean;
          account_id: string | null;
          avatar_url: string | null;
          blocked_at: string | null;
          created_at: string;
          deleted_at: string | null;
          email: string;
          email_verified: boolean;
          id: string;
          identity_verification_id: string | null;
          identity_verification_status: string;
          is_admin: boolean;
          meta: Json;
          stripe_customer_id: string | null;
          updated_at: string;
        };
        Insert: {
          accepted_terms_at?: string | null;
          accepted_terms_of_service?: boolean;
          account_id?: string | null;
          avatar_url?: string | null;
          blocked_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          email_verified?: boolean;
          id: string;
          identity_verification_id?: string | null;
          identity_verification_status?: string;
          is_admin?: boolean;
          meta?: Json;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_terms_at?: string | null;
          accepted_terms_of_service?: boolean;
          account_id?: string | null;
          avatar_url?: string | null;
          blocked_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          email_verified?: boolean;
          id?: string;
          identity_verification_id?: string | null;
          identity_verification_status?: string;
          is_admin?: boolean;
          meta?: Json;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_users_account_id";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_organization_admin: {
        Args: { org_id: string; user_id: string };
        Returns: boolean;
      };
      is_organization_member: {
        Args: { org_id: string; user_id: string };
        Returns: boolean;
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
    : never = never
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
    : never = never
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
    : never = never
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
    : never = never
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
    : never = never
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
