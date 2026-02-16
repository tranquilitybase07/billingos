import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { Subscription } from './subscriptions'

interface CustomerStateResponse {
  customer: any
  active_subscriptions: Subscription[]
  granted_features: {
    id: string
    feature_id: string
    feature_key: string
    feature_name: string
    granted_at: string
  }[]
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
          granted_at: f.granted_at
        }))
      }
      
      return response
    },
    enabled: options?.enabled !== false && !!customerId,
  })
}
