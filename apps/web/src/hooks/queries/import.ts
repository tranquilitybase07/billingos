'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'

// ── Types (shape mirrors apps/api ImportService) ───────────────────────────

export interface ImportPreview {
  customers: number
  products: number
  prices: number
  subscriptions: number
  productsList: Array<{
    stripe_product_id: string
    name: string
    active_subscriptions: number
  }>
}

export interface ProductMapping {
  stripe_product_id: string
  bos_product_id: string
}

export type MigrationJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type StuckReason =
  | 'no_email'
  | 'email_collision'
  | 'manual_resolve_requested'

export interface StuckCustomer {
  customer_id: string
  stripe_customer_id: string
  name: string | null
  email: string | null
  reason: StuckReason
  plan_summary: string | null
}

export interface MigrationJob {
  id: string
  organization_id: string
  status: MigrationJobStatus
  totals: Record<string, number>
  progress: Record<string, number>
  error_message: string | null
  pending_binding_count: number
  stuck_customers: StuckCustomer[]
  created_at: string
  updated_at: string
  completed_at: string | null
}

// ── Query keys ─────────────────────────────────────────────────────────────

export const importKeys = {
  all: ['import'] as const,
  preview: (orgId: string) => [...importKeys.all, 'preview', orgId] as const,
  status: (orgId: string, jobId: string) =>
    [...importKeys.all, 'status', orgId, jobId] as const,
  latest: (orgId: string) => [...importKeys.all, 'latest', orgId] as const,
}

// ── Hooks ──────────────────────────────────────────────────────────────────

// Walks the connected Stripe account and returns counts + per-product
// subscription totals. Expensive (one Stripe round-trip per page), so we
// don't refetch on focus.
export function useImportPreview(
  organizationId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: importKeys.preview(organizationId || ''),
    queryFn: () =>
      api.get<ImportPreview>(
        `/import/preview?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId && options.enabled !== false,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  })
}

export function useSaveMappings(organizationId: string) {
  return useMutation({
    mutationFn: (mappings: ProductMapping[]) =>
      api.post<{ saved: number }>(
        `/import/mappings?organization_id=${organizationId}`,
        { mappings },
      ),
  })
}

export function useStartImport(organizationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ job_id: string }>(
        `/import/run?organization_id=${organizationId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: importKeys.latest(organizationId),
      })
    },
  })
}

// Polls every 2s while the job is still active. Stops polling on terminal
// states so we don't hammer the API forever.
export function useImportStatus(
  organizationId: string | null | undefined,
  jobId: string | null | undefined,
) {
  return useQuery({
    queryKey: importKeys.status(organizationId || '', jobId || ''),
    queryFn: () =>
      api.get<MigrationJob>(
        `/import/status/${jobId}?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId && !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as MigrationJob | undefined
      if (!data) return 2000
      if (data.status === 'pending' || data.status === 'running') return 2000
      return false
    },
  })
}

// Latest job for an org — drives the status-aware Import Data page.
export function useLatestImportJob(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: importKeys.latest(organizationId || ''),
    queryFn: () =>
      api.get<MigrationJob | null>(
        `/import/latest?organization_id=${organizationId}`,
      ),
    enabled: !!organizationId,
    refetchInterval: (query) => {
      const data = query.state.data as MigrationJob | null | undefined
      if (data?.status === 'pending' || data?.status === 'running') return 2000
      return false
    },
  })
}

export function useManualBindCustomer(organizationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { customer_id: string; external_id: string }) =>
      api.post(`/import/bind?organization_id=${organizationId}`, input),
    onSuccess: () => {
      // Latest job's stuck_customers may now have fewer entries — but the
      // worker only writes that on completion. The dashboard re-reads from
      // the public unresolved endpoint, so just refresh the latest snapshot.
      queryClient.invalidateQueries({
        queryKey: importKeys.latest(organizationId),
      })
    },
  })
}
