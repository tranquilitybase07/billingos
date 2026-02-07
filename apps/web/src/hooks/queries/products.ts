import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { ProductFormData } from '@/hooks/useProductForm'

export interface ProductPrice {
  id: string
  product_id?: string
  amount_type: 'fixed' | 'custom' | 'free' | 'metered_unit' | 'seat_based'
  type: 'one_time' | 'recurring'
  price_amount?: number
  price_currency?: string
  recurring_interval?: 'day' | 'week' | 'month' | 'year'
  recurring_interval_count?: number
  stripe_price_id?: string
  created_at?: string
}

export interface ProductFeature {
  product_id: string
  feature_id: string
  display_order: number
  config: Record<string, any>
  created_at: string
  // Denormalized feature data (returned as 'features' by Supabase join)
  features?: {
    id: string
    name: string
    title: string
    description?: string
    type: string
  }
  // Keep for backward compatibility
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
  organization_id?: string
  name: string
  description?: string
  recurring_interval?: 'day' | 'week' | 'month' | 'year'
  recurring_interval_count?: number
  trial_days?: number
  stripe_product_id?: string
  is_archived: boolean
  created_at: string
  updated_at?: string
  prices: ProductPrice[]
  features: ProductFeature[]
  metadata: Record<string, any>
  medias: Array<{ id: string; public_url: string }>
  modified_at?: string
  // Versioning fields
  version?: number
  parent_product_id?: string | null
  version_status?: 'current' | 'superseded' | null
  latest_version_id?: string | null
  version_reason?: string | null
  // For compatibility with utils/product.ts
  is_recurring?: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: {
    total_count: number
    page: number
    page_size: number
    total_pages: number
  }
}

export interface ProductSubscriptionCount {
  count: number
  active: number
  canceled: number
}

export interface ProductRevenueMetrics {
  mrr: number
  revenueLastThirtyDays: number
  arpu: number
  activeSubscriptionCount: number
  currency: string
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
        include_archived: String(options.is_archived !== false),
        include_features: String(options.includeFeatures ?? true),
        include_prices: String(options.includePrices ?? true),
      })

      // Backend returns Product[], transform to paginated response for compatibility
      const products = await api.get<Product[]>(`/products?${params.toString()}`)

      // Ensure all products have required fields with defaults
      const normalizedProducts = products.map(p => ({
        ...p,
        prices: (p.prices ?? []).map(price => ({
          ...price,
          type: (price.recurring_interval ? 'recurring' : 'one_time') as 'one_time' | 'recurring',
        })),
        features: p.features ?? [],
        medias: p.medias ?? [],
        metadata: p.metadata ?? {},
      }))

      // Apply client-side filtering and pagination since backend doesn't support it yet
      let filtered = normalizedProducts

      // Filter by archived status
      if (options.is_archived === false) {
        filtered = filtered.filter(p => !p.is_archived)
      } else if (options.is_archived === true) {
        filtered = filtered.filter(p => p.is_archived)
      }

      // Filter by search query
      if (options.query) {
        const query = options.query.toLowerCase()
        filtered = filtered.filter(p =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
        )
      }

      // Apply sorting
      if (options.sorting) {
        const sortStr = Array.isArray(options.sorting) ? options.sorting[0] : options.sorting
        const isDesc = sortStr.startsWith('-')
        const field = isDesc ? sortStr.slice(1) : sortStr

        filtered.sort((a, b) => {
          let aVal: any = a[field as keyof Product]
          let bVal: any = b[field as keyof Product]

          // Handle price_amount sorting (get from first price)
          if (field === 'price_amount') {
            aVal = a.prices?.[0]?.price_amount ?? 0
            bVal = b.prices?.[0]?.price_amount ?? 0
          }

          if (aVal < bVal) return isDesc ? 1 : -1
          if (aVal > bVal) return isDesc ? -1 : 1
          return 0
        })
      }

      // Calculate pagination
      const page = options.page ?? 1
      const pageSize = options.limit ?? 20
      const totalCount = filtered.length
      const totalPages = Math.ceil(totalCount / pageSize)
      const startIndex = (page - 1) * pageSize
      const endIndex = startIndex + pageSize
      const paginatedItems = filtered.slice(startIndex, endIndex)

      const response: PaginatedResponse<Product> = {
        items: paginatedItems,
        pagination: {
          total_count: totalCount,
          page,
          page_size: pageSize,
          total_pages: totalPages,
        }
      }

      return response
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
    onSuccess: (data, variables) => {
      // Invalidate both old product (in case of versioning) and new product
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['product', data.id] })
      // Invalidate products list for this organization
      queryClient.invalidateQueries({
        queryKey: ['products', data.organization_id],
      })
      // Also invalidate subscription count for both products
      queryClient.invalidateQueries({ queryKey: ['product-subscription-count', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['product-subscription-count', data.id] })
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

/**
 * Get subscription count for a product
 */
export const useProductSubscriptionCount = (productId: string | undefined) => {
  return useQuery({
    queryKey: ['product-subscription-count', productId],
    queryFn: async () => {
      if (!productId) throw new Error('Product ID is required')
      return api.get<ProductSubscriptionCount>(`/products/${productId}/subscriptions/count`)
    },
    enabled: !!productId,
  })
}

/**
 * Get revenue metrics for a product (MRR, 30-day revenue, ARPU)
 */
export const useProductRevenueMetrics = (productId: string | undefined) => {
  return useQuery({
    queryKey: ['product-revenue-metrics', productId],
    queryFn: async () => {
      if (!productId) throw new Error('Product ID is required')
      return api.get<ProductRevenueMetrics>(`/products/${productId}/revenue-metrics`)
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (formerly cacheTime)
  })
}
