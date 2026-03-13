'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckoutForm } from './CheckoutForm'
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
  const { session, loading, error, refreshSession } = useCheckoutSession(sessionId)
  const { sendMessage } = useParentMessaging()

  useEffect(() => {
    hasSentReadyMessageRef.current = false
  }, [sessionId])

  const handleApplyDiscount = async (code: string) => {
    try {
      const result = await api.post<{ discountAmount: number; totalAmount: number; discountLabel: string }>(
        `/v1/checkout/${sessionId}/apply-discount`,
        { code },
      )
      setDiscountAmount(result.discountAmount)
      setDisplayTotal(result.totalAmount)
      return { success: true, discountLabel: result.discountLabel }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid or expired code'
      return { success: false, error: message }
    }
  }

  const handleRemoveDiscount = async () => {
    try {
      const result = await api.delete<{ totalAmount: number }>(`/v1/checkout/${sessionId}/discount`)
      setDiscountAmount(0)
      setDisplayTotal(null)
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

  return (
    <div className="bg-white h-screen flex flex-col overflow-hidden">
      {/* Header — fixed, never scrolls */}
      <div className="flex items-start justify-between px-6 pt-4 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{session.product?.name}</h1>
            {session.product?.description && (
              <p className="text-gray-400 text-xs mt-0.5">{session.product.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Two-column content — left is static, right scrolls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 flex-1 min-h-0 overflow-hidden">
        {/* Left — no scroll */}
        <div className="overflow-hidden py-1 pb-6 space-y-4">
          <ProductSummary
            product={session.product}
            amount={session.amount}
            currency={session.currency}
            discountAmount={discountAmount > 0 ? discountAmount : session.discountAmount}
            taxAmount={session.taxAmount}
            totalAmount={displayTotal ?? session.totalAmount}
            proration={session.proration}
          />
          <DiscountCode
            onApply={handleApplyDiscount}
            onRemove={handleRemoveDiscount}
          />
        </div>

        {/* Right — scrollable */}
        <div className="overflow-y-auto py-1 pb-6 pr-1">
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
