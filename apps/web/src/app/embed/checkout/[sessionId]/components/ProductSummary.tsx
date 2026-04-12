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
    netAmount?: number
    currency?: string
  }
  /** Override currency for the total display (used in adaptive pricing when customer selects a currency) */
  displayCurrency?: string
  trialDays?: number
  /** Converted recurring unit price from Stripe (used for trial products with adaptive pricing) */
  displayRecurringAmount?: number
}

export function ProductSummary({
  product,
  amount,
  currency,
  discountAmount,
  taxAmount,
  totalAmount,
  proration,
  displayCurrency,
  trialDays,
  displayRecurringAmount,
}: ProductSummaryProps) {
  const formatAmount = (amt: number, overrideCurrency?: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (overrideCurrency ?? currency).toUpperCase()
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
      {/* Billing interval pill */}
      <span className="inline-flex items-center gap-1.5 bg-white dark:bg-[#242426] border border-gray-200 dark:border-[#2e2e30] rounded-full px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
        {getIntervalLabel(product.interval)}
      </span>

      {/* Price summary box — white card elevated on grey panel */}
      <div className="bg-white dark:bg-[#0f0f11] rounded-xl border border-gray-200 dark:border-[#2e2e30] p-4 space-y-2.5">
        <div className="flex items-baseline gap-1">
          {/* Trial → recurring amount. Upgrade (proration set) → recurring price. Otherwise → totalAmount. */}
          <span className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            {(trialDays && trialDays > 0)
              ? formatAmount(displayRecurringAmount ?? amount, displayCurrency)
              : proration
                ? formatAmount(amount, displayCurrency)
                : formatAmount(totalAmount, displayCurrency)}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-xs">/{getIntervalShort(product.interval)}</span>
        </div>

        <div className="space-y-1.5 pt-0.5">
          {!displayCurrency && !proration && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
              <span className="text-gray-900 dark:text-gray-200">{formatAmount(amount)}</span>
            </div>
          )}

          {!displayCurrency && discountAmount !== undefined && discountAmount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">Discount</span>
              <span className="text-green-600">-{formatAmount(discountAmount)}</span>
            </div>
          )}

          {proration && proration.credit > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">Credit</span>
              <span className="text-green-600">-{formatAmount(proration.credit)}</span>
            </div>
          )}

          {proration && proration.charge > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">Prorated charge</span>
              <span className="text-gray-900 dark:text-gray-200">{formatAmount(proration.charge)}</span>
            </div>
          )}

          <div className="flex justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">Tax</span>
            {taxAmount !== undefined && taxAmount > 0 ? (
              <span className="text-gray-900 dark:text-gray-200">{formatAmount(taxAmount)}</span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">Calculated at checkout</span>
            )}
          </div>

          <div className="flex justify-between font-bold text-xs border-t border-gray-200 dark:border-[#2e2e30] pt-2 mt-0.5">
            <span className="text-gray-900 dark:text-gray-100">Total</span>
            <span className="text-gray-900 dark:text-gray-100">{formatAmount(totalAmount, displayCurrency)}</span>
          </div>
        </div>
      </div>

      {/* What's Included — features list */}
      {product.features && product.features.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase mb-3">
            What&apos;s Included
          </p>
          <ul className="space-y-2">
            {product.features.map((feature, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                style={{
                  animation: `checkoutSlideUp 200ms ease-out ${i * 20 + 100}ms forwards`,
                  opacity: 0,
                }}
              >
                <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trial period badge */}
      {trialDays !== undefined && trialDays > 0 && (
        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
            {trialDays}-day free trial &middot; then {formatAmount(displayRecurringAmount ?? amount, displayCurrency)}/{getIntervalShort(product.interval)}
          </span>
        </div>
      )}

      {/* Auto-renews note */}
      <p className="text-xs text-gray-400 dark:text-gray-600">
        Auto-renews {getIntervalLabel(product.interval).toLowerCase()}. Cancel anytime via Billing tab.{' '}
        <a href="#" className="underline hover:text-gray-600 dark:hover:text-gray-400 transition-colors">Terms</a>
      </p>
    </div>
  )
}
