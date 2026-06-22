'use client'

import * as React from 'react'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  ChurnMachine,
  type ChurnApplyOutcome,
  type ChurnLogEvent,
  type ChurnOutcome,
} from './machine'
import type {
  ChurnFlowConfig,
  ChurnSubscriptionView,
  Offer,
} from './types'

export interface ChurnFlowHandlers {
  onApplyOffer: (reason: string) => Promise<ChurnApplyOutcome>
  onCancel: (
    timing: 'immediate' | 'end_of_period',
    reason?: string,
    feedback?: string,
  ) => Promise<void>
  onLog?: (event: ChurnLogEvent) => void
  onDone?: (outcome: ChurnOutcome) => void
}

export interface ChurnFlowProps extends ChurnFlowHandlers {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: ChurnFlowConfig
  subscription: ChurnSubscriptionView
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

function offerHeadline(offer: Offer, currency: string): string {
  if (offer.headline) return offer.headline
  if (offer.type === 'discount') {
    const amount =
      offer.percentOff != null
        ? `${offer.percentOff}% off`
        : offer.amountOff != null
          ? `${formatCurrency(offer.amountOff, currency)} off`
          : 'a discount'
    const span = offer.durationInMonths
      ? `for ${offer.durationInMonths} month${offer.durationInMonths > 1 ? 's' : ''}`
      : 'on your next bill'
    return `Stay and get ${amount} ${span}`
  }
  return 'We can help'
}

function Header({
  title,
  description,
}: {
  title: string
  description?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-lg font-semibold leading-none tracking-tight text-foreground">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      {...rest}
      className={`px-4 py-2.5 text-sm font-semibold rounded-xl bg-[var(--portal-accent,#3b82f6)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 ${className}`}
    />
  )
}

function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      {...rest}
      className={`px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-[#2e2e30] text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all disabled:opacity-50 ${className}`}
    />
  )
}

function DangerButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props
  return (
    <button
      {...rest}
      className={`px-4 py-2.5 text-sm font-medium rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 ${className}`}
    />
  )
}

/**
 * Renderer body, resolver-agnostic. Uses plain semantic elements (not Dialog
 * primitives) so it renders both inside the portal modal and inline in the
 * dashboard builder's live preview.
 */
export function ChurnFlowBody({
  config,
  subscription,
  onApplyOffer,
  onCancel,
  onLog,
  onDone,
  onClose,
}: ChurnFlowHandlers & {
  config: ChurnFlowConfig
  subscription: ChurnSubscriptionView
  onClose: () => void
}) {
  const handlersRef = useRef({ onApplyOffer, onCancel, onLog, onDone, onClose })
  handlersRef.current = { onApplyOffer, onCancel, onLog, onDone, onClose }

  const machine = useMemo(
    () =>
      new ChurnMachine(
        config,
        {
          applyOffer: (reason) => handlersRef.current.onApplyOffer(reason),
          cancel: (timing, reason, feedback) =>
            handlersRef.current.onCancel(timing, reason, feedback),
          onLog: (event) => handlersRef.current.onLog?.(event),
          onDone: (outcome) => handlersRef.current.onDone?.(outcome),
          onClose: () => handlersRef.current.onClose(),
        },
        { hasActiveDiscount: subscription.hasActiveDiscount },
      ),
    [config, subscription.hasActiveDiscount],
  )

  useEffect(() => {
    machine.start()
  }, [machine])

  const state = useSyncExternalStore(
    machine.subscribe,
    machine.getState,
    machine.getState,
  )

  const survey = machine.getSurveyStep()
  const confirm = machine.getConfirmStep()
  const currentOffer = machine.getCurrentOffer()

  if (state.screen === 'survey' && survey) {
    return (
      <div className="space-y-4">
        <Header
          title={survey.title || 'Before you go…'}
          description="Help us understand why you're leaving."
        />
        <div className="space-y-4">
          <RadioGroup
            value={state.selectedReason ?? ''}
            onValueChange={(v) => machine.selectReason(v)}
          >
            {survey.reasons.map((reason) => (
              <div key={reason.key} className="flex items-center space-x-2">
                <RadioGroupItem value={reason.key} id={`reason-${reason.key}`} />
                <Label
                  htmlFor={`reason-${reason.key}`}
                  className="font-normal cursor-pointer"
                >
                  {reason.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <div className="space-y-2">
            <Label>Anything else? (optional)</Label>
            <Textarea
              placeholder="Tell us more..."
              value={state.feedback}
              onChange={(e) => machine.setFeedback(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <GhostButton onClick={() => machine.close()}>Keep subscription</GhostButton>
          <PrimaryButton
            disabled={!state.selectedReason}
            onClick={() => machine.submitSurvey()}
          >
            Continue
          </PrimaryButton>
        </div>
      </div>
    )
  }

  if (state.screen === 'offer' && currentOffer) {
    return (
      <div className="space-y-4">
        <Header
          title={offerHeadline(currentOffer, subscription.currency)}
          description={currentOffer.description}
        />
        <div>
          {state.error && (
            <div className="mb-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {state.error}
            </div>
          )}
          <p className="text-sm text-gray-600 dark:text-neutral-400">
            Your <span className="font-medium">{subscription.planName}</span> plan stays
            active — no interruption.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {currentOffer.type === 'discount' ? (
            <PrimaryButton
              disabled={state.isProcessing}
              onClick={() => machine.acceptOffer()}
            >
              {state.isProcessing ? 'Applying…' : 'Claim offer & stay'}
            </PrimaryButton>
          ) : (
            <a
              href={currentOffer.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => machine.noteContactOffer()}
              className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-[var(--portal-accent,#3b82f6)] text-white hover:opacity-90 transition-opacity text-center"
            >
              {currentOffer.headline || 'Get help'}
            </a>
          )}
          <GhostButton
            disabled={state.isProcessing}
            onClick={() => machine.declineOffer()}
          >
            No thanks, continue to cancel
          </GhostButton>
        </div>
      </div>
    )
  }

  if (state.screen === 'confirm' && confirm) {
    return (
      <div className="space-y-4">
        <Header
          title={confirm.title || 'Cancel subscription?'}
          description={`${subscription.planName} · ${formatCurrency(subscription.amount, subscription.currency)} / ${subscription.interval}`}
        />
        <div className="space-y-4">
          {state.notice && (
            <div className="px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 text-sm">
              {state.notice}
            </div>
          )}
          {state.error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {state.error}
            </div>
          )}
          {confirm.losses && confirm.losses.length > 0 && (
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-[#2e2e30] p-4">
              <p className="text-xs font-semibold tracking-wide text-gray-500 dark:text-neutral-400 uppercase mb-2">
                You'll lose access to
              </p>
              <ul className="space-y-1.5">
                {confirm.losses.map((loss, i) => (
                  <li
                    key={i}
                    className="text-sm text-gray-700 dark:text-neutral-300 flex items-center gap-2"
                  >
                    <span className="text-red-400">✕</span>
                    {loss}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {confirm.allowImmediate && (
            <div className="space-y-2">
              <Label>When to cancel</Label>
              <RadioGroup
                value={state.timing}
                onValueChange={(v: 'immediate' | 'end_of_period') =>
                  machine.setTiming(v)
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="end_of_period" id="timing-eop" />
                  <Label htmlFor="timing-eop" className="font-normal cursor-pointer">
                    At end of billing period
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="immediate" id="timing-now" />
                  <Label htmlFor="timing-now" className="font-normal cursor-pointer">
                    Immediately (no refund)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <GhostButton disabled={state.isProcessing} onClick={() => machine.close()}>
            Keep subscription
          </GhostButton>
          <DangerButton
            disabled={state.isProcessing}
            onClick={() => machine.confirmCancel()}
          >
            {state.isProcessing ? 'Cancelling…' : 'Cancel subscription'}
          </DangerButton>
        </div>
      </div>
    )
  }

  if (state.screen === 'success') {
    const saved = state.outcome === 'saved'
    return (
      <div className="space-y-4">
        <Header
          title={saved ? "You're all set" : 'Subscription cancelled'}
          description={
            saved
              ? `Your offer has been applied to your ${subscription.planName} plan.`
              : state.timing === 'immediate'
                ? 'Your subscription has been cancelled and access has ended.'
                : 'Your subscription will end at the close of the current billing period.'
          }
        />
        <div className="flex justify-end">
          <PrimaryButton onClick={() => machine.close()}>Done</PrimaryButton>
        </div>
      </div>
    )
  }

  return null
}

export function ChurnFlow({
  open,
  onOpenChange,
  config,
  subscription,
  onApplyOffer,
  onCancel,
  onLog,
  onDone,
}: ChurnFlowProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogTitle className="sr-only">Cancel subscription</DialogTitle>
        {open && (
          <ChurnFlowBody
            config={config}
            subscription={subscription}
            onApplyOffer={onApplyOffer}
            onCancel={onCancel}
            onLog={onLog}
            onDone={onDone}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
