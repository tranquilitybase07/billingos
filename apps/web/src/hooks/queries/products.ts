import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { ProductFormData } from '@/hooks/useProductForm'

export interface ProductPrice {
  id: string
  product_id: string
  amount_type: 'fixed' | 'free'
  price_amount?: number
  price_currency: string
  recurring_interval?: string
  recurring_interval_count?: number
  stripe_price_id?: string
  created_at: string
}

export interface ProductFeature {
  product_id: string
  feature_id: string
  display_order: number
  config: Record<string, any>
  created_at: string
  // Denormalized feature data
  feature?: {
    id: string
    name: string
    title: string
    description?: string
    type: string
  }
}

export interface Product {
  id: string
  organization_id: string
  name: string
  description?: string
  recurring_interval: string
  recurring_interval_count: number
  trial_days: number
  stripe_product_id?: string
  is_archived: boolean
  created_at: string
  updated_at: string
  prices?: ProductPrice[]
  features?: ProductFeature[]
  metadata?: Record<string, any>
}

export interface UseProductsOptions {
  includeArchived?: boolean
  includeFeatures?: boolean
  includePrices?: boolean
  query?: string
  page?: number
  limit?: number
  sorting?: string | string[]
  is_archived?: boolean | null
}

/**
 * Fetch all products for an organization
 */
export const useProducts = (
  organizationId: string | undefined,
  options: UseProductsOptions = {},
) => {
  return useQuery({
    queryKey: ['products', organizationId, options],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization ID is required')

      const params = new URLSearchParams({
        organization_id: organizationId,
        include_archived: String(options.includeArchived ?? false),
        include_features: String(options.includeFeatures ?? true),
        include_prices: String(options.includePrices ?? true),
      })

      return api.get<Product[]>(`/products?${params.toString()}`)
    },
    enabled: !!organizationId,
  })
}

/**
 * Fetch a single product by ID
 */
export const useProduct = (productId: string | undefined) => {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      if (!productId) throw new Error('Product ID is required')
      return api.get<Product>(`/products/${productId}`)
    },
    enabled: !!productId,
  })
}

/**
 * Create a new product
 */
export function useCreateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ProductFormData) => {
      return api.post<Product>('/products', data)
    },
    onSuccess: (_, variables) => {
      // Invalidate products list for this organization
      queryClient.invalidateQueries({
        queryKey: ['products', variables.organization_id],
      })
    },
  })
}

/**
 * Update an existing product
 */
export const useUpdateProduct = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<ProductFormData> }) => {
      return api.patch<Product>(`/products/${id}`, body)
    },
    onSuccess: (data) => {
      // Invalidate specific product and products list
      queryClient.invalidateQueries({ queryKey: ['product', data.id] })
      queryClient.invalidateQueries({
        queryKey: ['products', data.organization_id],
      })
    },
  })
}

/**
 * Archive a product (soft delete)
 */
export const useDeleteProduct = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (productId: string) => {
      return api.delete(`/products/${productId}`)
    },
    onSuccess: (_, productId) => {
      // Invalidate products list
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product', productId] })
    },
  })
}
