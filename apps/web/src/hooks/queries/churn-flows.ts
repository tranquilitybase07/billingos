import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { ChurnStep } from '@/components/churn/types'

export interface ChurnFlowSettings {
  allowRepeatDiscount?: boolean
}

export interface ChurnFlow {
  id: string
  organization_id: string
  name: string
  enabled: boolean
  steps: ChurnStep[]
  targeting: Record<string, unknown>
  settings: ChurnFlowSettings
  created_at: string | null
  updated_at: string | null
}

export interface ChurnFlowInput {
  name: string
  enabled?: boolean
  steps?: ChurnStep[]
  targeting?: Record<string, unknown>
  settings?: ChurnFlowSettings
}

export const useChurnFlows = (organizationId: string) =>
  useQuery({
    queryKey: ['churn-flows', organizationId],
    queryFn: () =>
      api.get<ChurnFlow[]>(`/churn-flows?organization_id=${organizationId}`),
    enabled: !!organizationId,
  })

export const useCreateChurnFlow = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ChurnFlowInput) =>
      api.post<ChurnFlow>('/churn-flows', {
        ...input,
        organization_id: organizationId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['churn-flows', organizationId] }),
  })
}

export const useUpdateChurnFlow = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ChurnFlowInput> }) =>
      api.patch<ChurnFlow>(`/churn-flows/${id}`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['churn-flows', organizationId] }),
  })
}

export const useDeleteChurnFlow = (organizationId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/churn-flows/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['churn-flows', organizationId] }),
  })
}
