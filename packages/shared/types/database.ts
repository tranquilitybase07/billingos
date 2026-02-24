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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string
          admin_id: string
          business_type: string | null
          country: string
          created_at: string
          currency: string | null
          data: Json
          deleted_at: string | null
          email: string | null
          id: string
          is_charges_enabled: boolean
          is_details_submitted: boolean
          is_payouts_enabled: boolean
          platform_fee_fixed: number | null
          platform_fee_percent: number | null
          processor_fees_applicable: boolean
          status: string
          stripe_id: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string
          admin_id: string
          business_type?: string | null
          country: string
          created_at?: string
          currency?: string | null
          data?: Json
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_charges_enabled?: boolean
          is_details_submitted?: boolean
          is_payouts_enabled?: boolean
          platform_fee_fixed?: number | null
          platform_fee_percent?: number | null
          processor_fees_applicable?: boolean
          status?: string
          stripe_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          admin_id?: string
          business_type?: string | null
          country?: string
          created_at?: string
          currency?: string | null
          data?: Json
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_charges_enabled?: boolean
          is_details_submitted?: boolean
          is_payouts_enabled?: boolean
          platform_fee_fixed?: number | null
          platform_fee_percent?: number | null
          processor_fees_applicable?: boolean
          status?: string
          stripe_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          environment: string
          id: string
          key_hash: string
          key_pair_id: string | null
          key_prefix: string
          key_type: string
          last_used_at: string | null
          name: string | null
          organization_id: string
          revoked_at: string | null
          signing_secret: string
        }
        Insert: {
          created_at?: string
          environment: string
          id?: string
          key_hash: string
          key_pair_id?: string | null
          key_prefix: string
          key_type: string
          last_used_at?: string | null
          name?: string | null
          organization_id: string
          revoked_at?: string | null
          signing_secret: string
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          key_hash?: string
          key_pair_id?: string | null
          key_prefix?: string
          key_type?: string
          last_used_at?: string | null
          name?: string | null
          organization_id?: string
          revoked_at?: string | null
          signing_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_metadata: {
        Row: {
          billing_interval: string | null
          billing_interval_count: number | null
          cancel_url: string | null
          checkout_session_id: string | null
          completed_at: string | null
          created_at: string | null
          currency: string
          customer_email: string
          customer_id: string | null
          customer_name: string | null
          discount_code: string | null
          discount_percentage: number | null
          expires_at: string | null
          features_to_grant: Json | null
          id: string
          metadata: Json | null
          organization_id: string
          payment_method_types: Json | null
          price_amount: number
          price_id: string
          product_id: string
          product_name: string
          should_grant_trial: boolean | null
          status: string | null
          subscription_id: string | null
          success_url: string | null
          trial_period_days: number | null
          updated_at: string | null
        }
        Insert: {
          billing_interval?: string | null
          billing_interval_count?: number | null
          cancel_url?: string | null
          checkout_session_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          currency?: string
          customer_email: string
          customer_id?: string | null
          customer_name?: string | null
          discount_code?: string | null
          discount_percentage?: number | null
          expires_at?: string | null
          features_to_grant?: Json | null
          id?: string
          metadata?: Json | null
          organization_id: string
          payment_method_types?: Json | null
          price_amount: number
          price_id: string
          product_id: string
          product_name: string
          should_grant_trial?: boolean | null
          status?: string | null
          subscription_id?: string | null
          success_url?: string | null
          trial_period_days?: number | null
          updated_at?: string | null
        }
        Update: {
          billing_interval?: string | null
          billing_interval_count?: number | null
          cancel_url?: string | null
          checkout_session_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          currency?: string
          customer_email?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_code?: string | null
          discount_percentage?: number | null
          expires_at?: string | null
          features_to_grant?: Json | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          payment_method_types?: Json | null
          price_amount?: number
          price_id?: string
          product_id?: string
          product_name?: string
          should_grant_trial?: boolean | null
          status?: string | null
          subscription_id?: string | null
          success_url?: string | null
          trial_period_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_metadata_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_metadata_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_metadata_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_metadata_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_metadata_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_metadata_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_external_id: string | null
          customer_name: string | null
          expires_at: string
          id: string
          idempotency_key: string | null
          metadata: Json | null
          metadata_id: string | null
          organization_id: string
          payment_intent_id: string | null
          product_id: string | null
          session_token: string
          status: string | null
          subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_external_id?: string | null
          customer_name?: string | null
          expires_at: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          metadata_id?: string | null
          organization_id: string
          payment_intent_id?: string | null
          product_id?: string | null
          session_token: string
          status?: string | null
          subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_external_id?: string | null
          customer_name?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          metadata_id?: string | null
          organization_id?: string
          payment_intent_id?: string | null
          product_id?: string | null
          session_token?: string
          status?: string | null
          subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_metadata_id_fkey"
            columns: ["metadata_id"]
            isOneToOne: false
            referencedRelation: "checkout_metadata"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_address: Json | null
          created_at: string | null
          deleted_at: string | null
          email: string
          email_verified: boolean
          external_id: string | null
          id: string
          metadata: Json | null
          name: string | null
          organization_id: string
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          billing_address?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          email: string
          email_verified?: boolean
          external_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          organization_id: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_address?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          email_verified?: boolean
          external_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          organization_id?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_products: {
        Row: {
          created_at: string
          discount_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          discount_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          discount_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_products_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          amount: number | null
          basis_points: number | null
          code: string | null
          created_at: string
          currency: string | null
          deleted_at: string | null
          duration: string
          duration_in_months: number | null
          id: string
          max_redemptions: number | null
          name: string
          organization_id: string
          redemptions_count: number
          stripe_coupon_id: string | null
          stripe_promotion_code_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          basis_points?: number | null
          code?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          duration?: string
          duration_in_months?: number | null
          id?: string
          max_redemptions?: number | null
          name: string
          organization_id: string
          redemptions_count?: number
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          basis_points?: number | null
          code?: string | null
          created_at?: string
          currency?: string | null
          deleted_at?: string | null
          duration?: string
          duration_in_months?: number | null
          id?: string
          max_redemptions?: number | null
          name?: string
          organization_id?: string
          redemptions_count?: number
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_grants: {
        Row: {
          created_at: string | null
          customer_id: string
          feature_id: string
          granted_at: string | null
          id: string
          properties: Json | null
          revoked_at: string | null
          stripe_active_entitlement_id: string | null
          stripe_sync_status: string | null
          stripe_synced_at: string | null
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          feature_id: string
          granted_at?: string | null
          id?: string
          properties?: Json | null
          revoked_at?: string | null
          stripe_active_entitlement_id?: string | null
          stripe_sync_status?: string | null
          stripe_synced_at?: string | null
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          feature_id?: string
          granted_at?: string | null
          id?: string
          properties?: Json | null
          revoked_at?: string | null
          stripe_active_entitlement_id?: string | null
          stripe_sync_status?: string | null
          stripe_synced_at?: string | null
          subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_grants_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_grants_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_grants_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features_needing_sync"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_grants_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          name: string
          organization_id: string
          properties: Json | null
          stripe_feature_id: string | null
          stripe_sync_status: string | null
          stripe_synced_at: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          name: string
          organization_id: string
          properties?: Json | null
          stripe_feature_id?: string | null
          stripe_sync_status?: string | null
          stripe_synced_at?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          organization_id?: string
          properties?: Json | null
          stripe_feature_id?: string | null
          stripe_sync_status?: string | null
          stripe_synced_at?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "features_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          account_id: string | null
          avatar_url: string | null
          blocked_at: string | null
          created_at: string
          customer_email_settings: Json
          customer_invoice_next_number: number
          customer_invoice_prefix: string
          customer_portal_settings: Json
          deleted_at: string | null
          details: Json
          details_submitted_at: string | null
          email: string | null
          feature_settings: Json
          id: string
          name: string
          notification_settings: Json
          onboarded_at: string | null
          order_settings: Json
          profile_settings: Json
          slug: string
          socials: Json
          status: string
          status_updated_at: string | null
          subscription_settings: Json
          subscriptions_billing_engine: boolean
          updated_at: string
          website: string | null
        }
        Insert: {
          account_id?: string | null
          avatar_url?: string | null
          blocked_at?: string | null
          created_at?: string
          customer_email_settings?: Json
          customer_invoice_next_number?: number
          customer_invoice_prefix?: string
          customer_portal_settings?: Json
          deleted_at?: string | null
          details?: Json
          details_submitted_at?: string | null
          email?: string | null
          feature_settings?: Json
          id?: string
          name: string
          notification_settings?: Json
          onboarded_at?: string | null
          order_settings?: Json
          profile_settings?: Json
          slug: string
          socials?: Json
          status?: string
          status_updated_at?: string | null
          subscription_settings?: Json
          subscriptions_billing_engine?: boolean
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_id?: string | null
          avatar_url?: string | null
          blocked_at?: string | null
          created_at?: string
          customer_email_settings?: Json
          customer_invoice_next_number?: number
          customer_invoice_prefix?: string
          customer_portal_settings?: Json
          deleted_at?: string | null
          details?: Json
          details_submitted_at?: string | null
          email?: string | null
          feature_settings?: Json
          id?: string
          name?: string
          notification_settings?: Json
          onboarded_at?: string | null
          order_settings?: Json
          profile_settings?: Json
          slug?: string
          socials?: Json
          status?: string
          status_updated_at?: string | null
          subscription_settings?: Json
          subscriptions_billing_engine?: boolean
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_organizations_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount: number
          application_fee_amount: number | null
          client_secret: string
          created_at: string | null
          currency: string
          customer_id: string | null
          id: string
          metadata: Json | null
          organization_id: string
          price_id: string | null
          product_id: string | null
          status: string
          stripe_account_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          application_fee_amount?: number | null
          client_secret: string
          created_at?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          price_id?: string | null
          product_id?: string | null
          status: string
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          application_fee_amount?: number | null
          client_secret?: string
          created_at?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          accessed_at: string | null
          created_at: string
          customer_id: string
          expires_at: string
          external_user_id: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          organization_id: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string | null
          created_at?: string
          customer_id: string
          expires_at: string
          external_user_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string
          external_user_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_features: {
        Row: {
          config: Json | null
          created_at: string | null
          display_order: number
          feature_id: string
          product_id: string
          stripe_product_feature_id: string | null
          stripe_synced: boolean | null
          stripe_synced_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          display_order: number
          feature_id: string
          product_id: string
          stripe_product_feature_id?: string | null
          stripe_synced?: boolean | null
          stripe_synced_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          display_order?: number
          feature_id?: string
          product_id?: string
          stripe_product_feature_id?: string | null
          stripe_synced?: boolean | null
          stripe_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features_needing_sync"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          amount_type: string
          created_at: string | null
          id: string
          is_archived: boolean | null
          price_amount: number | null
          price_currency: string | null
          product_id: string
          recurring_interval: string
          recurring_interval_count: number | null
          stripe_price_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount_type: string
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          price_amount?: number | null
          price_currency?: string | null
          product_id: string
          recurring_interval: string
          recurring_interval_count?: number | null
          stripe_price_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_type?: string
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          price_amount?: number | null
          price_currency?: string | null
          product_id?: string
          recurring_interval?: string
          recurring_interval_count?: number | null
          stripe_price_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          latest_version_id: string | null
          metadata: Json | null
          name: string
          organization_id: string
          parent_product_id: string | null
          recurring_interval: string
          recurring_interval_count: number
          stripe_product_id: string | null
          trial_days: number | null
          updated_at: string | null
          version: number
          version_created_at: string | null
          version_created_reason: string | null
          version_status: string | null
          visible_in_pricing_table: boolean
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          latest_version_id?: string | null
          metadata?: Json | null
          name: string
          organization_id: string
          parent_product_id?: string | null
          recurring_interval: string
          recurring_interval_count?: number
          stripe_product_id?: string | null
          trial_days?: number | null
          updated_at?: string | null
          version?: number
          version_created_at?: string | null
          version_created_reason?: string | null
          version_status?: string | null
          visible_in_pricing_table?: boolean
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          latest_version_id?: string | null
          metadata?: Json | null
          name?: string
          organization_id?: string
          parent_product_id?: string | null
          recurring_interval?: string
          recurring_interval_count?: number
          stripe_product_id?: string | null
          trial_days?: number | null
          updated_at?: string | null
          version?: number
          version_created_at?: string | null
          version_created_reason?: string | null
          version_status?: string | null
          visible_in_pricing_table?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_latest_version_id_fkey"
            columns: ["latest_version_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_latest_version_id_fkey"
            columns: ["latest_version_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_queue: {
        Row: {
          created_at: string | null
          details: Json | null
          error_count: number | null
          error_message: string | null
          id: string
          next_retry_at: string | null
          priority: number | null
          processed_at: string | null
          reference_id: string
          resolution_notes: string | null
          resolved_by: string | null
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          next_retry_at?: string | null
          priority?: number | null
          processed_at?: string | null
          reference_id: string
          resolution_notes?: string | null
          resolved_by?: string | null
          status?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          error_count?: number | null
          error_message?: string | null
          id?: string
          next_retry_at?: string | null
          priority?: number | null
          processed_at?: string | null
          reference_id?: string
          resolution_notes?: string | null
          resolved_by?: string | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string | null
          currency: string
          customer_id: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          initiated_by: string
          metadata: Json | null
          organization_id: string | null
          payment_intent_id: string
          reason: string
          status: string
          stripe_account_id: string | null
          stripe_refund_id: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string | null
          currency?: string
          customer_id?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          initiated_by?: string
          metadata?: Json | null
          organization_id?: string | null
          payment_intent_id: string
          reason: string
          status?: string
          stripe_account_id?: string | null
          stripe_refund_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string | null
          currency?: string
          customer_id?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          initiated_by?: string
          metadata?: Json | null
          organization_id?: string | null
          payment_intent_id?: string
          reason?: string
          status?: string
          stripe_account_id?: string | null
          stripe_refund_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_tokens: {
        Row: {
          allowed_operations: Json | null
          api_key_id: string
          created_at: string
          expires_at: string
          external_organization_id: string | null
          external_user_id: string
          id: string
          last_used_at: string | null
          metadata: Json | null
          organization_id: string
          revoked_at: string | null
          token_id: string
        }
        Insert: {
          allowed_operations?: Json | null
          api_key_id: string
          created_at?: string
          expires_at: string
          external_organization_id?: string | null
          external_user_id: string
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          organization_id: string
          revoked_at?: string | null
          token_id: string
        }
        Update: {
          allowed_operations?: Json | null
          api_key_id?: string
          created_at?: string
          expires_at?: string
          external_organization_id?: string | null
          external_user_id?: string
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          organization_id?: string
          revoked_at?: string | null
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_tokens_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_sync_events: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          error_code: string | null
          error_message: string | null
          id: string
          operation: string
          organization_id: string
          request_payload: Json | null
          response_payload: Json | null
          retry_count: number | null
          status: string
          stripe_object_id: string | null
          triggered_at: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          operation: string
          organization_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number | null
          status: string
          stripe_object_id?: string | null
          triggered_at?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          operation?: string
          organization_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number | null
          status?: string
          stripe_object_id?: string | null
          triggered_at?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_sync_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_changes: {
        Row: {
          change_type: string
          completed_at: string | null
          created_at: string | null
          failed_reason: string | null
          from_amount: number | null
          from_price_id: string | null
          id: string
          metadata: Json | null
          net_amount: number | null
          organization_id: string
          proration_charge: number | null
          proration_credit: number | null
          scheduled_for: string | null
          status: string
          stripe_invoice_id: string | null
          subscription_id: string
          to_amount: number | null
          to_price_id: string | null
          updated_at: string | null
        }
        Insert: {
          change_type: string
          completed_at?: string | null
          created_at?: string | null
          failed_reason?: string | null
          from_amount?: number | null
          from_price_id?: string | null
          id?: string
          metadata?: Json | null
          net_amount?: number | null
          organization_id: string
          proration_charge?: number | null
          proration_credit?: number | null
          scheduled_for?: string | null
          status?: string
          stripe_invoice_id?: string | null
          subscription_id: string
          to_amount?: number | null
          to_price_id?: string | null
          updated_at?: string | null
        }
        Update: {
          change_type?: string
          completed_at?: string | null
          created_at?: string | null
          failed_reason?: string | null
          from_amount?: number | null
          from_price_id?: string | null
          id?: string
          metadata?: Json | null
          net_amount?: number | null
          organization_id?: string
          proration_charge?: number | null
          proration_credit?: number | null
          scheduled_for?: string | null
          status?: string
          stripe_invoice_id?: string | null
          subscription_id?: string
          to_amount?: number | null
          to_price_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_changes_from_price_id_fkey"
            columns: ["from_price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_changes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_changes_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_changes_to_price_id_fkey"
            columns: ["to_price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string | null
          currency: string
          current_period_end: string
          current_period_start: string
          customer_id: string
          ended_at: string | null
          id: string
          metadata: Json | null
          organization_id: string
          payment_intent_id: string | null
          price_id: string | null
          product_id: string
          status: string
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          amount: number
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          currency: string
          current_period_end: string
          current_period_start: string
          customer_id: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          payment_intent_id?: string | null
          price_id?: string | null
          product_id: string
          status: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          version?: number
        }
        Update: {
          amount?: number
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          currency?: string
          current_period_end?: string
          current_period_start?: string
          customer_id?: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          payment_intent_id?: string | null
          price_id?: string | null
          product_id?: string
          status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_history: {
        Row: {
          cancellation_reason: string | null
          conversion_date: string | null
          converted: boolean | null
          created_at: string | null
          customer_id: string
          id: string
          metadata: Json | null
          organization_id: string
          product_id: string
          subscription_id: string | null
          trial_days: number
          trial_end: string
          trial_start: string
          updated_at: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          conversion_date?: string | null
          converted?: boolean | null
          created_at?: string | null
          customer_id: string
          id?: string
          metadata?: Json | null
          organization_id: string
          product_id: string
          subscription_id?: string | null
          trial_days: number
          trial_end: string
          trial_start: string
          updated_at?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          conversion_date?: string | null
          converted?: boolean | null
          created_at?: string | null
          customer_id?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          product_id?: string
          subscription_id?: string | null
          trial_days?: number
          trial_end?: string
          trial_start?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_version_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          consumed_units: number | null
          created_at: string | null
          customer_id: string
          feature_id: string
          id: string
          limit_units: number | null
          period_end: string
          period_start: string
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          consumed_units?: number | null
          created_at?: string | null
          customer_id: string
          feature_id: string
          id?: string
          limit_units?: number | null
          period_end: string
          period_start: string
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          consumed_units?: number | null
          created_at?: string | null
          customer_id?: string
          feature_id?: string
          id?: string
          limit_units?: number | null
          period_end?: string
          period_start?: string
          subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_records_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_records_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features_needing_sync"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_records_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          created_at: string
          deleted_at: string | null
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          accepted_terms_at: string | null
          accepted_terms_of_service: boolean
          account_id: string | null
          avatar_url: string | null
          blocked_at: string | null
          created_at: string
          deleted_at: string | null
          email: string
          email_verified: boolean
          id: string
          identity_verification_id: string | null
          identity_verification_status: string
          is_admin: boolean
          meta: Json
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_terms_at?: string | null
          accepted_terms_of_service?: boolean
          account_id?: string | null
          avatar_url?: string | null
          blocked_at?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          email_verified?: boolean
          id: string
          identity_verification_id?: string | null
          identity_verification_status?: string
          is_admin?: boolean
          meta?: Json
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_terms_at?: string | null
          accepted_terms_of_service?: boolean
          account_id?: string | null
          avatar_url?: string | null
          blocked_at?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          email_verified?: boolean
          id?: string
          identity_verification_id?: string | null
          identity_verification_status?: string
          is_admin?: boolean
          meta?: Json
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_users_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          account_id: string | null
          api_version: string | null
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          livemode: boolean
          payload: Json
          processed_at: string | null
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          api_version?: string | null
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          livemode?: boolean
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          api_version?: string | null
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          livemode?: boolean
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      feature_grants_needing_sync: {
        Row: {
          customer_id: string | null
          feature_id: string | null
          granted_at: string | null
          id: string | null
          organization_id: string | null
          revoked_at: string | null
          stripe_active_entitlement_id: string | null
          stripe_customer_id: string | null
          stripe_feature_id: string | null
          stripe_sync_status: string | null
          subscription_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_grants_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_grants_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_grants_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features_needing_sync"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_grants_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      features_needing_sync: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
          organization_id: string | null
          stripe_feature_id: string | null
          stripe_sync_status: string | null
          title: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          organization_id?: string | null
          stripe_feature_id?: string | null
          stripe_sync_status?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
          organization_id?: string | null
          stripe_feature_id?: string | null
          stripe_sync_status?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "features_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_version_analytics: {
        Row: {
          active_subscription_count: number | null
          created_at: string | null
          id: string | null
          organization_id: string | null
          product_name: string | null
          subscription_count: number | null
          total_mrr: number | null
          updated_at: string | null
          version: number | null
          version_created_at: string | null
          version_created_reason: string | null
          version_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_sync_health: {
        Row: {
          features_failed: number | null
          features_synced: number | null
          grants_failed: number | null
          grants_synced: number | null
          last_failure_at: string | null
          last_sync_at: string | null
          organization_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_sync_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_reactivate_subscription: {
        Args: { p_customer_id: string; p_product_id: string }
        Returns: {
          can_reactivate: boolean
          reason: string
          subscription_id: string
        }[]
      }
      check_trial_eligibility: {
        Args: { p_customer_id: string; p_product_id: string }
        Returns: boolean
      }
      cleanup_expired_checkout_metadata: { Args: never; Returns: number }
      cleanup_expired_portal_sessions: { Args: never; Returns: number }
      cleanup_expired_session_tokens: { Args: never; Returns: undefined }
      create_subscription_atomic: {
        Args: {
          p_customer_id: string
          p_features: Json[]
          p_organization_id: string
          p_product_id: string
          p_subscription: Json
        }
        Returns: Json
      }
      get_latest_product_version: {
        Args: { p_organization_id: string; p_product_name: string }
        Returns: number
      }
      get_product_versions: {
        Args: { p_organization_id: string; p_product_name: string }
        Returns: {
          active_subscription_count: number
          created_at: string
          id: string
          subscription_count: number
          total_mrr: number
          version: number
          version_created_reason: string
          version_status: string
        }[]
      }
      is_organization_admin: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      is_organization_member: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
      log_stripe_sync_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_error_message?: string
          p_operation: string
          p_organization_id: string
          p_status: string
          p_stripe_object_id: string
          p_triggered_by?: string
        }
        Returns: string
      }
      mark_feature_grant_synced: {
        Args: { p_grant_id: string; p_stripe_entitlement_id: string }
        Returns: undefined
      }
      mark_feature_synced: {
        Args: { p_feature_id: string; p_stripe_feature_id: string }
        Returns: undefined
      }
      mark_trial_converted: {
        Args: { p_customer_id: string; p_product_id: string }
        Returns: undefined
      }
      process_reconciliation_queue: {
        Args: { p_limit?: number }
        Returns: {
          failed_count: number
          processed_count: number
        }[]
      }
      record_trial_usage: {
        Args: {
          p_customer_id: string
          p_organization_id: string
          p_product_id: string
          p_subscription_id: string
          p_trial_days: number
          p_trial_end: string
          p_trial_start: string
        }
        Returns: string
      }
      upsert_customer_atomic: {
        Args: {
          p_email: string
          p_external_id?: string
          p_metadata?: Json
          p_name?: string
          p_organization_id: string
          p_stripe_customer_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
