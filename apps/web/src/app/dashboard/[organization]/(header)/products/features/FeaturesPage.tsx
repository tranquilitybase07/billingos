'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { useModal } from '@/components/Modal/useModal'
import { CreateFeatureDialog } from '@/components/Features/CreateFeatureDialog'
import { EditFeatureDialog } from '@/components/Features/EditFeatureDialog'
import { DeleteFeatureConfirmation } from '@/components/Features/DeleteFeatureConfirmation'
import { FeatureTypeTag } from '@/components/Features/FeatureTypeTag'
import { DataTable, DataTableColumnDef, DataTableColumnHeader } from '@/components/atoms/datatable'
import {
  Layers01Icon,
  PlusSignIcon,
  Edit01Icon,
  Delete01Icon,
  AlertCircleIcon,
} from 'hugeicons-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useFeatures, useDeleteFeature, type Feature, type ProductFeature } from '@/hooks/queries/features'
import type { SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface FeaturesPageProps {
  organizationId: string
  organizationSlug: string
}

export default function FeaturesPage({
  organizationId,
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
  const [sorting, setSorting] = useState<SortingState>([])

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

  const sortedFeatures = useMemo(() => {
    const list = [...(features ?? [])]

    if (sorting.length === 0) return list

    const { id, desc } = sorting[0]
    list.sort((a, b) => {
      let valueA: string | number = ''
      let valueB: string | number = ''

      switch (id) {
        case 'title':
          valueA = a.title || ''
          valueB = b.title || ''
          break
        case 'type':
          valueA = a.type || ''
          valueB = b.type || ''
          break
        case 'description':
          valueA = a.description || ''
          valueB = b.description || ''
          break
        case 'products_using':
          valueA = a.product_features?.length || 0
          valueB = b.product_features?.length || 0
          break
        case 'created_at':
          valueA = new Date(a.created_at).getTime()
          valueB = new Date(b.created_at).getTime()
          break
        default:
          break
      }

      if (valueA < valueB) return desc ? 1 : -1
      if (valueA > valueB) return desc ? -1 : 1
      return 0
    })

    return list
  }, [features, sorting])

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
            <AlertCircleIcon size={48} className="text-destructive" />
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
            <Layers01Icon size={48} className="text-muted-foreground/30" />
            <div className="flex flex-col items-center justify-center gap-y-2">
              <h3 className="text-xl">No Features</h3>
              <p className="text-muted-foreground">
                Create your first feature to get started
              </p>
            </div>
            <Button onClick={showCreateModal}>
              <PlusSignIcon size={16} className="mr-2" />
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

  const columns: DataTableColumnDef<Feature>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row: { original: feature } }) => (
        <div className="flex flex-col">
          <span className="font-medium">{feature.title}</span>
          <span className="text-xs text-muted-foreground">
            {feature.name}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row: { original: feature } }) => (
        <FeatureTypeTag type={feature.type} />
      ),
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row: { original: feature } }) => {
        const description = feature.description || 'No description'
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-[340px] truncate">
                {description}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md break-words">
              {description}
            </TooltipContent>
          </Tooltip>
        )
      },
    },
    {
      id: 'products_using',
      accessorFn: (feature) => feature.product_features?.length || 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Products Using" />
      ),
      cell: ({ row: { original: feature } }) => (
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
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row: { original: feature } }) => (
        <span className="text-sm text-muted-foreground">
          {format(new Date(feature.created_at), 'MMM d, yyyy')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row: { original: feature } }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditFeature(feature)}
          >
            <Edit01Icon size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteFeature(feature)}
            disabled={(feature.product_features?.length ?? 0) > 0}
          >
            <Delete01Icon size={16} />
          </Button>
        </div>
      ),
    },
  ]

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
              <PlusSignIcon size={16} className="mr-2" />
              Create Feature
            </Button>
          </div>

          <TooltipProvider>
            <DataTable
              data={sortedFeatures}
              columns={columns}
              isLoading={isLoading}
              sorting={sorting}
              onSortingChange={setSorting}
            />
          </TooltipProvider>
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
