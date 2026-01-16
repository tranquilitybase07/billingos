'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

export type RecurringInterval = 'month' | 'year' | 'week' | 'day'

export interface PriceConfig {
  amount_type: 'fixed' | 'free'
  price_amount?: number // in cents
  price_currency: string
  recurring_interval?: RecurringInterval
}

interface PricingEngineSectionProps {
  prices: PriceConfig[]
  onPricesChange: (prices: PriceConfig[]) => void
  trialDays: number
  onTrialDaysChange: (days: number) => void
  currency: string
  onCurrencyChange: (currency: string) => void
}

export function PricingEngineSection({
  prices,
  onPricesChange,
  trialDays,
  onTrialDaysChange,
  currency,
  onCurrencyChange,
}: PricingEngineSectionProps) {
  const [isRecurring, setIsRecurring] = useState(true)
  const [selectedIntervals, setSelectedIntervals] = useState<Set<RecurringInterval>>(
    new Set(['month'])
  )
  const [hasFreeTrial, setHasFreeTrial] = useState(false)

  // Initialize state from props
  useEffect(() => {
    if (prices.length > 0) {
      const intervals = new Set(
        prices.map((p) => p.recurring_interval).filter(Boolean) as RecurringInterval[]
      )
      if (intervals.size > 0) {
        setSelectedIntervals(intervals)
        setIsRecurring(true)
      }
    }
    setHasFreeTrial(trialDays > 0)
  }, [])

  const handleRecurringToggle = (checked: boolean) => {
    setIsRecurring(checked)
    if (!checked) {
      // One-time: single price with month interval
      onPricesChange([
        {
          amount_type: 'fixed',
          price_amount: prices[0]?.price_amount,
          price_currency: currency,
          recurring_interval: 'month',
        },
      ])
      setSelectedIntervals(new Set(['month']))
    } else {
      // Recurring: default to monthly
      if (selectedIntervals.size === 0) {
        setSelectedIntervals(new Set(['month']))
      }
      updatePrices(selectedIntervals, prices)
    }
  }

  const handleIntervalToggle = (interval: RecurringInterval, checked: boolean) => {
    const newIntervals = new Set(selectedIntervals)
    if (checked) {
      newIntervals.add(interval)
    } else {
      newIntervals.delete(interval)
    }

    // Must have at least one interval
    if (newIntervals.size === 0) return

    setSelectedIntervals(newIntervals)
    updatePrices(newIntervals, prices)
  }

  const updatePrices = (
    intervals: Set<RecurringInterval>,
    currentPrices: PriceConfig[]
  ) => {
    const newPrices: PriceConfig[] = []
    intervals.forEach((interval) => {
      const existing = currentPrices.find(
        (p) => p.recurring_interval === interval
      )
      newPrices.push({
        amount_type: 'fixed',
        price_amount: existing?.price_amount,
        price_currency: currency,
        recurring_interval: interval,
      })
    })
    onPricesChange(newPrices)
  }

  const handlePriceAmountChange = (interval: RecurringInterval, dollars: string) => {
    const updated = prices.map((p) => {
      if (p.recurring_interval === interval) {
        return {
          ...p,
          price_amount: dollars === '' ? undefined : Math.round(parseFloat(dollars) * 100),
        }
      }
      return p
    })
    onPricesChange(updated)
  }

  const calculateYearlySavings = (): number | null => {
    const monthlyPrice = prices.find((p) => p.recurring_interval === 'month')
    const yearlyPrice = prices.find((p) => p.recurring_interval === 'year')

    if (
      !monthlyPrice?.price_amount ||
      !yearlyPrice?.price_amount ||
      selectedIntervals.size < 2
    ) {
      return null
    }

    const monthlyCost = monthlyPrice.price_amount * 12
    const yearlyCost = yearlyPrice.price_amount
    const savings = ((monthlyCost - yearlyCost) / monthlyCost) * 100

    return savings > 0 ? Math.round(savings) : null
  }

  const savings = calculateYearlySavings()

  return (
    <div className="space-y-6">
      {/* Recurring Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="recurring-toggle" className="text-base font-medium">
            Recurring Billing
          </Label>
          <p className="text-sm text-muted-foreground">
            {isRecurring
              ? 'Charge customers on a recurring basis'
              : 'One-time payment only'}
          </p>
        </div>
        <Switch
          id="recurring-toggle"
          checked={isRecurring}
          onCheckedChange={handleRecurringToggle}
        />
      </div>

      {/* Interval Selection (for recurring) */}
      {isRecurring && (
        <div className="space-y-3">
          <Label>Billing Intervals</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center space-x-2 rounded-lg border p-3">
              <Checkbox
                id="interval-month"
                checked={selectedIntervals.has('month')}
                onCheckedChange={(checked) =>
                  handleIntervalToggle('month', checked === true)
                }
              />
              <Label
                htmlFor="interval-month"
                className="cursor-pointer font-normal"
              >
                Monthly
              </Label>
            </div>

            <div className="flex items-center space-x-2 rounded-lg border p-3">
              <Checkbox
                id="interval-year"
                checked={selectedIntervals.has('year')}
                onCheckedChange={(checked) =>
                  handleIntervalToggle('year', checked === true)
                }
              />
              <Label
                htmlFor="interval-year"
                className="cursor-pointer font-normal"
              >
                Yearly
                {savings && (
                  <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    Save {savings}%
                  </Badge>
                )}
              </Label>
            </div>
          </div>
        </div>
      )}

      {/* Currency Selection */}
      <div className="space-y-2">
        <Label htmlFor="currency">Currency</Label>
        <Select value={currency} onValueChange={onCurrencyChange}>
          <SelectTrigger id="currency" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="usd">USD - US Dollar</SelectItem>
            <SelectItem value="eur">EUR - Euro</SelectItem>
            <SelectItem value="gbp">GBP - British Pound</SelectItem>
            <SelectItem value="cad">CAD - Canadian Dollar</SelectItem>
            <SelectItem value="aud">AUD - Australian Dollar</SelectItem>
            <SelectItem value="inr">INR - Indian Rupee</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Price Inputs */}
      <div className="space-y-3">
        <Label>Price Amount *</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from(selectedIntervals).map((interval) => {
            const price = prices.find((p) => p.recurring_interval === interval)
            const dollars = price?.price_amount
              ? (price.price_amount / 100).toFixed(2)
              : ''

            return (
              <div key={interval} className="space-y-2">
                <Label htmlFor={`price-${interval}`} className="text-sm capitalize">
                  {interval === 'month' ? 'Monthly' : interval === 'year' ? 'Yearly' : interval}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {currency.toUpperCase()}
                  </span>
                  <Input
                    id={`price-${interval}`}
                    type="number"
                    placeholder="0.00"
                    value={dollars}
                    onChange={(e) => handlePriceAmountChange(interval, e.target.value)}
                    className="pl-16"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Free Trial */}
      {isRecurring && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="free-trial-toggle" className="text-base font-medium">
                Free Trial
              </Label>
              <p className="text-sm text-muted-foreground">
                Offer a trial period before charging
              </p>
            </div>
            <Switch
              id="free-trial-toggle"
              checked={hasFreeTrial}
              onCheckedChange={(checked) => {
                setHasFreeTrial(checked)
                if (!checked) onTrialDaysChange(0)
              }}
            />
          </div>

          {hasFreeTrial && (
            <div className="space-y-2">
              <Label htmlFor="trial-days">Trial Duration (days)</Label>
              <Input
                id="trial-days"
                type="number"
                placeholder="7"
                value={trialDays || ''}
                onChange={(e) => {
                  const value = e.target.value
                  onTrialDaysChange(value === '' ? 0 : parseInt(value, 10))
                }}
                min="1"
                max="365"
                className="w-full sm:w-32"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
