import { formatCurrency, formatPercentage } from './formatters'

// Discount types adapted from Polar
export interface Discount {
  id: string
  name: string
  code?: string | null
  type: 'fixed' | 'percentage'
  amount?: number
  currency?: string
  basis_points?: number
  duration?: 'once' | 'forever' | 'repeating'
  duration_in_months?: number
  max_redemptions?: number | null
  redemptions_count: number
  created_at: string
}

const isDiscountFixed = (discount: Discount): boolean => {
  return discount.type === 'fixed'
}

const isDiscountPercentage = (discount: Discount): boolean => {
  return discount.type === 'percentage'
}

export const getDiscountDisplay = (discount: Discount): string => {
  if (isDiscountPercentage(discount) && discount.basis_points) {
    return formatPercentage(-discount.basis_points / 10000)
  }

  if (isDiscountFixed(discount) && discount.amount && discount.currency) {
    return formatCurrency(-discount.amount, discount.currency)
  }

  return '—'
}
