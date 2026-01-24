// Product utility functions adapted from Polar
// TODO: Update with actual API types when available

export interface ProductPrice {
  id: string
  type: 'one_time' | 'recurring'
  amount_type: 'fixed' | 'custom' | 'free' | 'metered_unit' | 'seat_based'
  recurring_interval?: 'day' | 'week' | 'month' | 'year'
  price_amount?: number
  price_currency?: string
}

export interface Product {
  id: string
  name: string
  description?: string
  prices: ProductPrice[]
  is_archived: boolean
  is_recurring?: boolean
  recurring_interval?: 'day' | 'week' | 'month' | 'year'
  recurring_interval_count?: number
  medias: Array<{ id: string; public_url: string }>
  metadata: Record<string, any>
  created_at: string
  modified_at?: string
}

export const hasIntervals = (
  product: Product,
): [boolean, boolean, boolean, boolean, boolean] => {
  const hasDayInterval = product.prices.some(
    (price) => price.type === 'recurring' && price.recurring_interval === 'day',
  )
  const hasWeekInterval = product.prices.some(
    (price) =>
      price.type === 'recurring' && price.recurring_interval === 'week',
  )
  const hasMonthInterval = product.prices.some(
    (price) =>
      price.type === 'recurring' && price.recurring_interval === 'month',
  )
  const hasYearInterval = product.prices.some(
    (price) =>
      price.type === 'recurring' && price.recurring_interval === 'year',
  )
  const hasBothIntervals = hasMonthInterval && hasYearInterval

  return [
    hasDayInterval,
    hasWeekInterval,
    hasMonthInterval,
    hasYearInterval,
    hasBothIntervals,
  ]
}

export const isLegacyRecurringPrice = (price: ProductPrice): boolean => {
  return 'legacy' in price
}

export const hasLegacyRecurringPrices = (product: Product): boolean => {
  return product.prices.some(isLegacyRecurringPrice)
}

export const isStaticPrice = (price: ProductPrice): boolean =>
  ['fixed', 'custom', 'free', 'seat_based'].includes(price.amount_type)

export const isMeteredPrice = (price: ProductPrice): boolean =>
  price.amount_type === 'metered_unit'

export const isSeatBasedPrice = (price: ProductPrice): boolean =>
  price.amount_type === 'seat_based'
