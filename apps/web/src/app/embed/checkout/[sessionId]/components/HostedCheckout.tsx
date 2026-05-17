'use client'

import { useEffect, useMemo, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js'
import { useParentMessaging } from '../hooks/useParentMessaging'

interface HostedCheckoutProps {
  clientSecret: string
  stripeAccountId?: string
}

export function HostedCheckout({
  clientSecret,
  stripeAccountId,
}: HostedCheckoutProps) {
  const { sendMessage } = useParentMessaging()
  const hasSentReadyRef = useRef(false)

  // Warm the Stripe.js script load early so the EmbeddedCheckoutProvider
  // doesn't pay the script-fetch cost serially after mount.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (key) void loadStripe(key)
  }, [])

  const stripePromise = useMemo(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    if (stripeAccountId) {
      return loadStripe(publishableKey, { stripeAccount: stripeAccountId })
    }
    return loadStripe(publishableKey)
  }, [stripeAccountId])

  useEffect(() => {
    if (!hasSentReadyRef.current) {
      sendMessage({ type: 'CHECKOUT_READY' })
      hasSentReadyRef.current = true
    }
  }, [sendMessage])

  return (
    <div className="min-h-screen bg-white dark:bg-[#141415]">
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{
          clientSecret,
          onComplete: () => {
            sendMessage({ type: 'CHECKOUT_SUCCESS', payload: {} })
          },
        }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}
