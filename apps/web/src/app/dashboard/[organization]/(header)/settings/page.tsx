'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useUpdateOrganization, useDeleteOrganization } from '@/hooks/queries/organization'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Loader2, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function SettingsPage() {
  const { organization } = useOrganization()
  const router = useRouter()
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    name: organization.name,
    email: organization.email || '',
    website: organization.website || '',
  })

  const updateOrganization = useUpdateOrganization(organization.id)
  const deleteOrganization = useDeleteOrganization(organization.id)

  const hasChanges =
    formData.name !== organization.name ||
    formData.email !== (organization.email || '') ||
    formData.website !== (organization.website || '')

  const handleSave = async () => {
    try {
      await updateOrganization.mutateAsync(formData)
      toast({
        title: 'Success',
        description: 'Organization settings updated successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update organization',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteOrganization.mutateAsync()
      toast({
        title: 'Organization deleted',
        description: 'Your organization has been permanently deleted',
      })
      router.push('/dashboard')
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete organization',
        variant: 'destructive',
      })
    }
  }

  return (
    <DashboardBody className="gap-6">
      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>
            Update your organization's basic information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" value={organization.slug} disabled />
            <p className="text-xs text-muted-foreground">
              The slug cannot be changed after creation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="organization@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://example.com"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateOrganization.isPending}
            >
              {updateOrganization.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Organization
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  organization "{organization.name}" and remove all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteOrganization.isPending}
                >
                  {deleteOrganization.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Organization'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </DashboardBody>
  )
}
