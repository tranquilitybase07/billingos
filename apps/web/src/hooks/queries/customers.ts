import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { Subscription } from './subscriptions'

interface Customer {
  id: string
  organization_id: string
  name: string | null
  email: string
  external_id: string | null
  stripe_customer_id: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

interface ListCustomersResponse {
  data: Customer[]
  total: number
  page: number
  limit: number
  total_pages: number
}

interface CustomerStateResponse {
  customer: any
  active_subscriptions: Subscription[]
  granted_features: {
    id: string
    feature_id: string
    feature_key: string
    feature_name: string
    granted_at: string
    properties?: {
      limit?: number
      [key: string]: any
    }
  }[]
}

/**
 * Hook to fetch all customers for an organization
 */
export function useListCustomers(
  organizationId: string | undefined,
  options?: {
    limit?: number
    page?: number
    query?: string
    enabled?: boolean
  }
) {
  const limit = options?.limit ?? 100
  const page = options?.page ?? 1
  const query = options?.query ?? ''

  return useQuery<ListCustomersResponse>({
    queryKey: ['customers', organizationId, limit, page, query],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization ID is required')

      let url = `/customers?organization_id=${organizationId}&limit=${limit}&page=${page}`
      if (query) {
        url += `&query=${encodeURIComponent(query)}`
      }

      const response = await api.get<ListCustomersResponse>(url)
      return response
    },
    enabled: options?.enabled !== false && !!organizationId,
  })
}

/**
 * Hook to fetch granted features for a customer using the features API
 */
export function useCustomerState(
  customerId: string | undefined,
  organizationId: string | undefined,
  options?: {
    enabled?: boolean
  }
) {
  return useQuery<CustomerStateResponse>({
    queryKey: ['customer-features', customerId, organizationId],
    queryFn: async () => {
      if (!customerId) throw new Error('Customer ID is required')
      
      // Use the features API endpoint
      let url = `/features/customer/${customerId}`
      if (organizationId) {
        url += `?organization_id=${organizationId}`
      }
      
      const features = await api.get<any[]>(url)
      
      console.log('useCustomerState API response (features API):', {
        customerId,
        organizationId,
        features,
        featuresCount: features?.length || 0
      })
      
      // Transform to match CustomerStateResponse format
      const response: CustomerStateResponse = {
        customer: null as any, // Not needed for features display
        active_subscriptions: [],
        granted_features: features.map((f: any) => ({
          id: f.id,
          feature_id: f.feature_id,
          feature_key: f.feature_key,
          feature_name: f.feature_name,
          granted_at: f.granted_at,
          properties: f.properties || {}
        }))
      }
      
      return response
    },
    enabled: options?.enabled !== false && !!customerId,
  })
}

/**
 * Mutation hook to update a customer
 */
export function useUpdateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      customerId, 
      organizationId, 
      data 
    }: { 
      customerId: string
      organizationId: string
      data: {
        name?: string
        email?: string
        external_id?: string
        metadata?: Record<string, any>
      }
    }) => {
      const url = `/customers/${customerId}?organization_id=${organizationId}`
      return await api.patch(url, data)
    },
    onSuccess: (_, variables) => {
      // Invalidate customer queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['customer', variables.customerId] })
      queryClient.invalidateQueries({ queryKey: ['customer-features', variables.customerId] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      // Also invalidate subscriptions since customer data comes from there
      queryClient.invalidateQueries({ queryKey: ['organization-subscriptions'] })
    },
  })
}

/**
 * Mutation hook to create a new customer
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      organization_id: string
      name: string
      email: string
      external_id?: string
      metadata?: Record<string, any>
    }) => {
      return await api.post<any>('/customers', data)
    },
    onSuccess: (_, variables) => {
      // Invalidate customer queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['organization-subscriptions', variables.organization_id] })
    },
  })
}
