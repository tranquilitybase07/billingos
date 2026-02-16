import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { Discount } from '@/utils/discount'

export interface UseDiscountsOptions {
  query?: string
  page?: number
  limit?: number
  sorting?: string[]
}

interface DiscountsResponse {
  items: Discount[]
  pagination: {
    total_count: number
    max_page: number
  }
}

export const useDiscounts = (
  organizationId: string,
  options: UseDiscountsOptions = {},
) => {
  return useQuery({
    queryKey: ['discounts', organizationId, options],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('organization_id', organizationId)
      if (options.query) params.set('query', options.query)
      if (options.page) params.set('page', String(options.page))
      if (options.limit) params.set('limit', String(options.limit))

      return api.get<DiscountsResponse>(`/discounts?${params.toString()}`)
    },
    enabled: !!organizationId,
  })
}

export const useDiscount = (id: string) => {
  return useQuery({
    queryKey: ['discount', id],
    queryFn: async () => {
      return api.get<Discount>(`/discounts/${id}`)
    },
    enabled: !!id,
  })
}

export const useCreateDiscount = (organizationId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: Partial<Discount> & { name: string; type: 'percentage' | 'fixed' }) => {
      return api.post<Discount>('/discounts', {
        ...body,
        organization_id: organizationId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts', organizationId] })
    },
  })
}

export const useUpdateDiscount = (organizationId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<Discount> }) => {
      return api.patch<Discount>(`/discounts/${id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts', organizationId] })
    },
  })
}

export const useDeleteDiscount = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (discount: Discount) => {
      await api.delete(`/discounts/${discount.id}`)
      return { error: null }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] })
    },
  })
}

export const useProductDiscounts = (
  productId: string | undefined,
  organizationId: string | undefined,
) => {
  return useQuery({
    queryKey: ['discounts', 'by-product', productId, organizationId],
    queryFn: async () => {
      return api.get<Discount[]>(
        `/discounts/by-product/${productId}?organization_id=${organizationId}`,
      )
    },
    enabled: !!productId && !!organizationId,
  })
}
