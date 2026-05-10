'use client'

import { useState, useEffect, useMemo } from 'react'
import { api } from '@/lib/api/client'

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

/**
 * Read a session payload that the SDK passed via the URL hash, so the
 * iframe can render without a network round trip. Hash format:
 *   #bootstrap=<base64(JSON.stringify(session))>
 *
 * Falls back gracefully (returns null) for older SDK versions that don't
 * populate the hash, or if the payload is malformed.
 */
function readBootstrap(): CheckoutSession | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  const prefix = '#bootstrap='
  if (!hash.startsWith(prefix)) return null
  try {
    const json = atob(decodeURIComponent(hash.slice(prefix.length)))
    return JSON.parse(json) as CheckoutSession
  } catch {
    return null
  }
}

export function useCheckoutSession(sessionId: string): UseCheckoutSessionReturn {
  const bootstrap = useMemo(readBootstrap, [])
  const [session, setSession] = useState<CheckoutSession | null>(bootstrap)
  const [loading, setLoading] = useState(!bootstrap)
  const [error, setError] = useState<Error | null>(null)

  const fetchSession = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await api.get<CheckoutSession>(
        `/v1/checkout/${sessionId}/status`,
      )
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
    // Skip the network call when the SDK already handed us the session
    // via URL hash. Older SDK versions still trigger the fetch path.
    if (bootstrap) return
    fetchSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, bootstrap])

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
