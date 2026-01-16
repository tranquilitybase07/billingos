import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'

export type FeatureType = 'boolean_flag' | 'usage_quota' | 'numeric_limit'

export interface Feature {
  id: string
  organization_id: string
  name: string
  title: string
  description?: string
  type: FeatureType
  properties?: Record<string, any>
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface CreateFeatureDto {
  organization_id: string
  name: string
  title: string
  description?: string
  type: FeatureType
  properties?: Record<string, any>
  metadata?: Record<string, any>
}

/**
 * Fetch all features for an organization
 */
export function useFeatures(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['features', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('Organization ID is required')
      return api.get<Feature[]>(`/features?organization_id=${organizationId}`)
    },
    enabled: !!organizationId,
  })
}

/**
 * Fetch a single feature by ID
 */
export function useFeature(featureId: string | undefined) {
  return useQuery({
    queryKey: ['feature', featureId],
    queryFn: async () => {
      if (!featureId) throw new Error('Feature ID is required')
      return api.get<Feature>(`/features/${featureId}`)
    },
    enabled: !!featureId,
  })
}

/**
 * Create a new feature
 */
export function useCreateFeature() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateFeatureDto) => {
      return api.post<Feature>('/features', data)
    },
    onSuccess: (_, variables) => {
      // Invalidate features list for this organization
      queryClient.invalidateQueries({
        queryKey: ['features', variables.organization_id],
      })
    },
  })
}

/**
 * Update an existing feature
 */
export function useUpdateFeature() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: Partial<CreateFeatureDto>
    }) => {
      return api.patch<Feature>(`/features/${id}`, data)
    },
    onSuccess: (data) => {
      // Invalidate specific feature and features list
      queryClient.invalidateQueries({ queryKey: ['feature', data.id] })
      queryClient.invalidateQueries({
        queryKey: ['features', data.organization_id],
      })
    },
  })
}

/**
 * Delete a feature
 */
export function useDeleteFeature() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (featureId: string) => {
      return api.delete(`/features/${featureId}`)
    },
    onSuccess: (_, featureId) => {
      // Invalidate features list
      queryClient.invalidateQueries({ queryKey: ['features'] })
      queryClient.invalidateQueries({ queryKey: ['feature', featureId] })
    },
  })
}
