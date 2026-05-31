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
  publishableKey?: string
}

export function HostedCheckout({
  clientSecret,
  stripeAccountId,
  publishableKey,
}: HostedCheckoutProps) {
  const { sendMessage } = useParentMessaging()
  const hasSentReadyRef = useRef(false)
  const pk = publishableKey ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

  // Warm the Stripe.js script load early so the EmbeddedCheckoutProvider
  // doesn't pay the script-fetch cost serially after mount.
  useEffect(() => {
    if (pk) void loadStripe(pk)
  }, [pk])

  const stripePromise = useMemo(() => {
    const key = pk!
    if (stripeAccountId) {
      return loadStripe(key, { stripeAccount: stripeAccountId })
    }
    return loadStripe(key)
  }, [stripeAccountId, pk])

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
