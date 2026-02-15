'use client'

import { useEffect, useState } from 'react'
import { CheckoutForm } from './CheckoutForm'
import { ProductSummary } from './ProductSummary'
import { useCheckoutSession } from '../hooks/useCheckoutSession'
import { useParentMessaging } from '../hooks/useParentMessaging'

interface CheckoutContentProps {
  sessionId: string
}

export function CheckoutContent({ sessionId }: CheckoutContentProps) {
  const [isInitialized, setIsInitialized] = useState(false)
  const { session, loading, error, refreshSession } = useCheckoutSession(sessionId)
  const { sendMessage } = useParentMessaging()

  // Notify parent when ready
  useEffect(() => {
    if (session && !isInitialized) {
      sendMessage({ type: 'CHECKOUT_READY' })
      setIsInitialized(true)
    }
  }, [session, isInitialized, sendMessage])

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-600 mb-4">
          <svg
            className="w-12 h-12 mx-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">Error Loading Checkout</h3>
        <p className="text-gray-600 mb-4">{error.message}</p>
        <button
          onClick={() => window.parent.postMessage({ type: 'CHECKOUT_CLOSE' }, '*')}
          className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left side - Product Summary */}
        <div className="order-2 md:order-1">
          <ProductSummary
            product={session.product}
            amount={session.amount}
            currency={session.currency}
            discountAmount={session.discountAmount}
            taxAmount={session.taxAmount}
            totalAmount={session.totalAmount}
            proration={session.proration}
          />
        </div>

        {/* Right side - Payment Form */}
        <div className="order-1 md:order-2">
          <CheckoutForm
            session={session}
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
          />
        </div>
      </div>
    </div>
  )
}