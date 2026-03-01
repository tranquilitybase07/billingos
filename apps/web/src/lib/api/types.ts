// Organization Types
export interface Organization {
  id: string
  name: string
  slug: string
  email: string | null
  avatar_url: string | null
  website: string | null
  socials: any
  details: any
  details_submitted_at: string | null
  account_id: string | null
  status: string
  status_updated_at: string | null
  onboarded_at: string | null
  customer_invoice_prefix: string
  customer_invoice_next_number: number
  profile_settings: any
  subscription_settings: any
  order_settings: any
  notification_settings: any
  customer_email_settings: any
  customer_portal_settings: any
  feature_settings: any
  subscriptions_billing_engine: boolean
  blocked_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CreateOrganizationDTO {
  name: string
  slug?: string
  email?: string
  website?: string
}

export interface UpdateOrganizationDTO {
  name?: string
  email?: string
  avatar_url?: string
  website?: string
  socials?: Array<{ platform: string; url: string }>
  profile_settings?: any
  subscription_settings?: any
  order_settings?: any
  notification_settings?: any
  customer_email_settings?: any
  customer_portal_settings?: any
  feature_settings?: any
  subscriptions_billing_engine?: boolean
}

export interface SubmitBusinessDetailsDTO {
  about: string
  product_description: string
  intended_use: string
  customer_acquisition?: string
  future_annual_revenue?: number
  switching?: string
  switching_from?: string
  previous_annual_revenue?: number
  [key: string]: any
}

// Account Types
export interface Account {
  id: string
  account_type: string
  admin_id: string
  stripe_id: string | null
  email: string | null
  country: string
  currency: string | null
  is_details_submitted: boolean
  is_charges_enabled: boolean
  is_payouts_enabled: boolean
  business_type: string | null
  status: string
  processor_fees_applicable: boolean
  platform_fee_percent: number | null
  platform_fee_fixed: number | null
  data: any
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CreateAccountDTO {
  organization_id: string
  email: string
  country: string
  business_type?: 'individual' | 'company' | 'non_profit' | 'government_entity'
}

export interface OnboardingLinkResponse {
  url: string
}

export interface DashboardLinkResponse {
  url: string
}

// Member Types
export interface OrganizationMember {
  user_id: string
  organization_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  email?: string
  avatar_url?: string | null
  is_admin?: boolean
}

export interface InviteMemberDTO {
  email: string
}

// Payment Status Types
export interface PaymentStep {
  id: string
  title: string
  description: string
  completed: boolean
  href?: string
}

export interface PaymentStatus {
  payment_ready: boolean
  steps: PaymentStep[]
  account_status?: 'not_created' | 'onboarding' | 'active'
  is_details_submitted?: boolean
  is_charges_enabled?: boolean
  is_payouts_enabled?: boolean
}

// User Types
export interface User {
  id: string
  email: string
  email_verified: boolean
  avatar_url: string | null
  is_admin: boolean
  stripe_customer_id: string | null
  accepted_terms_of_service: boolean
  accepted_terms_at: string | null
  blocked_at: string | null
  meta: any
  created_at: string
  updated_at: string
  deleted_at: string | null
  account_id: string | null
  identity_verification_status: string
  identity_verification_id: string | null
}

// API Key Types
export interface ApiKey {
  id: string
  organizationId: string
  keyType: 'secret' | 'publishable'
  environment: 'live' | 'test'
  keyPrefix: string // First 13 chars (safe to display)
  name?: string
  keyPairId?: string // Links to paired key
  createdAt: Date
  lastUsedAt?: Date
  revokedAt?: Date
}

export interface ApiKeyPairCreated {
  pairId: string
  name?: string
  environment: 'live' | 'test'
  secretKey: {
    id: string
    keyPrefix: string
    fullKey: string // Only shown ONCE
  }
  publishableKey: {
    id: string
    keyPrefix: string
    fullKey: string // Only shown ONCE
  }
  createdAt: Date
  warning: string
}

export interface CreateApiKeyDTO {
  name?: string
  environment?: 'live' | 'test' // Creates both secret and publishable keys
}
// Analytics Types
export interface MRRResponse {
  mrr: number
  currency: string
  active_subscriptions: number
  cached_at: string
}

export interface RevenueTrendDataPoint {
  date: string
  revenue: number
  transaction_count: number
}

export interface RevenueTrendResponse {
  data: RevenueTrendDataPoint[]
  total_revenue: number
  period: {
    start: string
    end: string
  }
  granularity: string
}

export interface SubscriptionGrowthDataPoint {
  date: string
  new_subscriptions: number
  canceled_subscriptions: number
  net_growth: number
}

export interface SubscriptionGrowthResponse {
  data: SubscriptionGrowthDataPoint[]
  summary: {
    total_new: number
    total_canceled: number
    net_growth: number
  }
  period: {
    start: string
    end: string
  }
}

export interface ChurnRateDataPoint {
  date: string
  active_at_start: number
  new_subscriptions: number
  canceled_subscriptions: number
  churn_rate: number
  retention_rate: number
}

export interface ChurnRateResponse {
  data: ChurnRateDataPoint[]
  summary: {
    avg_churn_rate: number
    avg_retention_rate: number
    total_periods: number
  }
  period: {
    start: string
    end: string
  }
  granularity: Granularity
}

export type Granularity = 'day' | 'week' | 'month'

export interface AnalyticsQueryParams {
  organization_id: string
  start_date?: string
  end_date?: string
  granularity?: Granularity
}

// Usage Analytics Types
export interface UsageOverviewResponse {
  total_consumption: number
  active_metered_customers: number
  at_limit_count: number
  features_tracked: number
  as_of: string
}

export interface UsageByFeatureData {
  feature_key: string
  feature_title: string
  total_consumed: number
  avg_per_customer: number
  customer_count: number
  at_limit_count: number
}

export interface UsageByFeatureResponse {
  data: UsageByFeatureData[]
  organization_id: string
  as_of: string
}

export interface AtRiskCustomer {
  customer_id: string
  external_id: string
  email: string
  feature_key: string
  consumed: number
  limit: number
  percentage_used: number
  resets_at: string
}

export interface AtRiskCustomersResponse {
  data: AtRiskCustomer[]
  threshold: number
  total_at_risk: number
  as_of: string
}

export interface UsageTrendDataPoint {
  date: string
  consumed: number
  customer_count: number
}

export interface UsageTrendsResponse {
  feature_key: string
  data: UsageTrendDataPoint[]
  period: number
}

// Subscription Upgrade/Downgrade Types
export type ChangeEffectiveTiming = 'immediate' | 'period_end'
export type ChangeType = 'upgrade' | 'downgrade'

export interface PlanInfo {
  name: string
  amount: number
  currency: string
  interval: string
}

export interface ProrationInfo {
  unused_credit: number
  new_plan_charge: number
  immediate_payment: number
}

export interface PreviewChangeResponse {
  current_plan: PlanInfo
  new_plan: PlanInfo
  proration: ProrationInfo
  change_type: ChangeType
  effective_date: string
  next_billing_date: string
  notes: string[]
}

export interface PreviewChangeDTO {
  new_price_id: string
  effective_date?: ChangeEffectiveTiming
}

export interface ChangePlanDTO {
  new_price_id: string
  confirm_amount?: number
  effective_date?: ChangeEffectiveTiming
}

export interface SubscriptionChange {
  id: string
  subscription_id: string
  organization_id: string
  change_type: 'upgrade' | 'downgrade' | 'cancel' | 'reactivate'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'scheduled'
  from_price_id: string | null
  to_price_id: string | null
  from_amount: number
  to_amount: number
  proration_credit: number
  proration_charge: number
  net_amount: number
  scheduled_for: string | null
  completed_at: string | null
  failed_reason: string | null
  stripe_invoice_id: string | null
  metadata: any
  created_at: string
  updated_at: string
}

export interface ChangePlanResponse {
  subscription: any
  change: SubscriptionChange
  invoice_id?: string
  scheduled_for?: string
  message?: string
}

export interface AvailablePlan {
  product_id: string
  product_name: string
  description: string | null
  price_id: string
  amount: number
  currency: string
  interval: string
  is_free: boolean
}

export interface AvailablePlansResponse {
  current_plan: {
    product_id: string
    product_name: string
    price_id: string
    amount: number
    currency: string
    interval: string
  } | null
  available_upgrades: AvailablePlan[]
  available_downgrades: AvailablePlan[]
  restrictions: string[]
}
