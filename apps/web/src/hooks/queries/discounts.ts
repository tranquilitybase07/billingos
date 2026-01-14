import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Discount } from '@/utils/discount'

// Mock data for development - shows table structure
const mockDiscounts: Discount[] = [
  {
    id: 'disc_1',
    name: 'Summer Sale',
    code: 'SUMMER2024',
    type: 'percentage',
    basis_points: 2000, // 20%
    duration: 'once',
    max_redemptions: 100,
    redemptions_count: 45,
    created_at: new Date('2024-06-01').toISOString(),
  },
  {
    id: 'disc_2',
    name: 'VIP Customer Discount',
    code: 'VIP50',
    type: 'fixed',
    amount: 5000, // $50
    currency: 'usd',
    duration: 'forever',
    max_redemptions: null,
    redemptions_count: 12,
    created_at: new Date('2024-05-15').toISOString(),
  },
  {
    id: 'disc_3',
    name: 'First Time Buyer',
    code: 'WELCOME10',
    type: 'percentage',
    basis_points: 1000, // 10%
    duration: 'once',
    max_redemptions: 500,
    redemptions_count: 234,
    created_at: new Date('2024-01-10').toISOString(),
  },
]

export interface UseDiscountsOptions {
  query?: string
  page?: number
  limit?: number
  sorting?: string[]
}

export const useDiscounts = (
  organizationId: string,
  options: UseDiscountsOptions = {},
) => {
  return useQuery({
    queryKey: ['discounts', organizationId, options],
    queryFn: async () => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))

      return {
        items: mockDiscounts,
        pagination: {
          total_count: mockDiscounts.length,
          max_page: 1,
        },
      }
    },
  })
}

export const useDiscount = (id: string) => {
  return useQuery({
    queryKey: ['discount', id],
    queryFn: async () => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))
      return null
    },
  })
}

export const useCreateDiscount = (organizationId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: Partial<Discount>) => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))
      return { data: null, error: null }
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
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))
      return { data: null, error: null }
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
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))
      return { error: null }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] })
    },
  })
}
