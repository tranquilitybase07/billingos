'use client'

interface ProductSummaryProps {
  product: {
    name: string
    interval: 'day' | 'week' | 'month' | 'year'
    features: string[]
    description?: string
  }
  amount: number
  currency: string
  discountAmount?: number
  taxAmount?: number
  totalAmount: number
  proration?: {
    credit: number
    charge: number
  }
}

export function ProductSummary({
  product,
  amount,
  currency,
  discountAmount,
  taxAmount,
  totalAmount,
  proration
}: ProductSummaryProps) {
  const formatAmount = (amt: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amt / 100)
  }

  const getIntervalLabel = (interval: string) => {
    const labels: Record<string, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Annual' }
    return labels[interval] || interval
  }

  const getIntervalShort = (interval: string) => {
    const labels: Record<string, string> = { day: 'day', week: 'wk', month: 'month', year: 'year' }
    return labels[interval] || interval
  }

  return (
    <div className="space-y-3">
      {/* Plan selector card — selected state */}
      <div className="flex items-center gap-2.5 border-2 border-blue-500 rounded-xl px-3.5 py-2.5">
        <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        <span className="font-semibold text-sm text-gray-900">{getIntervalLabel(product.interval)}</span>
        <span className="text-gray-400 text-sm ml-0.5">
          {formatAmount(amount)}/{getIntervalShort(product.interval)}
        </span>
      </div>

      {/* Price summary box */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-gray-900">{formatAmount(totalAmount)}</span>
          <span className="text-gray-400 text-xs">/{getIntervalShort(product.interval)}</span>
        </div>

        <div className="space-y-1.5 pt-0.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-900">{formatAmount(amount)}</span>
          </div>

          {discountAmount !== undefined && discountAmount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Discount</span>
              <span className="text-green-600">-{formatAmount(discountAmount)}</span>
            </div>
          )}

          {proration && proration.credit > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Credit</span>
              <span className="text-green-600">-{formatAmount(proration.credit)}</span>
            </div>
          )}

          {proration && proration.charge > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Prorated charge</span>
              <span className="text-gray-900">{formatAmount(proration.charge)}</span>
            </div>
          )}

          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Tax</span>
            {taxAmount !== undefined && taxAmount > 0 ? (
              <span className="text-gray-900">{formatAmount(taxAmount)}</span>
            ) : (
              <span className="text-gray-400">Calculated at checkout</span>
            )}
          </div>

          <div className="flex justify-between font-bold text-xs border-t border-gray-200 pt-2 mt-0.5">
            <span className="text-gray-900">Total</span>
            <span className="text-gray-900">{formatAmount(totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Auto-renews note */}
      <p className="text-xs text-gray-400">
        Auto-renews {getIntervalLabel(product.interval).toLowerCase()}. Cancel anytime via Billing tab.{' '}
        <a href="#" className="underline hover:text-gray-600 transition-colors">Terms</a>
      </p>
    </div>
  )
}
