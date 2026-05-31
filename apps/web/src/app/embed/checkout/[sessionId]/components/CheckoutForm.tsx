'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  PaymentElement,
  Elements,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import {
  useCheckout,
  PaymentElement as CheckoutPaymentElement,
} from '@stripe/react-stripe-js/checkout'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'
import { useEmbedApiUrl } from '../../../EmbedApiProvider'

interface CheckoutSubscription {
  id: string
  customerId: string
  productId: string
  priceId: string
  status: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

interface CheckoutSessionDetails {
  id: string
  clientSecret: string
  amount: number
  currency: string
  totalAmount: number
  stripeAccountId?: string
  checkoutMode?: 'standard' | 'adaptive' | 'free' | 'trial' | 'upgrade' | 'downgrade'
  publishableKey?: string
  trialDays?: number
  downgradeInfo?: {
    effectiveDate?: string
    newPrice: number
    newInterval: string
    newIntervalCount: number
    currency: string
  }
  proration?: {
    credit: number
    charge: number
    netAmount: number
    currency: string
  }
  customer?: {
    email?: string
    name?: string
  }
  product?: {
    name?: string
    description?: string
    features?: string[]
    interval?: 'day' | 'week' | 'month' | 'year'
  }
  subscription?: CheckoutSubscription
}

export interface PaymentFailureDetails {
  message: string
  code?: string
  declineCode?: string
  type?: string
}

interface CheckoutFormProps {
  session: CheckoutSessionDetails
  onSuccess: (subscription?: CheckoutSubscription) => void
  // Terminal error — kills the form (e.g. session expired, polling exhausted).
  onError: (error: Error) => void
  // Recoverable payment failure — form stays mounted; user can retry inline.
  onPaymentFailed: (details: PaymentFailureDetails) => void
  onProcessing: () => void
  onHeightChange: (height: number) => void
  theme?: 'light' | 'dark' | 'auto'
  accentColor?: string
}

/**
 * Stripe surfaces errors in two distinct shapes depending on which SDK
 * raised them:
 *
 * 1. Custom Checkout SDK (`@stripe/react-stripe-js/checkout`, used by
 *    the standard + adaptive flows). `checkout.confirm()` returns
 *    `{ type: 'error', error: ConfirmError }` where ConfirmError is
 *    `{ message, code: 'paymentFailed', paymentFailed: { declineCode } }`
 *    or `{ message, code: null }` (AnyBuyerError). Both are buyer-side
 *    failures by Stripe's own typing — always recoverable inline.
 *
 * 2. Standard Stripe.js (`@stripe/stripe-js`, used by the trial flow
 *    via `stripe.confirmSetup()`). Returns the canonical StripeError
 *    with `type` (`card_error` / `validation_error` / `invalid_request_error`
 *    / `api_error` / `idempotency_error`) and a Stripe error `code`.
 *    Only `invalid_request_error` with a session-state code is fatal.
 */

// Decline-code copy (applies to both SDK shapes). Stripe's decline_code
// reference: https://docs.stripe.com/declines/codes
const DECLINE_COPY: Record<string, string> = {
  insufficient_funds: 'Your card has insufficient funds. Try a different card.',
  lost_card: 'This card was reported lost. Please use a different card.',
  stolen_card: 'This card was reported stolen. Please use a different card.',
  expired_card: 'Your card has expired. Try a different card.',
  incorrect_cvc: 'The security code is incorrect. Double-check and try again.',
  incorrect_number: 'The card number is incorrect. Double-check and try again.',
  fraudulent: 'Your bank declined the charge. Try a different card.',
  generic_decline: 'Your bank declined the charge. Try a different card or contact your bank.',
  do_not_honor: 'Your bank declined the charge. Try a different card or contact your bank.',
  transaction_not_allowed: 'Your bank doesn’t allow this transaction. Try a different card.',
  pickup_card: 'Your bank declined the charge. Please use a different card.',
  card_velocity_exceeded: 'This card has hit its usage limit. Try a different card or wait a while.',
  withdrawal_count_limit_exceeded: 'This card has hit its withdrawal limit. Try a different card.',
  approve_with_id: 'The bank couldn’t approve the charge. Try a different card.',
  call_issuer: 'Your bank needs you to authorize the charge. Contact them or try a different card.',
  authentication_required: 'Your bank requires authentication. Complete the verification or try a different card.',
}

// Stripe.js standard `error.code` copy.
const STRIPE_CODE_COPY: Record<string, string> = {
  card_declined: 'Your card was declined. Try a different card.',
  expired_card: 'Your card has expired. Try a different card.',
  incorrect_cvc: 'The security code is incorrect. Double-check and try again.',
  incorrect_number: 'The card number is incorrect. Double-check and try again.',
  invalid_number: 'The card number is invalid. Please re-enter your card.',
  invalid_expiry_month: 'The expiration month is invalid.',
  invalid_expiry_year: 'The expiration year is invalid.',
  invalid_cvc: 'The security code is invalid.',
  incomplete_number: 'Please enter your full card number.',
  incomplete_cvc: 'Please enter the security code.',
  incomplete_expiry: 'Please enter the expiration date.',
  processing_error: 'We couldn’t process your card right now. Please try again in a moment.',
  authentication_required: 'Your bank requires authentication. Complete the verification or try a different card.',
  payment_intent_authentication_failure: 'We couldn’t verify your card with your bank. Please try again or use a different card.',
  setup_intent_authentication_failure: 'We couldn’t verify your card with your bank. Please try again or use a different card.',
  insufficient_funds: 'Your card has insufficient funds. Try a different card.',
  card_decline_rate_limit_exceeded: 'This card has been declined too many times. Try again later or use a different card.',
  payment_method_not_available: 'That payment method is temporarily unavailable. Try again or use a different one.',
  payment_method_provider_timeout: 'Your bank took too long to respond. Try again or use a different card.',
  payment_method_provider_decline: 'Your bank declined the charge. Try a different card.',
}

/**
 * Subset of Stripe.js StripeError we actually inspect. Kept narrow so any
 * shape returned by submit()/confirmSetup() is structurally assignable.
 */
interface StandardStripeError {
  type?: string
  code?: string
  decline_code?: string
  message?: string
}

/**
 * Custom Checkout SDK error shape (from `@stripe/react-stripe-js/checkout`).
 */
interface CustomCheckoutConfirmError {
  message: string
  code: 'paymentFailed' | null
  paymentFailed?: { declineCode: string | null }
}

function friendlyCustomCheckoutMessage(err: CustomCheckoutConfirmError): string {
  const declineCode = err.paymentFailed?.declineCode
  if (declineCode && DECLINE_COPY[declineCode]) return DECLINE_COPY[declineCode]
  // Stripe's default `message` for paymentFailed is usually fine — it's the
  // localized message they show in their own Checkout. Fall back to a sane
  // default if missing.
  return err.message || 'Your payment couldn’t be completed. Please try again.'
}

function friendlyStandardStripeMessage(err: StandardStripeError): string {
  if (err.decline_code && DECLINE_COPY[err.decline_code]) return DECLINE_COPY[err.decline_code]
  if (err.code && STRIPE_CODE_COPY[err.code]) return STRIPE_CODE_COPY[err.code]
  return err.message || 'Your payment couldn’t be completed. Please try again.'
}

/**
 * Standard Stripe.js errors that mean the underlying PaymentIntent /
 * SetupIntent / session is dead and the customer cannot recover by
 * retrying inline. Reference: https://docs.stripe.com/error-codes
 */
const FATAL_STRIPE_CODES = new Set([
  'payment_intent_unexpected_state',
  'intent_invalid_state',
  'payment_intent_payment_attempt_expired',
  'resource_missing',
  'setup_intent_unexpected_state',
])

function isFatalStandardStripeError(err: StandardStripeError): boolean {
  if (err.code && FATAL_STRIPE_CODES.has(err.code)) return true
  // `idempotency_error` means the same key was reused with a different
  // request — programmer error, not buyer-recoverable.
  if (err.type === 'idempotency_error') return true
  return false
}

export const stripeAppearance = {
  theme: 'flat' as const,
  variables: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSizeBase: '13px',
    fontLineHeight: '1.5',
    borderRadius: '10px',
    colorBackground: '#ffffff',
    colorText: '#111827',
    colorTextSecondary: '#6b7280',
    colorTextPlaceholder: '#9ca3af',
    colorPrimary: '#2563eb',
    colorDanger: '#ef4444',
    spacingUnit: '4px',
    spacingGridRow: '14px',
  },
  rules: {
    '.Input': {
      padding: '10px 12px',
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      boxShadow: 'none',
      fontSize: '13px',
      color: '#111827',
    },
    '.Input:focus': {
      backgroundColor: '#ffffff',
      border: '1px solid #2563eb',
      boxShadow: '0 0 0 3px rgba(37,99,235,0.1)',
      outline: 'none',
    },
    '.Input--invalid': {
      border: '1px solid #ef4444',
      boxShadow: 'none',
    },
    '.Tab': {
      padding: '8px 10px 7px 10px',
      border: '1px solid #e5e7eb',
      backgroundColor: '#f9fafb',
      boxShadow: 'none',
      fontSize: '12px',
      fontWeight: '500',
      color: '#374151',
    },
    '.Tab:hover': {
      border: '1px solid #d1d5db',
      backgroundColor: '#f3f4f6',
      boxShadow: 'none',
      color: '#111827',
    },
    '.Tab--selected, .Tab--selected:focus, .Tab--selected:hover': {
      border: '1.5px solid #111827',
      backgroundColor: '#ffffff',
      boxShadow: 'none',
      color: '#111827',
    },
    '.Label': {
      fontSize: '12px',
      fontWeight: '500',
      color: '#4b5563',
      marginBottom: '5px',
    },
    '.Error': {
      fontSize: '11px',
      color: '#ef4444',
    },
    '.Block': {
      backgroundColor: '#ffffff',
      boxShadow: 'none',
      border: '1px solid #e5e7eb',
    },
  }
}

export const stripeAppearanceDark = (accentColor = '#3b82f6') => ({
  theme: 'flat' as const,
  variables: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSizeBase: '13px', borderRadius: '10px',
    colorBackground: '#0f0f11', colorText: '#f4f4f5',
    colorTextSecondary: '#a1a1aa', colorTextPlaceholder: '#52525b',
    colorPrimary: accentColor, colorDanger: '#f87171',
    spacingUnit: '4px', spacingGridRow: '14px',
  },
  rules: {
    '.Input': { backgroundColor: '#0f0f11', border: '1px solid #2e2e30', color: '#f4f4f5', padding: '10px 12px', boxShadow: 'none' },
    '.Input:focus': { backgroundColor: '#0f0f11', border: `1px solid ${accentColor}`, boxShadow: `0 0 0 3px ${accentColor}26` },
    '.Input--invalid': { border: '1px solid #f87171', boxShadow: 'none' },
    '.Tab': { backgroundColor: '#1c1c1e', border: '1px solid #2e2e30', color: '#a1a1aa', padding: '8px 10px 7px' },
    '.Tab:hover': { backgroundColor: '#242426', border: '1px solid #3f3f46', color: '#f4f4f5' },
    '.Tab--selected, .Tab--selected:focus, .Tab--selected:hover': { backgroundColor: '#0f0f11', border: '1.5px solid #f4f4f5', color: '#f4f4f5' },
    '.Label': { color: '#a1a1aa', fontSize: '12px', fontWeight: '500' },
    '.Error': { color: '#f87171', fontSize: '11px' },
    '.Block': { backgroundColor: '#1c1c1e', border: '1px solid #2e2e30' },
  }
})

export const getStripeAppearance = (theme?: string, accentColor?: string) => {
  const base = theme === 'dark' ? stripeAppearanceDark(accentColor) : { ...stripeAppearance }

  // Apply --bos-* overrides from URL params (read from <html> style)
  if (typeof document !== 'undefined') {
    const s = document.documentElement.style
    const primary = s.getPropertyValue('--bos-primary').trim()
    const bg = s.getPropertyValue('--bos-bg').trim()
    const text = s.getPropertyValue('--bos-text').trim()
    const radius = s.getPropertyValue('--bos-radius').trim()
    const font = s.getPropertyValue('--bos-font').trim()

    if (primary) base.variables = { ...base.variables, colorPrimary: primary }
    if (bg) base.variables = { ...base.variables, colorBackground: bg }
    if (text) base.variables = { ...base.variables, colorText: text }
    if (radius) base.variables = { ...base.variables, borderRadius: radius }
    if (font) base.variables = { ...base.variables, fontFamily: font }
  }

  return base
}

// Component for handling free product checkouts (no payment required)
function FreeProductCheckout({
  session,
  onSuccess,
  onHeightChange
}: {
  session: CheckoutSessionDetails
  onSuccess: (subscription?: CheckoutSubscription) => void
  onHeightChange: (height: number) => void
}) {
  const [isActivating, setIsActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const apiBaseUrl = useEmbedApiUrl()

  useEffect(() => {
    if (!formRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height + 100)
      }
    })
    resizeObserver.observe(formRef.current)
    return () => resizeObserver.disconnect()
  }, [onHeightChange])

  const handleActivate = async () => {
    setIsActivating(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/v1/checkout/${session.id}/confirm-free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to activate subscription')
      }

      const subscription = await response.json()
      setTimeout(() => onSuccess(subscription), 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate subscription')
      setIsActivating(false)
    }
  }

  return (
    <div ref={formRef} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleActivate}
        disabled={isActivating}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${isActivating ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[var(--checkout-accent,#3b82f6)] text-white hover:opacity-90'
          }`}
      >
        {isActivating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Activating...
          </span>
        ) : (
          'Get Started — It\'s Free'
        )}
      </button>

      <TrustSignals />
    </div>
  )
}

// Component for handling upgrade checkouts (no payment form — confirms in-place upgrade)
function UpgradeCheckout({
  session,
  onSuccess,
  onHeightChange,
}: {
  session: CheckoutSessionDetails
  onSuccess: (subscription?: CheckoutSubscription) => void
  onHeightChange: (height: number) => void
}) {
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const apiBaseUrl = useEmbedApiUrl()

  useEffect(() => {
    if (!formRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height + 100)
      }
    })
    resizeObserver.observe(formRef.current)
    return () => resizeObserver.disconnect()
  }, [onHeightChange])

  const handleConfirm = async () => {
    setIsUpgrading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/v1/checkout/${session.id}/confirm-upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to confirm upgrade')
      }

      const subscription = await response.json()
      setTimeout(() => onSuccess(subscription), 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm upgrade')
      setIsUpgrading(false)
    }
  }

  const netAmount = session.proration?.netAmount ?? session.totalAmount
  const displayCurrency = session.proration?.currency ?? session.currency
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: displayCurrency.toUpperCase(),
  }).format(netAmount / 100)

  // Trial-to-trial upgrade: new plan has a trial and net amount is $0
  const isTrialToTrial = (session.trialDays ?? 0) > 0 && netAmount === 0

  return (
    <div ref={formRef} className="space-y-4">
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          {isTrialToTrial
            ? `Your plan will be upgraded with a ${session.trialDays}-day free trial. You won\u2019t be charged until the trial ends.`
            : netAmount > 0
              ? `Your payment method will be charged ${formattedAmount} for the prorated upgrade.`
              : 'No charge today \u2014 you have credit from your previous plan that covers this upgrade.'}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={isUpgrading}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${isUpgrading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[var(--checkout-accent,#3b82f6)] text-white hover:opacity-90'
          }`}
      >
        {isUpgrading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {isTrialToTrial ? 'Starting trial...' : 'Upgrading...'}
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
            </svg>
            {isTrialToTrial
              ? `Start ${session.trialDays}-day trial`
              : netAmount > 0
                ? `Confirm Upgrade \u2014 ${formattedAmount}`
                : 'Confirm Upgrade \u2014 No charge'}
          </span>
        )}
      </button>

      <TrustSignals />
    </div>
  )
}

// Component for handling downgrade checkouts (no payment form — confirms in-place downgrade)
function DowngradeCheckout({
  session,
  onSuccess,
  onHeightChange,
}: {
  session: CheckoutSessionDetails
  onSuccess: (subscription?: CheckoutSubscription) => void
  onHeightChange: (height: number) => void
}) {
  const [isDowngrading, setIsDowngrading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const apiBaseUrl = useEmbedApiUrl()

  useEffect(() => {
    if (!formRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height + 100)
      }
    })
    resizeObserver.observe(formRef.current)
    return () => resizeObserver.disconnect()
  }, [onHeightChange])

  const handleConfirm = async () => {
    setIsDowngrading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/v1/checkout/${session.id}/confirm-downgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to schedule downgrade')
      }

      const result = await response.json()
      // The confirm endpoint returns { status: 'scheduled', scheduledFor, subscriptionId }
      setTimeout(() => onSuccess(result.subscriptionId ? { id: result.subscriptionId } as CheckoutSubscription : undefined), 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule downgrade')
      setIsDowngrading(false)
    }
  }

  const info = session.downgradeInfo
  const displayCurrency = info?.currency ?? session.currency
  const newPrice = info?.newPrice ?? session.amount
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: displayCurrency.toUpperCase(),
  }).format(newPrice / 100)
  const intervalLabels: Record<string, string> = { day: 'day', week: 'wk', month: 'month', year: 'year' }
  const intervalShort = intervalLabels[info?.newInterval || session.product?.interval || ''] || 'mo'

  return (
    <div ref={formRef} className="space-y-4">
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Your plan will change to {session.product?.name || 'the new plan'}{info?.effectiveDate ? ` on ${new Date(info.effectiveDate).toLocaleDateString()}` : ' at the end of your current billing period'}. You&apos;ll keep your current features until then.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={isDowngrading}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${isDowngrading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[var(--checkout-accent,#3b82f6)] text-white hover:opacity-90'
          }`}
      >
        {isDowngrading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Processing...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
            </svg>
            Confirm Plan Change — {formattedPrice}/{intervalShort}
          </span>
        )}
      </button>

      <TrustSignals />
    </div>
  )
}

function TrustSignals() {
  return (
    <>
      <div className="flex items-center justify-center gap-3 text-[11px] text-gray-400 mt-3">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.103 1.05.103 1.589 0 5.162-3.26 9.563-7.842 11.08a.518.518 0 01-.316 0C5.26 16.564 2 12.163 2 7c0-.538.034-1.069.103-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.077-2.749z" clipRule="evenodd" />
          </svg>
          Secure checkout
        </span>
        <span className="text-gray-200 dark:text-gray-700">|</span>
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          SSL encrypted
        </span>
      </div>
      <p className="text-center text-[11px] text-gray-400 mt-1.5">Powered by BillingOS</p>
    </>
  )
}

export function CheckoutForm({
  session,
  onSuccess,
  onError,
  onPaymentFailed,
  onProcessing,
  onHeightChange,
  theme,
  accentColor,
}: CheckoutFormProps) {
  const isFreeProduct =
    session.checkoutMode === 'free' ||
    (!session.clientSecret && session.checkoutMode !== 'trial' && session.checkoutMode !== 'upgrade' && session.checkoutMode !== 'downgrade')

  const stripePromise = useMemo(() => {
    if (isFreeProduct) return null
    const publishableKey =
      session.publishableKey ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    if (session.stripeAccountId) {
      return loadStripe(publishableKey, { stripeAccount: session.stripeAccountId })
    }
    return loadStripe(publishableKey)
  }, [session.stripeAccountId, session.publishableKey, isFreeProduct])

  if (isFreeProduct) {
    return (
      <FreeProductCheckout
        session={session}
        onSuccess={onSuccess}
        onHeightChange={onHeightChange}
      />
    )
  }

  if (session.checkoutMode === 'upgrade') {
    return (
      <UpgradeCheckout
        session={session}
        onSuccess={onSuccess}
        onHeightChange={onHeightChange}
      />
    )
  }

  if (session.checkoutMode === 'downgrade') {
    return (
      <DowngradeCheckout
        session={session}
        onSuccess={onSuccess}
        onHeightChange={onHeightChange}
      />
    )
  }

  // Adaptive + non-hosted standard both ride the Stripe Checkout Session
  // backbone via `useCheckout()`. CheckoutContent has already wrapped the
  // tree in <CheckoutProvider>, so we render the form directly.
  if (
    session.checkoutMode === 'adaptive' ||
    session.checkoutMode === 'standard'
  ) {
    return (
      <CheckoutFormCustom
        session={session}
        onSuccess={onSuccess}
        onError={onError}
        onPaymentFailed={onPaymentFailed}
        onProcessing={onProcessing}
        onHeightChange={onHeightChange}
        theme={theme}
        accentColor={accentColor}
      />
    )
  }

  if (session.checkoutMode === 'trial') {
    const trialOptions: StripeElementsOptions = {
      clientSecret: session.clientSecret,
      appearance: getStripeAppearance(theme, accentColor),
    }
    return (
      <Elements key={`${session.clientSecret}-${theme ?? 'light'}`} stripe={stripePromise} options={trialOptions}>
        <CheckoutFormTrial
          session={session}
          onSuccess={onSuccess}
          onError={onError}
          onPaymentFailed={onPaymentFailed}
          onProcessing={onProcessing}
          onHeightChange={onHeightChange}
          theme={theme}
        />
      </Elements>
    )
  }

  return null
}

function CheckoutFormCustom({
  session,
  onSuccess,
  onError,
  onPaymentFailed,
  onProcessing,
  onHeightChange,
}: CheckoutFormProps) {
  const checkoutResult = useCheckout()
  const checkout = checkoutResult.type === 'success' ? checkoutResult.checkout : null
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [name, setName] = useState(session.customer?.name || '')
  const [email, setEmail] = useState(session.customer?.email || '')
  const namePrefilled = !!session.customer?.name
  const emailPrefilled = !!session.customer?.email
  const formRef = useRef<HTMLDivElement>(null)
  const errorBannerRef = useRef<HTMLDivElement>(null)
  const apiBaseUrl = useEmbedApiUrl()

  useEffect(() => {
    if (!formRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height + 100)
      }
    })
    resizeObserver.observe(formRef.current)
    return () => resizeObserver.disconnect()
  }, [onHeightChange])

  // Scroll the error banner into view when a recoverable failure surfaces.
  useEffect(() => {
    if (errorMessage && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [errorMessage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkout || checkoutResult.type !== 'success') return

    setIsProcessing(true)
    setErrorMessage(null)

    try {
      // Don't notify the parent we're "processing" yet — Stripe may render a
      // 3DS challenge inline within this iframe, and the parent SDK overlays
      // the iframe with a full-cover "Processing payment…" loader on PROCESSING,
      // which would block clicks on the 3DS modal. The button below already
      // shows an inline spinner during confirm().
      const result = await checkout.confirm({ redirect: 'if_required' })

      if (result?.type === 'error') {
        // Custom Checkout SDK ConfirmError shape — always a buyer error
        // (`paymentFailed` or AnyBuyerError with code: null). Both are
        // recoverable inline; the form stays mounted.
        const stripeErr = result.error as CustomCheckoutConfirmError
        const friendly = friendlyCustomCheckoutMessage(stripeErr)
        setErrorMessage(friendly)
        onPaymentFailed({
          message: friendly,
          code: stripeErr.code ?? undefined,
          declineCode: stripeErr.paymentFailed?.declineCode ?? undefined,
        })
        setIsProcessing(false)
        return
      }

      // 3DS (if any) is done — safe to surface the parent overlay while we
      // poll for the subscription record.
      onProcessing()

      let attempts = 0
      const maxAttempts = 20
      const pollForSubscription = async () => {
        try {
          const response = await fetch(`${apiBaseUrl}/v1/checkout/${session.id}/status`)
          const data = await response.json()
          if (data.subscription) {
            onSuccess(data.subscription)
          } else if (attempts < maxAttempts) {
            attempts++
            setTimeout(pollForSubscription, 500)
          } else {
            onSuccess(undefined)
          }
        } catch {
          onSuccess(undefined)
        }
      }
      pollForSubscription()
    } catch (error) {
      // Unexpected throw (network, etc.) — assume recoverable, keep the form.
      const message = error instanceof Error ? error.message : 'Payment failed'
      setErrorMessage(message)
      onPaymentFailed({ message })
    } finally {
      setIsProcessing(false)
    }
  }

  const checkoutTotal = (checkout as any)?.total?.total?.minorUnitsAmount
  const checkoutCurrency = (checkout as any)?.currency
  const ctaAmount = checkoutTotal ?? session.totalAmount
  const ctaCurrency = checkoutCurrency ?? session.currency
  const ctaFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: ctaCurrency.toUpperCase() }).format(ctaAmount / 100)
  const intervalLabels: Record<string, string> = { day: 'day', week: 'wk', month: 'month', year: 'year' }
  const intervalShort = intervalLabels[session.product?.interval || ''] || 'mo'
  const ctaLabel = ctaAmount === 0 ? `Pay ${ctaFormatted} today` : `Pay ${ctaFormatted}/${intervalShort}`

  if (checkoutResult.type === 'loading') {
    return <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
  }

  if (checkoutResult.type === 'error') {
    return <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md"><p className="text-sm text-red-600 dark:text-red-400">{checkoutResult.error.message}</p></div>
  }

  return (
    <form ref={formRef as any} onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="adaptive-name" className="block text-xs font-medium text-gray-600 mb-1">
          Name
        </label>
        <input
          type="text"
          id="adaptive-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full px-3 py-2 border border-gray-200 dark:border-[#2e2e30] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 disabled:bg-gray-50 disabled:dark:bg-[#1c1c1e] disabled:text-gray-500 disabled:dark:text-gray-500 disabled:cursor-default"
          disabled={isProcessing || namePrefilled}
        />
      </div>

      <div>
        <label htmlFor="adaptive-email" className="block text-xs font-medium text-gray-600 mb-1">
          Email
        </label>
        <input
          type="email"
          id="adaptive-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 border border-gray-200 dark:border-[#2e2e30] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 disabled:bg-gray-50 disabled:dark:bg-[#1c1c1e] disabled:text-gray-500 disabled:dark:text-gray-500 disabled:cursor-default"
          required
          disabled={isProcessing || emailPrefilled}
        />
      </div>

      <div>
        <CheckoutPaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'apple_pay', 'google_pay', 'link'],
            terms: {
              card: 'never',
              applePay: 'never',
              googlePay: 'never',
              paypal: 'never',
              auBecsDebit: 'never',
              bancontact: 'never',
              ideal: 'never',
              sepaDebit: 'never',
              sofort: 'never',
              usBankAccount: 'never',
            }
          }}
        />
      </div>

      {errorMessage && (
        <div
          ref={errorBannerRef}
          role="alert"
          aria-live="polite"
          className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2"
        >
          <svg className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isProcessing}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${isProcessing ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[var(--checkout-accent,#3b82f6)] text-white hover:opacity-90'
          }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Processing...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            {ctaLabel}
          </span>
        )}
      </button>

      <TrustSignals />
    </form>
  )
}

function CheckoutFormTrial({
  session,
  onSuccess,
  onError,
  onPaymentFailed,
  onProcessing,
  onHeightChange,
}: CheckoutFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [name, setName] = useState(session.customer?.name || '')
  const [email, setEmail] = useState(session.customer?.email || '')
  const namePrefilled = !!session.customer?.name
  const emailPrefilled = !!session.customer?.email
  const formRef = useRef<HTMLFormElement>(null)
  const errorBannerRef = useRef<HTMLDivElement>(null)
  const apiBaseUrl = useEmbedApiUrl()

  useEffect(() => {
    if (session?.customer?.email) setEmail(session.customer.email)
    if (session?.customer?.name) setName(session.customer.name)
  }, [session?.customer])

  useEffect(() => {
    if (!formRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height + 100)
      }
    })
    resizeObserver.observe(formRef.current)
    return () => resizeObserver.disconnect()
  }, [onHeightChange])

  useEffect(() => {
    if (errorMessage && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [errorMessage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsProcessing(true)
    setErrorMessage(null)

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        // elements.submit() only surfaces validation/incomplete-field errors —
        // always recoverable inline.
        const friendly = friendlyStandardStripeMessage(submitError)
        setErrorMessage(friendly)
        onPaymentFailed({
          message: friendly,
          code: submitError.code,
          type: submitError.type,
        })
        setIsProcessing(false)
        return
      }

      // Defer onProcessing() until after confirmSetup() resolves — the parent
      // SDK overlays the iframe with a "Processing payment…" loader on the
      // PROCESSING message, which would block the 3DS challenge that Stripe
      // renders inline within this iframe during confirm.
      const { error: confirmError } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: `${window.location.origin}/embed/checkout/success` },
        redirect: 'if_required',
      })

      if (confirmError) {
        const friendly = friendlyStandardStripeMessage(confirmError)
        setErrorMessage(friendly)
        if (isFatalStandardStripeError(confirmError)) {
          // Session/intent state is dead — only path forward is restarting checkout.
          onError(new Error(friendly))
        } else {
          onPaymentFailed({
            message: friendly,
            code: confirmError.code,
            declineCode: (confirmError as { decline_code?: string }).decline_code,
            type: confirmError.type,
          })
        }
        setIsProcessing(false)
        return
      }

      onProcessing()

      let attempts = 0
      const maxAttempts = 20
      const pollForSubscription = async () => {
        try {
          const response = await fetch(`${apiBaseUrl}/v1/checkout/${session.id}/status`)
          const data = await response.json()
          if (data.subscription) {
            onSuccess(data.subscription)
          } else if (attempts < maxAttempts) {
            attempts++
            setTimeout(pollForSubscription, 500)
          } else {
            onSuccess(undefined)
          }
        } catch {
          onSuccess(undefined)
        }
      }
      pollForSubscription()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Setup failed'
      setErrorMessage(message)
      onPaymentFailed({ message })
    } finally {
      setIsProcessing(false)
    }
  }

  const trialDays = session.trialDays || 0
  const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: session.currency.toUpperCase() }).format(session.amount / 100)
  const intervalLabels: Record<string, string> = { day: 'day', week: 'wk', month: 'month', year: 'year' }
  const intervalShort = intervalLabels[session.product?.interval || ''] || 'mo'

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="trial-name" className="block text-xs font-medium text-gray-600 mb-1">
          Name
        </label>
        <input
          type="text"
          id="trial-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full px-3 py-2 border border-gray-200 dark:border-[#2e2e30] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 disabled:bg-gray-50 disabled:dark:bg-[#1c1c1e] disabled:text-gray-500 disabled:dark:text-gray-500 disabled:cursor-default"
          disabled={isProcessing || namePrefilled}
        />
      </div>

      <div>
        <label htmlFor="trial-email" className="block text-xs font-medium text-gray-600 mb-1">
          Email
        </label>
        <input
          type="email"
          id="trial-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 border border-gray-200 dark:border-[#2e2e30] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 disabled:bg-gray-50 disabled:dark:bg-[#1c1c1e] disabled:text-gray-500 disabled:dark:text-gray-500 disabled:cursor-default"
          required
          disabled={isProcessing || emailPrefilled}
        />
      </div>

      <div>
        <PaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'apple_pay', 'google_pay', 'link'],
          }}
        />
      </div>

      {errorMessage && (
        <div
          ref={errorBannerRef}
          role="alert"
          aria-live="polite"
          className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2"
        >
          <svg className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isProcessing || !stripe || !elements}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${isProcessing
          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-[var(--checkout-accent,#3b82f6)] text-white hover:opacity-90'
          }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Setting up...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            Start {trialDays}-day free trial · then Pay {formattedTotal}/{intervalShort}
          </span>
        )}
      </button>

      <TrustSignals />
    </form>
  )
}

