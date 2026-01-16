'use client'

import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { PriceConfig } from './PricingEngineSection'
import type { SelectedFeature } from './FeatureSelector'

interface LivePreviewCardProps {
  productName: string
  description: string
  prices: PriceConfig[]
  features: SelectedFeature[]
  currency: string
  trialDays: number
  className?: string
}

export function LivePreviewCard({
  productName,
  description,
  prices,
  features,
  currency,
  trialDays,
  className,
}: LivePreviewCardProps) {
  const hasMultiplePrices = prices.length > 1
  const [selectedInterval, setSelectedInterval] = useState<string>(
    prices.find((p) => p.recurring_interval === 'month')?.recurring_interval ||
      prices[0]?.recurring_interval ||
      'month'
  )

  const currentPrice = prices.find((p) => p.recurring_interval === selectedInterval) || prices[0]

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

  return (
    <div className={cn('sticky top-6', className)}>
      <Card className="border-2 shadow-lg">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-start justify-between">
            <CardTitle className="text-2xl">
              {productName || 'Product Name'}
            </CardTitle>
            {showSavingsBadge && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Save {savings}%
              </Badge>
            )}
          </div>
          {description && (
            <CardDescription className="text-base leading-relaxed">
              {description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Price Display */}
          <div className="space-y-2">
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold tracking-tight">
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
                <TabsList className="grid w-full grid-cols-2">
                  {prices.map((price) => (
                    <TabsTrigger
                      key={price.recurring_interval}
                      value={price.recurring_interval || 'month'}
                      className="capitalize"
                    >
                      {price.recurring_interval === 'month' ? 'Monthly' : 'Yearly'}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            {/* Trial Badge */}
            {trialDays > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {trialDays}-day free trial included
                </span>
              </div>
            )}
          </div>

          {/* CTA Button */}
          <Button className="w-full" size="lg">
            Get Started
          </Button>

          {/* Features List */}
          <div className="space-y-3 pt-4">
            <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              What's included
            </div>
            {features.length > 0 ? (
              <ul className="space-y-3">
                {features
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((feature) => (
                    <li key={feature.feature_id} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <div className="text-sm font-medium leading-none">
                          {feature.featureTitle || 'Feature'}
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
                <p className="text-sm text-muted-foreground">
                  No features added yet
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Label */}
      <div className="mt-2 text-center text-xs text-muted-foreground">
        Live Preview - Updates as you type
      </div>
    </div>
  )
}
