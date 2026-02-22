'use client'

import { createClient } from '@/lib/supabase/client'
import type { AvailablePlansResponse } from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any,
  ) {
    super(message)
    this.name = 'APIError'
  }
}

async function getAuthToken(): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { session },
    error
  } = await supabase.auth.getSession()

  // Debug logging
  if (error) {
    console.error('Error getting Supabase session:', error)
  }
  if (!session) {
    console.warn('No Supabase session found - user may need to log in')
  } else {
    console.log('Session found, token exists:', !!session.access_token)
  }

  return session?.access_token ?? null
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAuthToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = `${API_URL}${endpoint}`

  // Debug logging
  console.log('API Request:', {
    url,
    method: options.method || 'GET',
    hasToken: !!token,
    tokenPreview: token ? `${token.substring(0, 20)}...` : 'none'
  })

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    })

    // Handle no content responses
    if (response.status === 204) {
      return null as T
    }

    const data = await response.json()

    if (!response.ok) {
      console.error('API Error Response:', {
        status: response.status,
        data,
        endpoint
      })
      throw new APIError(
        data.message || 'An error occurred',
        response.status,
        data,
      )
    }

    return data as T
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }

    // Network error or JSON parse error
    throw new APIError(
      error instanceof Error ? error.message : 'Network error',
      0,
    )
  }
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  // Subscription upgrade/downgrade methods
  subscriptions: {
    previewChange: (subscriptionId: string, body: { new_price_id: string; effective_date?: 'immediate' | 'period_end' }) =>
      request(`/subscriptions/${subscriptionId}/preview-change`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    changePlan: (subscriptionId: string, body: { new_price_id: string; confirm_amount?: number; effective_date?: 'immediate' | 'period_end' }) =>
      request(`/subscriptions/${subscriptionId}/change-plan`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getAvailablePlans: (subscriptionId: string): Promise<AvailablePlansResponse> =>
      request<AvailablePlansResponse>(`/subscriptions/${subscriptionId}/available-plans`, {
        method: 'GET',
      }),
  },
}
