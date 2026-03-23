'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, uploadToSignedUrl } from '@/lib/api/client'
import { organizationKeys } from './organization'

interface UploadUrlResponse {
  signedUrl: string
  publicUrl: string
  path: string
}

/**
 * Upload an avatar for an organization.
 * 3-step: get signed URL → upload file → PATCH org with public URL.
 */
export function useUploadAvatar(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      // 1. Get signed upload URL
      const { signedUrl, publicUrl } = await api.post<UploadUrlResponse>(
        `/organizations/${orgId}/avatar/upload-url`,
        { fileName: file.name, contentType: file.type },
      )

      // 2. Upload file directly to storage
      await uploadToSignedUrl(signedUrl, file)

      // 3. Update org with the public URL
      await api.patch(`/organizations/${orgId}`, { avatar_url: publicUrl })

      return publicUrl
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all })
    },
  })
}

/**
 * Remove the avatar for an organization.
 */
export function useRemoveAvatar(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.delete(`/organizations/${orgId}/avatar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all })
    },
  })
}
