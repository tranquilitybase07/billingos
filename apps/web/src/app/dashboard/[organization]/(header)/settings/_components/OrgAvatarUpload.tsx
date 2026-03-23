'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useUploadAvatar, useRemoveAvatar } from '@/hooks/queries/avatar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Upload02Icon, Delete02Icon, Loading03Icon } from 'hugeicons-react'
import { useToast } from '@/hooks/use-toast'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']

export function OrgAvatarUpload() {
  const { organization } = useOrganization()
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const uploadAvatar = useUploadAvatar(organization.id)
  const removeAvatar = useRemoveAvatar(organization.id)

  const currentUrl = preview || organization.avatar_url
  const initials = organization.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so same file can be re-selected
    e.target.value = ''

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, GIF, WebP, or SVG image.',
        variant: 'destructive',
      })
      return
    }

    if (file.size > MAX_SIZE) {
      toast({
        title: 'File too large',
        description: 'Image must be under 5MB.',
        variant: 'destructive',
      })
      return
    }

    // Show instant preview
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    try {
      await uploadAvatar.mutateAsync(file)
      router.refresh() // Re-fetch server data so sidebar updates
      toast({ title: 'Logo updated' })
    } catch (error) {
      setPreview(null)
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload logo',
        variant: 'destructive',
      })
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const handleRemove = async () => {
    try {
      await removeAvatar.mutateAsync()
      setPreview(null)
      router.refresh() // Re-fetch server data so sidebar updates
      toast({ title: 'Logo removed' })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove logo',
        variant: 'destructive',
      })
    }
  }

  const isUploading = uploadAvatar.isPending
  const isRemoving = removeAvatar.isPending

  return (
    <div className="flex items-center gap-6">
      <button
        type="button"
        className="group relative cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        <Avatar className="h-24 w-24 text-2xl">
          <AvatarImage src={currentUrl || undefined} alt={organization.name} />
          <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          {isUploading ? (
            <Loading03Icon size={24} className="animate-spin text-white" />
          ) : (
            <Upload02Icon size={24} className="text-white" />
          )}
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="space-y-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">Organization Logo</p>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, GIF, WebP, or SVG. Max 5MB.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loading03Icon size={14} className="mr-1.5 animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload'
            )}
          </Button>
          {currentUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <Loading03Icon size={14} className="animate-spin" />
              ) : (
                <Delete02Icon size={14} className="text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
