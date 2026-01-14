import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Product } from '@/utils/product'

// Mock data for development - shows product list
const mockProducts: Product[] = [
  {
    id: 'prod_1',
    name: 'Premium Subscription',
    description: 'Access to all premium features',
    prices: [
      {
        id: 'price_1',
        type: 'recurring',
        amount_type: 'fixed',
        price_amount: 2999, // $29.99
        price_currency: 'usd',
        recurring_interval: 'month',
      },
    ],
    is_archived: false,
    is_recurring: true,
    recurring_interval: 'month',
    recurring_interval_count: 1,
    medias: [],
    metadata: {},
    created_at: new Date('2024-01-15').toISOString(),
  },
  {
    id: 'prod_2',
    name: 'Enterprise Plan',
    description: 'Custom solution for large teams',
    prices: [
      {
        id: 'price_2',
        type: 'recurring',
        amount_type: 'fixed',
        price_amount: 9999, // $99.99
        price_currency: 'usd',
        recurring_interval: 'month',
      },
    ],
    is_archived: false,
    is_recurring: true,
    recurring_interval: 'month',
    recurring_interval_count: 1,
    medias: [],
    metadata: {},
    created_at: new Date('2024-02-01').toISOString(),
  },
  {
    id: 'prod_3',
    name: 'Starter Pack',
    description: 'Perfect for individuals getting started',
    prices: [
      {
        id: 'price_3',
        type: 'recurring',
        amount_type: 'fixed',
        price_amount: 999, // $9.99
        price_currency: 'usd',
        recurring_interval: 'month',
      },
    ],
    is_archived: false,
    is_recurring: true,
    recurring_interval: 'month',
    recurring_interval_count: 1,
    medias: [],
    metadata: {},
    created_at: new Date('2024-03-10').toISOString(),
  },
]

export interface UseProductsOptions {
  query?: string
  page?: number
  limit?: number
  sorting?: string[]
  is_archived?: boolean | null
}

export const useProducts = (
  organizationId: string,
  options: UseProductsOptions = {},
) => {
  return useQuery({
    queryKey: ['products', organizationId, options],
    queryFn: async () => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))

      return {
        items: mockProducts,
        pagination: {
          total_count: mockProducts.length,
          max_page: 1,
        },
      }
    },
  })
}

export const useProduct = (id: string) => {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))
      return null
    },
  })
}

export const useUpdateProduct = (organization: { id: string; slug: string }) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<Product> }) => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))
      return { data: null, error: null }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', organization.id] })
    },
  })
}

export const useDeleteProduct = (organizationId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (productId: string) => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 100))
      return { data: null, error: null }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', organizationId] })
    },
  })
}
