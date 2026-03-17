'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  PaymentElement,
  Elements,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import {
  CheckoutProvider,
  useCheckout,
  PaymentElement as CheckoutPaymentElement,
} from '@stripe/react-stripe-js/checkout'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'

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
  checkoutMode?: 'standard' | 'adaptive' | 'free' | 'trial'
  trialDays?: number
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

interface CheckoutFormProps {
  session: CheckoutSessionDetails
  onSuccess: (subscription?: CheckoutSubscription) => void
  onError: (error: Error) => void
  onProcessing: () => void
  onHeightChange: (height: number) => void
  /** Called when the adaptive pricing total updates (currency change) */
  onTotalChange?: (totalAmount: number, currency: string) => void
  /** When true (adaptive mode), the CheckoutProvider is already created outside — skip wrapping */
  skipProvider?: boolean
  theme?: 'light' | 'dark' | 'auto'
  accentColor?: string
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

export const getStripeAppearance = (theme?: string, accentColor?: string) =>
  theme === 'dark' ? stripeAppearanceDark(accentColor) : stripeAppearance

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
      const response = await fetch(`/api/v1/checkout/${session.id}/confirm-free`, {
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
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${
          isActivating ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[var(--checkout-accent,#3b82f6)] text-white hover:opacity-90'
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
  onProcessing,
  onHeightChange,
  onTotalChange,
  skipProvider,
  theme,
  accentColor,
}: CheckoutFormProps) {
  const isFreeProduct =
    session.checkoutMode === 'free' ||
    (!session.clientSecret && session.checkoutMode !== 'trial')

  const stripePromise = useMemo(() => {
    if (isFreeProduct) return null
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    if (session.stripeAccountId) {
      return loadStripe(publishableKey, { stripeAccount: session.stripeAccountId })
    }
    return loadStripe(publishableKey)
  }, [session.stripeAccountId, isFreeProduct])

  if (isFreeProduct) {
    return (
      <FreeProductCheckout
        session={session}
        onSuccess={onSuccess}
        onHeightChange={onHeightChange}
      />
    )
  }

  if (session.checkoutMode === 'adaptive') {
    // If skipProvider=true, the CheckoutProvider is already created in CheckoutContent
    if (skipProvider) {
      return (
        <CheckoutFormAdaptive
          session={session}
          onSuccess={onSuccess}
          onError={onError}
          onProcessing={onProcessing}
          onHeightChange={onHeightChange}
          onTotalChange={onTotalChange}
          theme={theme}
          accentColor={accentColor}
        />
      )
    }
    return (
      <CheckoutProvider
        key={`${session.clientSecret}-${theme ?? 'light'}`}
        stripe={stripePromise}
        options={{
          clientSecret: session.clientSecret,
          elementsOptions: { appearance: getStripeAppearance(theme, accentColor) },
          adaptivePricing: { allowed: true },
        } as any}
      >
        <CheckoutFormAdaptive
          session={session}
          onSuccess={onSuccess}
          onError={onError}
          onProcessing={onProcessing}
          onHeightChange={onHeightChange}
          onTotalChange={onTotalChange}
          theme={theme}
          accentColor={accentColor}
        />
      </CheckoutProvider>
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
          onProcessing={onProcessing}
          onHeightChange={onHeightChange}
          theme={theme}
        />
      </Elements>
    )
  }

  const options: StripeElementsOptions = {
    clientSecret: session.clientSecret,
    appearance: getStripeAppearance(theme, accentColor),
  }

  return (
    <Elements key={`${session.clientSecret}-${theme ?? 'light'}`} stripe={stripePromise} options={options}>
      <CheckoutFormInner
        session={session}
        onSuccess={onSuccess}
        onError={onError}
        onProcessing={onProcessing}
        onHeightChange={onHeightChange}
        theme={theme}
      />
    </Elements>
  )
}

function CheckoutFormAdaptive({
  session,
  onSuccess,
  onError,
  onProcessing,
  onHeightChange,
  onTotalChange,
  theme,
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

  // Propagate total changes (e.g. when customer selects a different currency)
  useEffect(() => {
    const total = (checkout as any)?.total?.total
    const currency = (checkout as any)?.currency
    if (total && currency && onTotalChange) {
      onTotalChange(total.minorUnitsAmount, currency)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(checkout as any)?.total?.total?.minorUnitsAmount, (checkout as any)?.currency, onTotalChange])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkout || checkoutResult.type !== 'success') return

    setIsProcessing(true)
    setErrorMessage(null)
    onProcessing()

    try {
      const result = await checkout.confirm({ redirect: 'if_required' }) as any

      if (result?.type === 'error' || result?.error) {
        const errorMsg = result.error?.message || result.message || 'Payment failed'
        setErrorMessage(errorMsg)
        onError(new Error(errorMsg))
        setIsProcessing(false)
        return
      }

      let attempts = 0
      const maxAttempts = 20
      const pollForSubscription = async () => {
        try {
          const response = await fetch(`/api/v1/checkout/${session.id}/status`)
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
      const err = error instanceof Error ? error : new Error('Payment failed')
      setErrorMessage(err.message)
      onError(err)
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
        <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isProcessing}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${
          isProcessing ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[var(--checkout-accent,#3b82f6)] text-white hover:opacity-90'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsProcessing(true)
    setErrorMessage(null)
    onProcessing()

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setErrorMessage(submitError.message || 'An error occurred')
        setIsProcessing(false)
        return
      }

      const { error: confirmError } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: `${window.location.origin}/embed/checkout/success` },
        redirect: 'if_required',
      })

      if (confirmError) {
        setErrorMessage(confirmError.message || 'Setup failed')
        onError(new Error(confirmError.message || 'Setup failed'))
        setIsProcessing(false)
        return
      }

      let attempts = 0
      const maxAttempts = 20
      const pollForSubscription = async () => {
        try {
          const response = await fetch(`/api/v1/checkout/${session.id}/status`)
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
      const err = error instanceof Error ? error : new Error('Setup failed')
      setErrorMessage(err.message)
      onError(err)
    } finally {
      setIsProcessing(false)
    }
  }

  const trialDays = session.trialDays || 0
  const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: session.currency.toUpperCase() }).format(session.totalAmount / 100)
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
        <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isProcessing || !stripe || !elements}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${
          isProcessing
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

function CheckoutFormInner({
  session,
  onSuccess,
  onError,
  onProcessing,
  onHeightChange
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsProcessing(true)
    setErrorMessage(null)
    onProcessing()

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setErrorMessage(submitError.message || 'An error occurred')
        setIsProcessing(false)
        return
      }

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          receipt_email: email,
          return_url: `${window.location.origin}/embed/checkout/success`
        },
        redirect: 'if_required'
      })

      if (confirmError) {
        setErrorMessage(confirmError.message || 'Payment failed')
        onError(new Error(confirmError.message || 'Payment failed'))
        setIsProcessing(false)
        return
      }

      if (paymentIntent?.status === 'succeeded') {
        let attempts = 0
        const maxAttempts = 20
        const pollForSubscription = async () => {
          try {
            const response = await fetch(`/api/v1/checkout/${session.id}/status`)
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
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Payment failed')
      setErrorMessage(err.message)
      onError(err)
    } finally {
      setIsProcessing(false)
    }
  }

  const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: session.currency.toUpperCase() }).format(session.totalAmount / 100)
  const intervalLabels: Record<string, string> = { day: 'day', week: 'wk', month: 'month', year: 'year' }
  const intervalShort = intervalLabels[session.product?.interval || ''] || 'mo'

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-xs font-medium text-gray-600 mb-1">
          Name
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full px-3 py-2 border border-gray-200 dark:border-[#2e2e30] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 disabled:bg-gray-50 disabled:dark:bg-[#1c1c1e] disabled:text-gray-500 disabled:dark:text-gray-500 disabled:cursor-default"
          disabled={isProcessing || namePrefilled}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-xs font-medium text-gray-600 mb-1">
          Email
        </label>
        <input
          type="email"
          id="email"
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
        <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-150 hover:scale-[1.01] hover:shadow-md ${
          isProcessing || !stripe
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
            Processing...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            Pay {formattedTotal}/{intervalShort}
          </span>
        )}
      </button>

      <TrustSignals />
    </form>
  )
}
