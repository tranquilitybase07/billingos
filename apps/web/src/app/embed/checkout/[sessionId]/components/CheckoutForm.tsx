'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  PaymentElement,
  Elements,
  useStripe,
  useElements
} from '@stripe/react-stripe-js'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'

interface CheckoutFormProps {
  session: any // CheckoutSessionDetails
  onSuccess: (subscription: any) => void
  onError: (error: Error) => void
  onProcessing: () => void
  onHeightChange: (height: number) => void
}

export function CheckoutForm({
  session,
  onSuccess,
  onError,
  onProcessing,
  onHeightChange
}: CheckoutFormProps) {
  // Initialize Stripe with connected account context if available
  const stripePromise = useMemo(() => {
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
  }, [session.stripeAccountId])

  const options: StripeElementsOptions = {
    clientSecret: session.clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#3b82f6',
        colorBackground: '#ffffff',
        colorText: '#1f2937',
        colorDanger: '#ef4444',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        borderRadius: '8px'
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
  const [name, setName] = useState(session.customer?.name || '')
  const formRef = useRef<HTMLFormElement>(null)

  // Update state when session customer data changes
  useEffect(() => {
    if (session?.customer?.email) {
      console.log('[CheckoutForm] Setting email from session:', session.customer.email)
      setEmail(session.customer.email)
    }
    if (session?.customer?.name) {
      console.log('[CheckoutForm] Setting name from session:', session.customer.name)
      setName(session.customer.name)
    }
  }, [session?.customer])

  // Debug logging
  useEffect(() => {
    console.log('[CheckoutForm] Session data received:', {
      sessionId: session?.id,
      customer: session?.customer,
      customerEmail: session?.customer?.email,
      customerName: session?.customer?.name,
      initialEmail: email,
      initialName: name,
    })
  }, [session, email, name])

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
        // Payment successful - notify parent
        // In a real implementation, you'd fetch the subscription from your backend
        onSuccess({
          id: 'sub_' + Math.random().toString(36).substr(2, 9),
          customerId: session.customer.id,
          productId: session.product.id,
          priceId: session.priceId,
          status: 'active',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          cancelAtPeriodEnd: false
        })
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
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-4">Payment Information</h2>
      </div>

      {/* Customer Information */}
      <div className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={isProcessing}
          />
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Name on Card
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={isProcessing}
          />
        </div>
      </div>

      {/* Payment Element */}
      <div className="mt-4">
        <PaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'apple_pay', 'google_pay']
          }}
        />
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{errorMessage}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
          isProcessing || !stripe
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        ) : (
          `Pay ${formatAmount(session.totalAmount || session.amount, session.currency || 'usd')}`
        )}
      </button>

      {/* Security Note */}
      <p className="text-xs text-gray-500 text-center mt-4">
        <span className="inline-flex items-center">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Secured by Stripe
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