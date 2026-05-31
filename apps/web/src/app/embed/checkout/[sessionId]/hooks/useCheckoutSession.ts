'use client'

import { useState, useEffect } from 'react'
import { useEmbedApiUrl } from '../../../EmbedApiProvider'

interface CheckoutSession {
  id: string
  clientSecret: string
  amount: number
  currency: string
  priceId: string
  product: {
    id: string
    name: string
    description?: string
    interval: 'day' | 'week' | 'month' | 'year'
    features: string[]
  }
  customer: {
    id?: string
    email?: string
    name?: string
  }
  couponCode?: string
  discountAmount?: number
  taxAmount?: number
  totalAmount: number
  proration?: {
    credit: number
    charge: number
    netAmount: number
    currency: string
  }
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired'
  expiresAt: string
  stripeAccountId?: string
  publishableKey?: string
  checkoutMode?: 'standard' | 'adaptive' | 'free' | 'trial' | 'upgrade'
  uiMode?: 'hosted' | 'embedded'
  trialDays?: number
}

interface UseCheckoutSessionReturn {
  session: CheckoutSession | null
  loading: boolean
  error: Error | null
  refreshSession: () => Promise<void>
}

export function useCheckoutSession(sessionId: string): UseCheckoutSessionReturn {
  const [session, setSession] = useState<CheckoutSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const apiBaseUrl = useEmbedApiUrl()

  const fetchSession = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`${apiBaseUrl}/v1/checkout/${sessionId}/status`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body?.message ?? `Failed to load checkout session (${res.status})`,
        )
      }
      const response = (await res.json()) as CheckoutSession
      // Defense in depth: the API is the source of truth for clientSecret,
      // amounts, etc. Refuse to render anything that doesn't match the
      // path-bound id (which is itself a UUID checked by the controller).
      if (response.id !== sessionId) {
        throw new Error('Checkout session id mismatch')
      }
      setSession(response)
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to load checkout session')
      setError(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!sessionId) return
    fetchSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Check for session expiry
  useEffect(() => {
    if (session?.expiresAt) {
      const expiryTime = new Date(session.expiresAt).getTime()
      const now = Date.now()

      if (now > expiryTime) {
        setSession((prev) => (prev ? { ...prev, status: 'expired' } : null))
        return
      }

      const timeUntilExpiry = expiryTime - now
      const timer = setTimeout(() => {
        setSession((prev) => (prev ? { ...prev, status: 'expired' } : null))
      }, timeUntilExpiry)

      return () => clearTimeout(timer)
    }
  }, [session?.expiresAt])

  return {
    session,
    loading,
    error,
    refreshSession: fetchSession,
  }
}
