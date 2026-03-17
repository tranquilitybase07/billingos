'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { Migration, OAuthUrlResponse } from '@/lib/api/types'
import { accountKeys } from './account'
import { organizationKeys } from './organization'

export const migrationKeys = {
  all: ['migrations'] as const,
  byOrg: (orgId: string) => [...migrationKeys.all, 'org', orgId] as const,
  detail: (id: string) => [...migrationKeys.all, 'detail', id] as const,
}

// Get OAuth URL for connecting existing Stripe account
export function useStripeOAuthUrl(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: [...migrationKeys.all, 'oauth-url', organizationId],
    queryFn: () =>
      api.get<OAuthUrlResponse>(
        `/migration/oauth/url?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId,
  })
}

// Exchange OAuth code for connected Stripe account
export function useExchangeOAuthCode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { code: string; organization_id: string }) =>
      api.post<Migration>('/migration/oauth/exchange', data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: accountKeys.byOrganization(variables.organization_id),
      })
      queryClient.invalidateQueries({
        queryKey: organizationKeys.paymentStatus(variables.organization_id),
      })
      queryClient.invalidateQueries({
        queryKey: migrationKeys.byOrg(variables.organization_id),
      })
    },
  })
}

// Start import migration
export function useStartMigration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { organization_id: string; include_archived?: boolean }) =>
      api.post<Migration>('/migration/start', data),
    onSuccess: (data) => {
      queryClient.setQueryData(migrationKeys.detail(data.id), data)
      queryClient.invalidateQueries({
        queryKey: migrationKeys.byOrg(data.organization_id),
      })
    },
  })
}

// Get migration status by ID
export function useMigrationStatus(
  migrationId: string | null | undefined,
  refetchInterval?: number,
) {
  return useQuery({
    queryKey: migrationKeys.detail(migrationId || ''),
    queryFn: () => api.get<Migration>(`/migration/${migrationId}/status`),
    enabled: !!migrationId,
    refetchInterval,
  })
}

// Get latest migration for an organization
export function useLatestMigration(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: migrationKeys.byOrg(organizationId || ''),
    queryFn: () =>
      api.get<Migration | null>(
        `/migration/organization/${organizationId}/latest`,
      ),
    enabled: !!organizationId,
  })
}
