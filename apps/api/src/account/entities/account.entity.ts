export interface Account {
  id: string;
  account_type: string; // 'stripe' | 'open_collective'
  admin_id: string;
  stripe_id: string | null;
  email: string | null;
  country: string;
  currency: string | null;
  is_details_submitted: boolean;
  is_charges_enabled: boolean;
  is_payouts_enabled: boolean;
  business_type: string | null;
  status: string; // 'created' | 'onboarding_started' | 'active' | 'blocked'
  processor_fees_applicable: boolean;
  platform_fee_percent: number | null;
  platform_fee_fixed: number | null;
  data: any; // Record<string, any>
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
