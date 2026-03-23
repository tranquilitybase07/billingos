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
import { Separator } from '@/components/ui/separator'
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
import { Loading03Icon, Delete02Icon } from 'hugeicons-react'
import { useToast } from '@/hooks/use-toast'
import { SettingsTabNav } from './_components/SettingsTabNav'
import { OrgAvatarUpload } from './_components/OrgAvatarUpload'

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
      <SettingsTabNav activeTab="general" />

      {/* Organization Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Profile</CardTitle>
          <CardDescription>
            Your organization's public information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <OrgAvatarUpload />

          <Separator />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                Cannot be changed after creation
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
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateOrganization.isPending}
            >
              {updateOrganization.isPending ? (
                <>
                  <Loading03Icon size={16} className="mr-2 animate-spin" />
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete this organization</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete "{organization.name}" and all its data.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Delete02Icon size={16} className="mr-2" />
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
                        <Loading03Icon size={16} className="mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete Organization'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </DashboardBody>
  )
}
