'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type {
  Account,
  CreateAccountDTO,
  OnboardingLinkResponse,
  DashboardLinkResponse,
} from '@/lib/api/types'
import { organizationKeys } from './organization'

// Query Keys
export const accountKeys = {
  all: ['accounts'] as const,
  details: () => [...accountKeys.all, 'detail'] as const,
  detail: (id: string) => [...accountKeys.details(), id] as const,
}

// Get Account
export function useAccount(id: string | null | undefined) {
  return useQuery({
    queryKey: accountKeys.detail(id || ''),
    queryFn: () => api.get<Account>(`/accounts/${id}`),
    enabled: !!id,
  })
}

// Create Account
export function useCreateAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAccountDTO) =>
      api.post<Account>('/accounts', data),
    onSuccess: (data) => {
      queryClient.setQueryData(accountKeys.detail(data.id), data)
      // Invalidate organization since account_id changed
      queryClient.invalidateQueries({
        queryKey: organizationKeys.detail(data.id),
      })
      queryClient.invalidateQueries({
        queryKey: organizationKeys.paymentStatus(data.id),
      })
    },
  })
}

// Get Onboarding Link
export function useGetOnboardingLink(accountId: string) {
  return useMutation({
    mutationFn: (params?: { return_url?: string; refresh_url?: string }) =>
      api.post<OnboardingLinkResponse>(
        `/accounts/${accountId}/onboarding-link`,
        params || {},
      ),
  })
}

// Get Dashboard Link
export function useGetDashboardLink(accountId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<DashboardLinkResponse>(`/accounts/${accountId}/dashboard-link`),
  })
}

// Sync Account from Stripe
export function useSyncAccount(accountId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post<Account>(`/accounts/${accountId}/sync`),
    onSuccess: (data) => {
      queryClient.setQueryData(accountKeys.detail(accountId), data)
      // Also invalidate organization payment status
      queryClient.invalidateQueries({
        queryKey: organizationKeys.paymentStatus(accountId),
      })
    },
  })
}
