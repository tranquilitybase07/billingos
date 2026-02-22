'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PlanComparisonCard } from './PlanComparisonCard'
import { ProrationPreview } from './ProrationPreview'
import { useAvailablePlans, usePreviewPlanChange, useChangePlan } from '@/hooks/queries/subscriptions'
import { useToast } from '@/hooks/use-toast'
import type { AvailablePlan, AvailablePlansResponse, ChangeType, PreviewChangeResponse } from '@/lib/api/types'

interface PlanChangeModalProps {
  subscriptionId: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function PlanChangeModal({
  subscriptionId,
  isOpen,
  onClose,
  onSuccess,
}: PlanChangeModalProps) {
  const { toast } = useToast()
  const [selectedPlan, setSelectedPlan] = useState<AvailablePlan | null>(null)
  const [preview, setPreview] = useState<PreviewChangeResponse | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)

  // Fetch available plans
  const { data: availablePlans, isLoading: isLoadingPlans, error: plansError } = useAvailablePlans(
    subscriptionId,
    { enabled: isOpen }
  ) as { data: AvailablePlansResponse | undefined; isLoading: boolean; error: any }

  // Preview mutation
  const previewMutation = usePreviewPlanChange()

  // Change plan mutation
  const changePlanMutation = useChangePlan()

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedPlan(null)
      setPreview(null)
      setShowConfirmation(false)
    }
  }, [isOpen])

  const handleSelectPlan = async (plan: AvailablePlan) => {
    setSelectedPlan(plan)
    setShowConfirmation(false)

    // Get preview
    try {
      const previewData = await previewMutation.mutateAsync({
        subscriptionId,
        data: {
          new_price_id: plan.price_id,
          effective_date: 'immediate', // Can be made configurable
        },
      }) as PreviewChangeResponse

      setPreview(previewData)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to preview plan change',
        variant: 'destructive',
      })
      setSelectedPlan(null)
    }
  }

  const handleConfirm = async () => {
    if (!selectedPlan || !preview) return

    try {
      await changePlanMutation.mutateAsync({
        subscriptionId,
        data: {
          new_price_id: selectedPlan.price_id,
          confirm_amount: preview.proration.immediate_payment,
          effective_date: 'immediate', // Can be made configurable
        },
      })

      toast({
        title: 'Success',
        description: preview.change_type === 'upgrade'
          ? 'Your plan has been upgraded successfully!'
          : 'Your downgrade has been scheduled for the end of your billing period.',
        variant: 'default',
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to change plan',
        variant: 'destructive',
      })
    }
  }

  const allPlans = [
    ...(availablePlans?.available_upgrades || []),
    ...(availablePlans?.available_downgrades || []),
  ]

  const getChangeType = (plan: AvailablePlan): ChangeType => {
    if (!availablePlans?.current_plan) return 'upgrade'
    return plan.amount > (availablePlans.current_plan.amount || 0) ? 'upgrade' : 'downgrade'
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {showConfirmation && selectedPlan
              ? 'Confirm Plan Change'
              : 'Change Your Plan'}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {isLoadingPlans && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-gray-600">Loading available plans...</span>
              </div>
            </div>
          )}

          {plansError && (
            <Alert variant="destructive">
              Failed to load available plans. Please try again.
            </Alert>
          )}

          {!isLoadingPlans && !plansError && !showConfirmation && (
            <div>
              {/* Current Plan */}
              {availablePlans?.current_plan && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Current Plan
                  </h3>
                  <PlanComparisonCard
                    plan={{
                      product_id: availablePlans.current_plan.product_id,
                      product_name: availablePlans.current_plan.product_name,
                      description: null,
                      price_id: availablePlans.current_plan.price_id,
                      amount: availablePlans.current_plan.amount,
                      currency: availablePlans.current_plan.currency,
                      interval: availablePlans.current_plan.interval,
                      is_free: availablePlans.current_plan.amount === 0,
                    }}
                    isCurrentPlan
                    changeType="upgrade"
                  />
                </div>
              )}

              {/* Available Upgrades */}
              {availablePlans?.available_upgrades && availablePlans.available_upgrades.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Available Upgrades
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availablePlans.available_upgrades.map((plan) => (
                      <PlanComparisonCard
                        key={plan.price_id}
                        plan={plan}
                        onSelect={() => handleSelectPlan(plan)}
                        isLoading={previewMutation.isPending && selectedPlan?.price_id === plan.price_id}
                        changeType="upgrade"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Available Downgrades */}
              {availablePlans?.available_downgrades && availablePlans.available_downgrades.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Available Downgrades
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availablePlans.available_downgrades.map((plan) => (
                      <PlanComparisonCard
                        key={plan.price_id}
                        plan={plan}
                        onSelect={() => handleSelectPlan(plan)}
                        isLoading={previewMutation.isPending && selectedPlan?.price_id === plan.price_id}
                        changeType="downgrade"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No Plans Available */}
              {allPlans.length === 0 && (
                <Alert>
                  No other plans are currently available. Contact support if you need assistance.
                </Alert>
              )}

              {/* Restrictions */}
              {availablePlans?.restrictions && availablePlans.restrictions.length > 0 && (
                <Alert className="mt-4">
                  <p className="font-semibold mb-2">Plan Change Restrictions:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {availablePlans.restrictions.map((restriction, idx) => (
                      <li key={idx}>{restriction}</li>
                    ))}
                  </ul>
                </Alert>
              )}
            </div>
          )}

          {/* Confirmation View */}
          {showConfirmation && selectedPlan && preview && (
            <div>
              <Alert className="mb-4">
                <p className="font-semibold">Review your plan change</p>
                <p className="text-sm mt-1">
                  Please review the details below before confirming.
                </p>
              </Alert>

              <ProrationPreview
                currentPlan={preview.current_plan}
                newPlan={preview.new_plan}
                proration={preview.proration}
                changeType={preview.change_type}
                effectiveDate={preview.effective_date}
                notes={preview.notes}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          {!showConfirmation ? (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirmation(false)
                  setPreview(null)
                }}
                disabled={changePlanMutation.isPending}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={changePlanMutation.isPending}
              >
                {changePlanMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  `Confirm ${preview?.change_type === 'upgrade' ? 'Upgrade' : 'Downgrade'}`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
