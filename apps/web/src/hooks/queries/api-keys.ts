'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { ApiKey, ApiKeyPairCreated, CreateApiKeyDTO } from '@/lib/api/types'

// Query Keys
export const apiKeyKeys = {
  all: ['api-keys'] as const,
  lists: () => [...apiKeyKeys.all, 'list'] as const,
  list: (organizationId: string) => [...apiKeyKeys.lists(), organizationId] as const,
  details: () => [...apiKeyKeys.all, 'detail'] as const,
  detail: (organizationId: string, keyId: string) => [
    ...apiKeyKeys.details(),
    organizationId,
    keyId,
  ] as const,
}

// List API Keys for an organization
export function useListApiKeys(organizationId: string) {
  return useQuery({
    queryKey: apiKeyKeys.list(organizationId),
    queryFn: async () => {
      const keys = await api.get<ApiKey[]>(`/organizations/${organizationId}/api-keys`)
      // Transform date strings to Date objects
      return keys.map(key => ({
        ...key,
        createdAt: new Date(key.createdAt),
        lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : undefined,
        revokedAt: key.revokedAt ? new Date(key.revokedAt) : undefined,
      }))
    },
    enabled: !!organizationId,
  })
}

// Get Single API Key
export function useApiKey(organizationId: string, keyId: string) {
  return useQuery({
    queryKey: apiKeyKeys.detail(organizationId, keyId),
    queryFn: async () => {
      const key = await api.get<ApiKey>(`/organizations/${organizationId}/api-keys/${keyId}`)
      // Transform date strings to Date objects
      return {
        ...key,
        createdAt: new Date(key.createdAt),
        lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : undefined,
        revokedAt: key.revokedAt ? new Date(key.revokedAt) : undefined,
      }
    },
    enabled: !!organizationId && !!keyId,
  })
}

// Create API Key Pair (creates both secret and publishable keys)
export function useCreateApiKey(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateApiKeyDTO) => {
      const result = await api.post<ApiKeyPairCreated>(`/organizations/${organizationId}/api-keys`, data)
      // Transform date strings to Date objects
      return {
        ...result,
        createdAt: new Date(result.createdAt),
      }
    },
    onSuccess: () => {
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list(organizationId) })

      // Force refetch immediately
      queryClient.refetchQueries({
        queryKey: apiKeyKeys.list(organizationId),
        type: 'active',
      })
    },
  })
}

// Revoke API Key
export function useRevokeApiKey(organizationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) =>
      api.delete<ApiKey>(`/organizations/${organizationId}/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list(organizationId) })
      queryClient.refetchQueries({
        queryKey: apiKeyKeys.list(organizationId),
        type: 'active',
      })
    },
  })
}
