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
  byOrganization: (orgId: string) => [...accountKeys.all, 'organization', orgId] as const,
}

// Get Account by ID
export function useAccount(id: string | null | undefined) {
  return useQuery({
    queryKey: accountKeys.detail(id || ''),
    queryFn: () => api.get<Account>(`/accounts/${id}`),
    enabled: !!id,
  })
}

// Get Account by Organization ID
export function useAccountByOrganization(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: accountKeys.byOrganization(organizationId || ''),
    queryFn: () => api.get<Account | null>(`/accounts/organization/${organizationId}`),
    enabled: !!organizationId,
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

// Start Stripe Connect OAuth flow. Returns the authorize URL the caller
// should redirect the browser to.
export function useGetOAuthUrl() {
  return useMutation({
    mutationFn: (data: { organization_id: string }) =>
      api.post<{ url: string }>('/accounts/oauth/authorize', data),
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

// Disconnect a Stripe account from its organization. The user lands back in
// State C (no account) and can pick a fresh connection mode.
export function useDisconnectAccount(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (accountId: string) =>
      api.delete<{ success: true }>(`/accounts/${accountId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accountKeys.byOrganization(organizationId),
      })
      queryClient.invalidateQueries({
        queryKey: organizationKeys.paymentStatus(organizationId),
      })
    },
  })
}
