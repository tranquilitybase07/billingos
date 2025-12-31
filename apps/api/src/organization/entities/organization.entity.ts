export interface Organization {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  avatar_url: string | null;
  website: string | null;
  socials: any; // Array<{ platform: string; url: string }>
  details: any; // Record<string, any>
  details_submitted_at: string | null;
  account_id: string | null;
  status: string; // 'created' | 'onboarding_started' | 'active' | 'blocked'
  status_updated_at: string | null;
  onboarded_at: string | null;
  customer_invoice_prefix: string;
  customer_invoice_next_number: number;
  profile_settings: any; // Record<string, any>
  subscription_settings: any; // Record<string, any>
  order_settings: any; // Record<string, any>
  notification_settings: any; // Record<string, any>
  customer_email_settings: any; // Record<string, any>
  customer_portal_settings: any; // Record<string, any>
  feature_settings: any; // Record<string, any>
  subscriptions_billing_engine: boolean;
  blocked_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrganizationMember {
  user_id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;

  // Joined from users table
  email?: string;
  avatar_url?: string | null;
  is_admin?: boolean; // Computed: whether user is the account admin
}

export interface PaymentStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  href?: string;
}

export interface PaymentStatus {
  payment_ready: boolean;
  steps: PaymentStep[];
  account_status?: 'not_created' | 'onboarding' | 'active';
  is_details_submitted?: boolean;
  is_charges_enabled?: boolean;
  is_payouts_enabled?: boolean;
}
