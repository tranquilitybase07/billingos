'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  PaymentElement,
  Elements,
  useStripe,
  useElements
} from '@stripe/react-stripe-js'
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
  customer?: {
    email?: string
    name?: string
  }
  product?: {
    name?: string
    description?: string
    features?: string[]
  }
  subscription?: CheckoutSubscription
}

interface CheckoutFormProps {
  session: CheckoutSessionDetails
  onSuccess: (subscription?: CheckoutSubscription) => void
  onError: (error: Error) => void
  onProcessing: () => void
  onHeightChange: (height: number) => void
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

  // Monitor height changes
  useEffect(() => {
    if (!formRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height
        onHeightChange(height + 100) // Add some padding
      }
    })

    resizeObserver.observe(formRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [onHeightChange])

  const handleActivate = async () => {
    setIsActivating(true)
    setError(null)

    try {
      console.log('[FreeProductCheckout] Confirming free checkout...')

      // Call the confirm endpoint to create the subscription
      const response = await fetch(`/api/v1/checkout/${session.id}/confirm-free`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to activate subscription')
      }

      const subscription = await response.json()
      console.log('[FreeProductCheckout] Subscription created!', subscription)

      // Small delay to show success state
      setTimeout(() => {
        onSuccess(subscription)
      }, 500)
    } catch (err) {
      console.error('[FreeProductCheckout] Error activating subscription:', err)
      setError(err instanceof Error ? err.message : 'Failed to activate subscription')
      setIsActivating(false)
    }
  }

  return (
    <div ref={formRef} className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Start Your Free Subscription
        </h2>

        <p className="text-gray-600 mb-6">
          Click below to activate your free subscription and get started.
        </p>
      </div>

      {/* Product Details */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-4">What You&apos;re Getting</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Product:</span>
            <span className="font-medium text-gray-900">{session.product?.name || 'Free Plan'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Price:</span>
            <span className="font-bold text-green-600 text-lg">FREE</span>
          </div>
          {session.product?.description && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-gray-600 text-sm">{session.product.description}</p>
            </div>
          )}
          {session.product?.features && session.product.features.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-2">Includes:</p>
              <ul className="space-y-1">
                {session.product.features.map((feature: string, index: number) => (
                  <li key={index} className="flex items-center text-sm text-gray-700">
                    <svg className="w-4 h-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Activate Button */}
      <button
        onClick={handleActivate}
        disabled={isActivating}
        className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${isActivating
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
      >
        {isActivating ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Activating...
          </span>
        ) : (
          'Get Started for Free'
        )}
      </button>

      <p className="text-xs text-gray-500 text-center">
        No credit card required • Cancel anytime
      </p>
    </div>
  )
}

export function CheckoutForm({
  session,
  onSuccess,
  onError,
  onProcessing,
  onHeightChange
}: CheckoutFormProps) {
  // Check if this is a free product (no payment required)
  const isFreeProduct = !session.clientSecret || session.amount === 0 || session.totalAmount === 0

  // Initialize Stripe (only used for paid products, but hooks must be unconditional)
  const stripePromise = useMemo(() => {
    if (isFreeProduct) return null

    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!

    // If we have a connected account ID, pass it to Stripe initialization
    // This is required for Direct Charges on connected accounts
    if (session.stripeAccountId) {
      console.log('[CheckoutForm] Initializing Stripe with connected account:', session.stripeAccountId)
      return loadStripe(publishableKey, {
        stripeAccount: session.stripeAccountId
      })
    }

    // Fallback to regular initialization (for platform-level charges)
    console.log('[CheckoutForm] Initializing Stripe without connected account')
    return loadStripe(publishableKey)
  }, [session.stripeAccountId, isFreeProduct])

  // For free products, render a simple success message
  if (isFreeProduct) {
    return (
      <FreeProductCheckout
        session={session}
        onSuccess={onSuccess}
        onHeightChange={onHeightChange}
      />
    )
  }

  // For paid products, render Stripe Elements
  const options: StripeElementsOptions = {
    clientSecret: session.clientSecret,
    appearance: {
      theme: 'flat',
      variables: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSizeBase: '13px',
        fontLineHeight: '1.5',
        borderRadius: '8px',
        colorBackground: '#f9fafb',
        colorText: '#111827',
        colorTextSecondary: '#6b7280',
        colorTextPlaceholder: '#9ca3af',
        colorPrimary: '#3b82f6',
        colorDanger: '#ef4444',
        spacingUnit: '3px',
        spacingGridRow: '12px',
      },
      rules: {
        '.Input': {
          padding: '10px 12px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          boxShadow: 'none',
          fontSize: '13px',
          color: '#111827',
        },
        '.Input:focus': {
          backgroundColor: '#ffffff',
          border: '1px solid #3b82f6',
          boxShadow: '0 0 0 3px rgba(59,130,246,0.12)',
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
          backgroundColor: '#f9fafb',
          boxShadow: 'none',
          border: '1px solid #e5e7eb',
        },
      }
    }
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutFormInner
        session={session}
        onSuccess={onSuccess}
        onError={onError}
        onProcessing={onProcessing}
        onHeightChange={onHeightChange}
      />
    </Elements>
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
  const [email, setEmail] = useState(session.customer?.email || '')
  const formRef = useRef<HTMLFormElement>(null)

  // Update state when session customer data changes
  useEffect(() => {
    if (session?.customer?.email) {
      setEmail(session.customer.email)
    }
  }, [session?.customer])

  // Monitor height changes
  useEffect(() => {
    if (!formRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height
        onHeightChange(height + 100) // Add some padding
      }
    })

    resizeObserver.observe(formRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [onHeightChange])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)
    onProcessing()

    try {
      // Confirm the payment
      const { error: submitError } = await elements.submit()

      if (submitError) {
        setErrorMessage(submitError.message || 'An error occurred')
        setIsProcessing(false)
        return
      }

      // Confirm with Stripe
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
        console.log('[CheckoutForm] Payment SUCCEEDED! Starting subscription polling...')

        // Payment successful - poll for subscription data
        // The webhook creates subscription asynchronously, so we need to poll for it
        let attempts = 0;
        const maxAttempts = 20; // Poll for up to 10 seconds (20 * 500ms)

        const pollForSubscription = async () => {
          try {
            console.log(`[CheckoutForm] Polling attempt ${attempts + 1}/${maxAttempts}`)
            const response = await fetch(`/api/v1/checkout/${session.id}/status`)
            const data = await response.json()

            if (data.subscription) {
              console.log('[CheckoutForm] Subscription found!', data.subscription)
              // Subscription created, notify parent with real data
              onSuccess(data.subscription)
            } else if (attempts < maxAttempts) {
              // Subscription not created yet, keep polling
              attempts++
              console.log('[CheckoutForm] No subscription yet, polling again...')
              setTimeout(pollForSubscription, 500) // Poll every 500ms
            } else {
              console.log('[CheckoutForm] Polling timeout, sending success without subscription')
              // Timeout - send success without subscription data
              // The parent can still show success and refetch products
              onSuccess(undefined)
            }
          } catch (error) {
            console.error('[CheckoutForm] Error polling for subscription:', error)
            // On error, still notify success so payment isn't lost
            onSuccess(undefined)
          }
        }

        // Start polling immediately
        pollForSubscription()
      } else {
        console.log('[CheckoutForm] Payment intent status:', paymentIntent?.status)
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Payment failed')
      setErrorMessage(err.message)
      onError(err)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      {/* Email */}
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
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 placeholder-gray-400"
          required
          disabled={isProcessing}
        />
      </div>

      {/* Payment Element */}
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

      {/* Error Message */}
      {errorMessage && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">{errorMessage}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-colors ${isProcessing || !stripe
          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        ) : (
          `Continue with ${session.product?.name || 'Plan'}`
        )}
      </button>

      {/* Footer */}
      <p className="text-xs text-gray-400 text-center">
        <span className="inline-flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Powered by BillingOS
        </span>
      </p>
    </form>
  )
}

function formatAmount(amount: number | undefined, currency: string): string {
  // Handle undefined or invalid amounts
  if (amount === undefined || amount === null || isNaN(amount)) {
    return 'Loading...'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format(amount / 100)
}
