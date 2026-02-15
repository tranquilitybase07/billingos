'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'

interface CheckoutSession {
  id: string
  clientSecret: string
  amount: number
  currency: string
  priceId: string
  product: {
    id: string
    name: string
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
  }
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired'
  expiresAt: string
  stripeAccountId?: string
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

  const fetchSession = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch session details from API
      const response = await apiClient.get<CheckoutSession>(
        `/v1/checkout/${sessionId}/status`
      )

      setSession(response)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load checkout session')
      setError(error)
      console.error('[useCheckoutSession] Error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (sessionId) {
      fetchSession()
    }
  }, [sessionId])

  // Check for session expiry
  useEffect(() => {
    if (session?.expiresAt) {
      const expiryTime = new Date(session.expiresAt).getTime()
      const now = Date.now()

      if (now > expiryTime) {
        setSession(prev => prev ? { ...prev, status: 'expired' } : null)
        return
      }

      // Set timer to mark as expired
      const timeUntilExpiry = expiryTime - now
      const timer = setTimeout(() => {
        setSession(prev => prev ? { ...prev, status: 'expired' } : null)
      }, timeUntilExpiry)

      return () => clearTimeout(timer)
    }
  }, [session?.expiresAt])

  return {
    session,
    loading,
    error,
    refreshSession: fetchSession
  }
}