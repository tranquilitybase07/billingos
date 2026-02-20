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

export interface MRRTrendDataPoint {
  date: string
  mrr: number
  active_subscriptions: number
}

export interface MRRTrendResponse {
  data: MRRTrendDataPoint[]
  current_mrr: number
  currency: string
  period: {
    start: string
    end: string
  }
  granularity: string
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
