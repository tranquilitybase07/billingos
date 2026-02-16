import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'

export interface Customer {
  id: string
  name: string | null
  email: string
  external_id: string | null
  stripe_customer_id: string | null
}

export interface Product {
  id: string
  name: string
  recurring_interval: string
  recurring_interval_count: number
}

export interface Subscription {
  id: string
  organization_id: string
  customer_id: string
  product_id: string
  price_id: string | null
  status: 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'trialing' | 'unpaid'
  amount: number
  currency: string
  current_period_start: string
  current_period_end: string
  trial_start: string | null
  trial_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  ended_at: string | null
  stripe_subscription_id: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
  payment_intent_id: string | null
  customer?: Customer
  products?: Product
}

export interface ProductSubscriptionsResponse {
  subscriptions: Subscription[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

/**
 * Hook to fetch subscriptions for a product
 */
export function useProductSubscriptions(
  productId: string | undefined,
  options?: {
    limit?: number
    offset?: number
    enabled?: boolean
  }
) {
  const limit = options?.limit ?? 10
  const offset = options?.offset ?? 0

  return useQuery<ProductSubscriptionsResponse>({
    queryKey: ['product-subscriptions', productId, limit, offset],
    queryFn: async () => {
      if (!productId) throw new Error('Product ID is required')

      const response = await api.get<ProductSubscriptionsResponse>(
        `/products/${productId}/subscriptions?limit=${limit}&offset=${offset}`
      )
      return response
    },
    enabled: options?.enabled !== false && !!productId,
  })
}

/**
 * Hook to fetch all subscriptions for an organization
 */
export function useOrganizationSubscriptions(
  organizationId: string | undefined,
  customerId?: string,
  options?: {
    enabled?: boolean
  }
) {
  return useQuery<Subscription[]>({
    queryKey: ['organization-subscriptions', organizationId, customerId],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization ID is required')

      let url = `/subscriptions?organization_id=${organizationId}`
      if (customerId) {
        url += `&customer_id=${customerId}`
      }

      const response = await api.get<Subscription[]>(url)
      return response
    },
    enabled: options?.enabled !== false && !!organizationId,
  })
}

/**
 * Hook to fetch a single subscription
 */
export function useSubscription(
  subscriptionId: string | undefined,
  options?: {
    enabled?: boolean
  }
) {
  return useQuery<Subscription>({
    queryKey: ['subscription', subscriptionId],
    queryFn: async () => {
      if (!subscriptionId) throw new Error('Subscription ID is required')

      const response = await api.get<Subscription>(`/subscriptions/${subscriptionId}`)
      return response
    },
    enabled: options?.enabled !== false && !!subscriptionId,
  })
}