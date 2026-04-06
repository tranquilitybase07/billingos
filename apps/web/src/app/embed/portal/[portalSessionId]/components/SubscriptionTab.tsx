'use client'

import * as React from 'react'
import { useState } from 'react'
import { useParentMessaging } from '../hooks/useParentMessaging'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import type { PortalSubscription, UsageMetric, PortalCustomer } from '../hooks/usePortalData'

interface SubscriptionTabProps {
  subscriptions: PortalSubscription[]
  usageMetrics: UsageMetric[]
  customer: PortalCustomer
  sessionId: string
  accentColor?: string
  onUpdate: () => void
  onCancel: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 dark:text-gray-500 uppercase mb-1">
      {children}
    </p>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function LightningIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 2L4.5 13.5H11L10 22L20 10.5H13.5L13 2Z" />
    </svg>
  )
}

function StatusBadge({ status, cancelAtPeriodEnd }: { status: string; cancelAtPeriodEnd: boolean }) {
  if (cancelAtPeriodEnd) {
    return (
      <span className="px-2.5 py-0.5 text-xs rounded-full bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20 font-medium">
        Cancelling
      </span>
    )
  }
  const map: Record<string, string> = {
    active: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20',
    trialing: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    canceled: 'bg-gray-100 dark:bg-neutral-700/60 text-gray-500 dark:text-neutral-400 border-gray-200 dark:border-neutral-600/50',
    past_due: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
  }
  const cls = map[status] ?? 'bg-gray-100 dark:bg-neutral-700/60 text-gray-500 dark:text-neutral-400 border-gray-200 dark:border-neutral-600/50'
  return (
    <span className={`px-2.5 py-0.5 text-xs rounded-full border capitalize font-medium ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
  })
}

function formatPrice(amount: number, currency: string, interval: string) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100)
  return `${formatted} / ${interval}`
}

export function SubscriptionTab({
  subscriptions,
  usageMetrics,
  customer,
  sessionId,
  onUpdate: _onUpdate,
  onCancel,
}: SubscriptionTabProps) {
  const { sendMessage } = useParentMessaging()
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [subscriptionToCancel, setSubscriptionToCancel] = useState<PortalSubscription | null>(null)
  const [cancelTiming, setCancelTiming] = useState<'end_of_period' | 'immediate'>('end_of_period')
  const [cancelReason, setCancelReason] = useState('')
  const [cancelFeedback, setCancelFeedback] = useState('')
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  if (subscriptions.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400 dark:text-neutral-500 text-sm">
        No active subscriptions.
      </div>
    )
  }

  const handleCancelClick = (subscription: PortalSubscription) => {
    setSubscriptionToCancel(subscription)
    setShowCancelModal(true)
    setCancelTiming('end_of_period')
    setCancelReason('')
    setCancelFeedback('')
    setConfirmChecked(false)
    setCancelError(null)
  }

  const handleCancelSubmit = async () => {
    if (!subscriptionToCancel || !confirmChecked) return
    setIsCancelling(true)
    setCancelError(null)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/v1/portal/${sessionId}/cancel-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subscriptionToCancel.id,
          timing: cancelTiming,
          reason: cancelReason || undefined,
          feedback: cancelFeedback || undefined,
        }),
      })
      if (!response.ok) throw new Error('Failed to cancel subscription')
      setShowCancelModal(false)
      setSubscriptionToCancel(null)
      onCancel()
    } catch {
      setCancelError('Failed to cancel subscription. Please try again.')
    } finally {
      setIsCancelling(false)
    }
  }

  const openPricingTable = (subscriptionId?: string) =>
    sendMessage({
      type: 'OPEN_PRICING_TABLE',
      payload: {
        customer: { email: customer?.email, name: customer?.name },
        existingSubscriptionId: subscriptionId,
      },
    })

  return (
    <>
      <div className="space-y-3 mt-4">
        {subscriptions.map((subscription) => (
          <React.Fragment key={subscription.id}>
            {/* Current Plan Card */}
            <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-[#2e2e30] overflow-hidden">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                      {subscription.product.name}
                    </h3>
                    {subscription.product.description && (
                      <p className="text-sm text-gray-500 dark:text-neutral-400 mt-0.5">
                        {subscription.product.description}
                      </p>
                    )}
                  </div>
                  <StatusBadge
                    status={subscription.status}
                    cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
                  />
                </div>

                <div className="space-y-1.5 text-sm">
                  <p className="text-gray-700 dark:text-neutral-300">
                    <span className="text-gray-500 dark:text-neutral-400">Price: </span>
                    <span className="font-medium">
                      {formatPrice(subscription.price.amount, subscription.price.currency, subscription.price.interval)}
                    </span>
                  </p>
                  <p className="text-gray-700 dark:text-neutral-300">
                    <span className="text-gray-500 dark:text-neutral-400">Current Period: </span>
                    <span className="font-medium">
                      {formatDate(subscription.currentPeriodStart)} – {formatDate(subscription.currentPeriodEnd)}
                    </span>
                  </p>
                  {subscription.trialEnd && new Date(subscription.trialEnd) > new Date() && (
                    <p className="text-blue-600 dark:text-blue-400 font-medium">
                      Trial ends {formatDate(subscription.trialEnd)}
                    </p>
                  )}
                  {subscription.cancelAtPeriodEnd && (
                    <p className="text-yellow-600 dark:text-yellow-400">
                      Access ends {formatDate(subscription.currentPeriodEnd)}
                    </p>
                  )}
                  {subscription.pendingDowngrade && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Switching to <span className="font-semibold">{subscription.pendingDowngrade.newProductName}</span>{' '}
                        ({formatPrice(subscription.pendingDowngrade.newAmount, subscription.pendingDowngrade.newCurrency, subscription.pendingDowngrade.newInterval)}){' '}
                        on {formatDate(subscription.pendingDowngrade.scheduledFor)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {subscription.status !== 'canceled' && !subscription.cancelAtPeriodEnd && (
                <>
                  <div className="border-t border-gray-100 dark:border-[#2e2e30]" />
                  <div className="px-6 py-4 flex items-center gap-3">
                    <button
                      onClick={() => openPricingTable(subscription.id)}
                      className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-[#2e2e30] text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                    >
                      Change Plan
                    </button>
                    <button
                      onClick={() => handleCancelClick(subscription)}
                      className="px-4 py-2 text-sm font-medium rounded-xl border border-red-200 dark:border-red-500/30 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                    >
                      Cancel Subscription
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Features Card */}
            {subscription.features.length > 0 && (
              <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-[#2e2e30] overflow-hidden">
                <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
                  <div>
                    <SectionLabel>What's included</SectionLabel>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                      {subscription.product.name}
                    </h4>
                  </div>
                  {subscription.status !== 'canceled' && !subscription.cancelAtPeriodEnd && (
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => openPricingTable(subscription.id)}
                        className="text-sm text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-white transition-colors whitespace-nowrap"
                      >
                        View all plans →
                      </button>
                      <button
                        onClick={() => openPricingTable(subscription.id)}
                        className="px-4 py-2 text-sm font-semibold rounded-xl bg-[var(--portal-accent,#3b82f6)] text-white hover:opacity-90 transition-opacity flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <LightningIcon />
                        Upgrade now
                      </button>
                    </div>
                  )}
                </div>
                <div className="px-6 pb-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                    {subscription.features.map((feature) => (
                      <div key={feature.id} className="flex items-center gap-2">
                        <CheckIcon />
                        <span className="text-sm text-gray-700 dark:text-neutral-300">{feature.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}

        {/* Usage Card */}
        <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-gray-200 dark:border-[#2e2e30] p-6">
          {!usageMetrics || usageMetrics.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              No usage limits on your current plan.
            </p>
          ) : (
            <>
              <SectionLabel>Usage</SectionLabel>
              <div className="space-y-4 mt-2">
                {usageMetrics.map((metric) => (
                  <div key={metric.featureId}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">{metric.featureName}</span>
                      <span className="text-xs text-gray-400 dark:text-neutral-500">
                        {metric.used.toLocaleString()} / {metric.limit ? metric.limit.toLocaleString() : '∞'} {metric.unit}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-[#0f0f11] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            metric.percentage >= 90 ? 'bg-red-500' : metric.percentage >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(metric.percentage, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium w-9 text-right ${
                        metric.percentage >= 90 ? 'text-red-500 dark:text-red-400' : metric.percentage >= 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
                      }`}>
                        {metric.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cancel Modal */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Cancel Subscription?</DialogTitle>
            <DialogDescription>Please let us know why you're cancelling.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {cancelError && (
              <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                {cancelError}
              </div>
            )}
            <div className="space-y-2">
              <Label>When to cancel</Label>
              <RadioGroup value={cancelTiming} onValueChange={(val: 'end_of_period' | 'immediate') => setCancelTiming(val)}>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="end_of_period" id="end_of_period" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="end_of_period" className="font-normal cursor-pointer">At end of billing period</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Keep access until{' '}
                      {subscriptionToCancel && new Date(subscriptionToCancel.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="immediate" id="immediate" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="immediate" className="font-normal cursor-pointer">Cancel immediately</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Lose access now (no refund)</p>
                  </div>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="too_expensive">Too expensive</SelectItem>
                  <SelectItem value="not_using">Not using enough</SelectItem>
                  <SelectItem value="missing_features">Missing features</SelectItem>
                  <SelectItem value="found_alternative">Found alternative</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Additional feedback (optional)</Label>
              <Textarea
                placeholder="Tell us more..."
                value={cancelFeedback}
                onChange={(e) => setCancelFeedback(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex items-start space-x-2">
              <Checkbox
                id="confirm"
                checked={confirmChecked}
                onCheckedChange={(checked) => setConfirmChecked(!!checked)}
              />
              <Label htmlFor="confirm" className="text-sm font-normal cursor-pointer text-muted-foreground">
                I understand that{' '}
                {cancelTiming === 'immediate'
                  ? 'I will lose access immediately'
                  : 'my subscription will be cancelled at the end of the billing period'}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowCancelModal(false)}
              disabled={isCancelling}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-[#2e2e30] text-gray-600 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5 transition-all disabled:opacity-50"
            >
              Keep subscription
            </button>
            <button
              onClick={handleCancelSubmit}
              disabled={!confirmChecked || isCancelling}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel subscription'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
