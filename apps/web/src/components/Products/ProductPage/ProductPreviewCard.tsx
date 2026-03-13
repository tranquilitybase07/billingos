'use client'

import { useState } from 'react'
import { Tick01Icon, SparklesIcon } from 'hugeicons-react'
import { CardFlat, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Product } from '@/hooks/queries/products'

interface ProductPreviewCardProps {
  product: Product
  className?: string
}

export function ProductPreviewCard({ product, className }: ProductPreviewCardProps) {
  const prices = (product.prices ?? []).filter((p) => p.amount_type === 'fixed')
  const currency = prices[0]?.price_currency ?? 'usd'
  const trialDays = product.trial_days ?? 0

  const features = (product.features ?? [])
    .sort((a, b) => a.display_order - b.display_order)
    .map((pf) => ({
      feature_id: pf.feature_id,
      display_order: pf.display_order,
      config: pf.config,
      featureTitle: pf.features?.title ?? pf.feature?.title ?? 'Feature',
    }))

  const hasMultiplePrices = prices.length > 1
  const [selectedInterval, setSelectedInterval] = useState<string>(
    prices.find((p) => p.recurring_interval === 'month')?.recurring_interval ||
      prices[0]?.recurring_interval ||
      'month'
  )

  const currentPrice =
    prices.find((p) => p.recurring_interval === selectedInterval) || prices[0]

  const formatPrice = (priceInCents: number | undefined): string => {
    if (!priceInCents) return '0.00'
    return (priceInCents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const getIntervalLabel = (interval: string): string => {
    switch (interval) {
      case 'month':
        return 'mo'
      case 'year':
        return 'yr'
      case 'week':
        return 'wk'
      case 'day':
        return 'day'
      default:
        return interval
    }
  }

  const calculateYearlySavings = (): number | null => {
    const monthlyPrice = prices.find((p) => p.recurring_interval === 'month')
    const yearlyPrice = prices.find((p) => p.recurring_interval === 'year')

    if (!monthlyPrice?.price_amount || !yearlyPrice?.price_amount) {
      return null
    }

    const monthlyCost = monthlyPrice.price_amount * 12
    const yearlyCost = yearlyPrice.price_amount
    const savings = ((monthlyCost - yearlyCost) / monthlyCost) * 100

    return savings > 0 ? Math.round(savings) : null
  }

  const savings = calculateYearlySavings()
  const showSavingsBadge = savings && selectedInterval === 'year'

  const intervalOrder: Record<string, number> = { month: 0, year: 1, week: 2, day: 3 }
  const sortedPrices = [...prices].sort(
    (a, b) => (intervalOrder[a.recurring_interval ?? ''] ?? 99) - (intervalOrder[b.recurring_interval ?? ''] ?? 99)
  )

  return (
    <div className={cn('sticky top-6', className)}>
      <CardFlat>
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-start justify-between">
            <CardTitle className="text-2xl">{product.name}</CardTitle>
            {showSavingsBadge && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Save {savings}%
              </Badge>
            )}
          </div>
          {product.description && (
            <CardDescription className="text-base leading-relaxed">
              {product.description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Price Display */}
          <div className="space-y-2">
            {prices.length > 0 ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">
                    {currency.toUpperCase()} {formatPrice(currentPrice?.price_amount)}
                  </span>
                  {currentPrice?.recurring_interval && (
                    <span className="text-xl text-muted-foreground">
                      /{getIntervalLabel(currentPrice.recurring_interval)}
                    </span>
                  )}
                </div>

                {/* Interval Toggle */}
                {hasMultiplePrices && (
                  <Tabs
                    value={selectedInterval}
                    onValueChange={setSelectedInterval}
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2 rounded-full">
                      {sortedPrices.map((price, index) => (
                        <TabsTrigger
                          key={`${price.recurring_interval ?? 'one_time'}-${index}`}
                          value={price.recurring_interval || 'month'}
                          className="capitalize"
                        >
                          {price.recurring_interval === 'month' ? 'Monthly' : 'Yearly'}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No pricing configured</p>
            )}

            {/* Trial Badge */}
            {trialDays > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                <SparklesIcon size={16} className="text-primary" />
                <span className="text-sm font-medium">
                  {trialDays}-day free trial included
                </span>
              </div>
            )}
          </div>

          {/* Features List */}
          <div className="space-y-3 pt-4">
            <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              What&apos;s included
            </div>
            {features.length > 0 ? (
              <ul className="space-y-3">
                {features.map((feature, index) => (
                  <li key={feature.feature_id || `feature-${index}`} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Tick01Icon size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <div className="text-sm font-medium leading-none">
                        {feature.featureTitle}
                      </div>
                      {feature.config.limit !== undefined && (
                        <div className="text-xs text-muted-foreground">
                          {feature.config.limit === 0 || !feature.config.limit
                            ? 'Unlimited'
                            : `Up to ${feature.config.limit.toLocaleString()}`}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">No features added yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </CardFlat>
    </div>
  )
}
