'use client'

import { useState, useEffect } from 'react'

export interface PortalSubscription {
  id: string
  status: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt?: string
  trialEnd?: string
  product: {
    id: string
    name: string
    description?: string
  }
  price: {
    id: string
    amount: number
    currency: string
    interval: string
    intervalCount: number
  }
  features: Array<{
    id: string
    name: string
    description?: string
    limit?: number
    used?: number
  }>
}

export interface PortalInvoice {
  id: string
  number?: string
  status: string
  amount: number
  currency: string
  dueDate?: string
  paidAt?: string
  invoiceUrl?: string
  invoicePdf?: string
  createdAt: string
}

export interface PortalPaymentMethod {
  id: string
  type: string
  last4: string
  brand?: string
  expiryMonth?: number
  expiryYear?: number
  isDefault: boolean
}

export interface PortalCustomer {
  id: string
  email?: string
  name?: string
  billingAddress?: {
    street?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
}

export interface UsageMetric {
  featureId: string
  featureName: string
  used: number
  limit: number | null
  percentage: number
  unit: string
}

export interface PortalData {
  sessionId: string
  customer: PortalCustomer
  subscriptions: PortalSubscription[]
  invoices: PortalInvoice[]
  paymentMethods: PortalPaymentMethod[]
  usageMetrics: UsageMetric[]
  organizationName?: string
}

interface UsePortalDataReturn {
  data: PortalData | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

export function usePortalData(sessionId: string): UsePortalDataReturn {
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/v1/portal/${sessionId}/data`)

      if (!response.ok) {
        throw new Error(`Failed to fetch portal data: ${response.statusText}`)
      }

      const portalData = await response.json()
      setData(portalData)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      console.error('[usePortalData] Error fetching portal data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (sessionId) {
      fetchData()
    }
  }, [sessionId])

  const refresh = async () => {
    await fetchData()
  }

  return {
    data,
    loading,
    error,
    refresh,
  }
}
