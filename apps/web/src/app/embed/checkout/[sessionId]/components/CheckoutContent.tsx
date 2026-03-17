'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  CheckoutProvider,
  CurrencySelectorElement,
} from '@stripe/react-stripe-js/checkout'
import { CheckoutForm, stripeAppearance } from './CheckoutForm'
import { ProductSummary } from './ProductSummary'
import { DiscountCode } from './DiscountCode'
import { useCheckoutSession } from '../hooks/useCheckoutSession'
import { useParentMessaging } from '../hooks/useParentMessaging'
import { api } from '@/lib/api/client'

interface CheckoutContentProps {
  sessionId: string
}

export function CheckoutContent({ sessionId }: CheckoutContentProps) {
  const hasSentReadyMessageRef = useRef(false)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [displayTotal, setDisplayTotal] = useState<number | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<string | undefined>(undefined)
  const [clientSecretOverride, setClientSecretOverride] = useState<string | null>(null)
  const { session, loading, error } = useCheckoutSession(sessionId)
  const { sendMessage } = useParentMessaging()

  useEffect(() => {
    hasSentReadyMessageRef.current = false
  }, [sessionId])

  const handleApplyDiscount = async (code: string) => {
    try {
      const result = await api.post<{ discountAmount: number; totalAmount: number; discountLabel: string; clientSecret?: string }>(
        `/v1/checkout/${sessionId}/apply-discount`,
        { code },
      )
      setDiscountAmount(result.discountAmount)
      setDisplayTotal(result.totalAmount)
      if (result.clientSecret) {
        setClientSecretOverride(result.clientSecret)
      }
      return { success: true, discountLabel: result.discountLabel }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid or expired code'
      return { success: false, error: message }
    }
  }

  const handleRemoveDiscount = async () => {
    try {
      const result = await api.delete<{ totalAmount: number; clientSecret?: string }>(`/v1/checkout/${sessionId}/discount`)
      setDiscountAmount(0)
      setDisplayTotal(null)
      if (result.clientSecret) {
        setClientSecretOverride(result.clientSecret)
      }
    } catch {
      // Swallow — UI already resets
    }
  }

  // Notify parent when ready
  useEffect(() => {
    if (session && !hasSentReadyMessageRef.current) {
      sendMessage({ type: 'CHECKOUT_READY' })
      hasSentReadyMessageRef.current = true
    }
  }, [session, sendMessage])

  // Handle errors
  useEffect(() => {
    if (error) {
      sendMessage({
        type: 'CHECKOUT_ERROR',
        payload: { error: error.message }
      })
    }
  }, [error, sendMessage])

  // Handle session expiry
  useEffect(() => {
    if (session?.status === 'expired') {
      sendMessage({
        type: 'CHECKOUT_ERROR',
        payload: { error: 'Checkout session has expired. Please try again.' }
      })
    }
  }, [session?.status, sendMessage])

  const handleClose = () => {
    sendMessage({ type: 'CHECKOUT_CLOSE' })
  }

  // For adaptive mode: lift CheckoutProvider to wrap both panels so
  // CurrencySelectorElement can live in the left panel
  const isAdaptive = session?.checkoutMode === 'adaptive'
  const stripePromise = useMemo(() => {
    if (!isAdaptive || !session) return null
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    if (session.stripeAccountId) {
      return loadStripe(publishableKey, { stripeAccount: session.stripeAccountId })
    }
    return loadStripe(publishableKey)
  }, [isAdaptive, session?.stripeAccountId])  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">Error Loading Checkout</h3>
        <p className="text-gray-500 mb-4">{error.message}</p>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm font-medium"
        >
          Close
        </button>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const leftPanel = (
    <div
      className="w-[50%] flex-shrink-0 bg-[#f3f4f6] flex flex-col p-8 overflow-y-auto checkout-enter"
      style={{ animationFillMode: 'forwards' }}
    >
      <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase mb-2">
        Order Summary
      </p>
      <h1 className="text-2xl font-bold text-gray-900">{session.product?.name}</h1>
      {session.product?.description && (
        <p className="text-sm text-gray-500 mt-1">{session.product.description}</p>
      )}
      <div className="mt-6">
        <ProductSummary
          product={session.product}
          amount={session.amount}
          currency={session.currency}
          discountAmount={discountAmount > 0 ? discountAmount : session.discountAmount}
          taxAmount={session.taxAmount}
          totalAmount={displayTotal ?? session.totalAmount}
          proration={session.proration}
          displayCurrency={displayCurrency}
          trialDays={session.trialDays}
        />
      </div>
      {isAdaptive && (
        <div className="mt-4">
          <label className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase mb-2 block">
            Currency
          </label>
          <CurrencySelectorElement />
        </div>
      )}
      <div className="mt-4">
        <DiscountCode
          onApply={handleApplyDiscount}
          onRemove={handleRemoveDiscount}
        />
      </div>
    </div>
  )

  const rightPanel = (
    <div
      className="flex-1 bg-white flex flex-col p-8 relative overflow-y-auto checkout-enter-delayed"
      style={{ animationFillMode: 'forwards' }}
    >
      {/* Close button — top right of right panel */}
      <button
        onClick={handleClose}
        className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors p-1"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase mb-1">
        Payment Details
      </p>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Complete your purchase</h2>

      <CheckoutForm
        key={clientSecretOverride ?? session.clientSecret}
        session={clientSecretOverride ? { ...session, clientSecret: clientSecretOverride } : session}
        skipProvider={isAdaptive}
        onSuccess={(subscription) => {
          sendMessage({
            type: 'CHECKOUT_SUCCESS',
            payload: { subscription }
          })
        }}
        onError={(error) => {
          sendMessage({
            type: 'CHECKOUT_ERROR',
            payload: { error: error.message }
          })
        }}
        onProcessing={() => {
          sendMessage({ type: 'PROCESSING' })
        }}
        onHeightChange={(height) => {
          sendMessage({
            type: 'HEIGHT_CHANGED',
            payload: { height }
          })
        }}
        onTotalChange={(total, currency) => {
          setDisplayTotal(total)
          setDisplayCurrency(currency)
        }}
      />
    </div>
  )

  const content = (
    <>
      <style>{`
        @keyframes checkoutSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .checkout-enter {
          animation: checkoutSlideUp 200ms ease-out forwards;
        }
        .checkout-enter-delayed {
          opacity: 0;
          animation: checkoutSlideUp 200ms ease-out 50ms forwards;
        }
      `}</style>
      <div className="bg-white h-screen flex overflow-hidden rounded-2xl">
        {leftPanel}
        {rightPanel}
      </div>
    </>
  )

  if (isAdaptive) {
    return (
      <CheckoutProvider
        stripe={stripePromise}
        options={{
          clientSecret: clientSecretOverride ?? session.clientSecret,
          elementsOptions: { appearance: stripeAppearance },
          adaptivePricing: { allowed: true },
        } as any}
      >
        {content}
      </CheckoutProvider>
    )
  }

  return content
}
