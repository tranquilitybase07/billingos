'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { CreateFeatureDialog } from '@/components/Features/CreateFeatureDialog'
import { EditFeatureDialog } from '@/components/Features/EditFeatureDialog'
import { DeleteFeatureConfirmation } from '@/components/Features/DeleteFeatureConfirmation'
import { FeatureTypeTag } from '@/components/Features/FeatureTypeTag'
import {
  Layers as LayersIcon,
  Add,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useFeatures, useDeleteFeature, type Feature, type ProductFeature } from '@/hooks/queries/features'
import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface FeaturesPageProps {
  organizationId: string
  organizationSlug: string
}

export default function FeaturesPage({
  organizationId,
  organizationSlug,
}: FeaturesPageProps) {
  // Modal states
  const {
    isShown: isCreateModalShown,
    show: showCreateModal,
    hide: hideCreateModal,
  } = useModal()

  const {
    isShown: isEditModalShown,
    show: showEditModal,
    hide: hideEditModal,
  } = useModal()

  const {
    isShown: isDeleteModalShown,
    show: showDeleteModal,
    hide: hideDeleteModal,
  } = useModal()

  // State for selected feature (for edit/delete)
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null)

  // Fetch features
  const { data: features, isLoading, error, refetch } = useFeatures(organizationId)

  // Delete mutation
  const deleteFeatureMutation = useDeleteFeature()

  const handleEditFeature = (feature: Feature) => {
    setSelectedFeature(feature)
    showEditModal()
  }

  const handleDeleteFeature = (feature: Feature) => {
    setSelectedFeature(feature)
    showDeleteModal()
  }

  const confirmDelete = async () => {
    if (!selectedFeature) return

    try {
      await deleteFeatureMutation.mutateAsync(selectedFeature.id)
      toast.success('Feature deleted successfully')
      hideDeleteModal()
      refetch()
    } catch (error) {
      toast.error('Failed to delete feature')
      console.error('Delete error:', error)
    }
  }

  const handleFeatureCreated = () => {
    hideCreateModal()
    refetch()
    toast.success('Feature created successfully')
  }

  const handleFeatureUpdated = () => {
    hideEditModal()
    refetch()
    toast.success('Feature updated successfully')
  }

  // Sync status icon
  const getSyncStatusIcon = (status: string | null | undefined) => {
    switch (status) {
      case 'synced':
        return (
          <Tooltip>
            <TooltipTrigger>
              <CheckCircleIcon className="h-4 w-4 text-green-500" />
            </TooltipTrigger>
            <TooltipContent>Synced with Stripe</TooltipContent>
          </Tooltip>
        )
      case 'pending':
        return (
          <Tooltip>
            <TooltipTrigger>
              <WarningIcon className="h-4 w-4 text-yellow-500" />
            </TooltipTrigger>
            <TooltipContent>Sync pending</TooltipContent>
          </Tooltip>
        )
      case 'failed':
        return (
          <Tooltip>
            <TooltipTrigger>
              <ErrorIcon className="h-4 w-4 text-red-500" />
            </TooltipTrigger>
            <TooltipContent>Sync failed</TooltipContent>
          </Tooltip>
        )
      default:
        return (
          <Tooltip>
            <TooltipTrigger>
              <WarningIcon className="h-4 w-4 text-gray-400" />
            </TooltipTrigger>
            <TooltipContent>Not synced</TooltipContent>
          </Tooltip>
        )
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <DashboardBody>
        <div className="flex flex-col gap-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold">Features</h1>
              <p className="text-muted-foreground">Manage product features and entitlements</p>
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="rounded-lg border bg-card">
            <div className="p-6">
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardBody>
    )
  }

  // Error state
  if (error) {
    return (
      <DashboardBody>
        <div className="flex h-full flex-col items-center justify-center pt-32">
          <div className="flex flex-col items-center justify-center gap-y-8">
            <ErrorIcon className="text-5xl text-destructive" />
            <div className="flex flex-col items-center justify-center gap-y-2">
              <h3 className="text-xl">Failed to load features</h3>
              <p className="text-muted-foreground">
                {error.message || 'Something went wrong'}
              </p>
            </div>
            <Button onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        </div>
      </DashboardBody>
    )
  }

  // Empty state
  if (!features || features.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center pt-32">
          <div className="flex flex-col items-center justify-center gap-y-8">
            <LayersIcon className="text-5xl text-muted-foreground/30" />
            <div className="flex flex-col items-center justify-center gap-y-2">
              <h3 className="text-xl">No Features</h3>
              <p className="text-muted-foreground">
                Create your first feature to get started
              </p>
            </div>
            <Button onClick={showCreateModal}>
              <Add className="mr-2 h-4 w-4" />
              Create Feature
            </Button>
          </div>
        </div>

        <CreateFeatureDialog
          isOpen={isCreateModalShown}
          onClose={hideCreateModal}
          organizationId={organizationId}
          onFeatureCreated={handleFeatureCreated}
        />
      </>
    )
  }

  // Features list
  return (
    <>
      <DashboardBody>
        <div className="flex flex-col gap-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold">Features</h1>
              <p className="text-muted-foreground">Manage product features and entitlements</p>
            </div>
            <Button onClick={showCreateModal}>
              <Add className="mr-2 h-4 w-4" />
              Create Feature
            </Button>
          </div>

          <div className="rounded-lg border bg-card">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Products Using</TableHead>
                    <TableHead>Stripe Sync</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {features.map((feature: Feature) => (
                    <TableRow key={feature.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{feature.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {feature.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <FeatureTypeTag type={feature.type} />
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <span className="truncate">
                          {feature.description || 'No description'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary">
                              {feature.product_features?.length || 0} products
                            </Badge>
                          </TooltipTrigger>
                          {(feature.product_features?.length ?? 0) > 0 && (
                            <TooltipContent>
                              <div className="space-y-1">
                                {feature.product_features?.map((pf: ProductFeature) => (
                                  <div key={pf.product_id} className="text-xs">
                                    {pf.products?.name || 'Unknown product'}
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {getSyncStatusIcon(feature.stripe_sync_status)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(feature.created_at), 'MMM d, yyyy')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditFeature(feature)}
                          >
                            <EditIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteFeature(feature)}
                            disabled={(feature.product_features?.length ?? 0) > 0}
                          >
                            <DeleteIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </div>
      </DashboardBody>

      <CreateFeatureDialog
        isOpen={isCreateModalShown}
        onClose={hideCreateModal}
        organizationId={organizationId}
        onFeatureCreated={handleFeatureCreated}
      />

      {selectedFeature && (
        <>
          <EditFeatureDialog
            isOpen={isEditModalShown}
            onClose={hideEditModal}
            feature={selectedFeature}
            onFeatureUpdated={handleFeatureUpdated}
          />

          <DeleteFeatureConfirmation
            isOpen={isDeleteModalShown}
            onClose={hideDeleteModal}
            feature={selectedFeature}
            onConfirm={confirmDelete}
            isDeleting={deleteFeatureMutation.isPending}
            hasProducts={(selectedFeature.product_features?.length || 0) > 0}
          />
        </>
      )}
    </>
  )
}