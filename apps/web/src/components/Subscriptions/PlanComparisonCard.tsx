'use client'

import type { AvailablePlan } from '@/lib/api/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface PlanComparisonCardProps {
  plan: AvailablePlan
  isCurrentPlan?: boolean
  onSelect?: () => void
  isLoading?: boolean
  changeType: 'upgrade' | 'downgrade'
}

export function PlanComparisonCard({
  plan,
  isCurrentPlan = false,
  onSelect,
  isLoading = false,
  changeType,
}: PlanComparisonCardProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount / 100)
  }

  return (
    <Card
      className={`p-5 transition-all ${
        isCurrentPlan
          ? 'border-2 border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/50'
          : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      } ${onSelect && !isCurrentPlan ? 'cursor-pointer' : ''}`}
      onClick={!isCurrentPlan && onSelect ? onSelect : undefined}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {plan.product_name}
              </h3>
              {isCurrentPlan && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                  Current Plan
                </span>
              )}
            </div>

            {plan.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                {plan.description}
              </p>
            )}
          </div>

          {/* Change Type Badge */}
          {!isCurrentPlan && (
            <div className="flex-shrink-0 ml-3">
              {changeType === 'upgrade' ? (
                <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Upgrade
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                  Downgrade
                </div>
              )}
            </div>
          )}
        </div>

        {/* Price */}
        <div className="mb-4">
          {plan.is_free ? (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">Free</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(plan.amount, plan.currency)}
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                / {plan.interval}
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        {!isCurrentPlan && onSelect && (
          <Button
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
            disabled={isLoading}
            className="w-full"
            variant={changeType === 'upgrade' ? 'default' : 'outline'}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              `${changeType === 'upgrade' ? 'Upgrade' : 'Downgrade'} to this plan`
            )}
          </Button>
        )}
      </div>
    </Card>
  )
}
