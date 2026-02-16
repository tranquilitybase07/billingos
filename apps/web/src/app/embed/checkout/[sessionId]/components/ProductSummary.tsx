'use client'

interface ProductSummaryProps {
  product: {
    name: string
    interval: 'day' | 'week' | 'month' | 'year'
    features: string[]
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
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100)
  }

  const getIntervalText = (interval: string) => {
    const intervals = {
      day: 'daily',
      week: 'weekly',
      month: 'monthly',
      year: 'yearly'
    }
    return intervals[interval as keyof typeof intervals] || interval
  }

  return (
    <div className="bg-gray-50 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Order Summary</h3>

      {/* Product Details */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-gray-900">{product.name}</h4>
          <div className="text-right">
            <div className="text-lg font-semibold">{formatAmount(amount)}</div>
            <span className="text-sm text-gray-600">
              {getIntervalText(product.interval)}
            </span>
          </div>
        </div>

        {/* Features List */}
        {product.features && product.features.length > 0 && (
          <ul className="mt-3 space-y-1">
            {product.features.slice(0, 5).map((feature, index) => (
              <li key={index} className="flex items-start text-sm text-gray-600">
                <svg
                  className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Price Breakdown */}
      <div className="border-t border-gray-200 pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal</span>
          <span>{formatAmount(amount)}</span>
        </div>

        {/* Proration */}
        {proration && (proration.credit > 0 || proration.charge > 0) && (
          <>
            {proration.credit > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Credit</span>
                <span className="text-green-600">-{formatAmount(proration.credit)}</span>
              </div>
            )}
            {proration.charge > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Prorated charge</span>
                <span>{formatAmount(proration.charge)}</span>
              </div>
            )}
          </>
        )}

        {/* Discount */}
        {discountAmount && discountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Discount</span>
            <span className="text-green-600">-{formatAmount(discountAmount)}</span>
          </div>
        )}

        {/* Tax */}
        {taxAmount && taxAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Tax</span>
            <span>{formatAmount(taxAmount)}</span>
          </div>
        )}

        {/* Total */}
        <div className="flex justify-between font-semibold text-base border-t border-gray-200 pt-2 mt-2">
          <span>Total</span>
          <span>{formatAmount(totalAmount)}</span>
        </div>

        {/* Recurring Note */}
        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> This is a recurring {getIntervalText(product.interval)} subscription.
            You can cancel anytime from your account settings.
          </p>
        </div>
      </div>
    </div>
  )
}