'use client'

import { useState, useMemo, useCallback } from 'react'
import { Plus, X, GripVertical, Check, Sparkles } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { CreateFeatureDialog } from '@/components/Features/CreateFeatureDialog'
import { FeatureTypeIcon } from '@/components/Features/FeatureTypeIcon'
import type { Feature as FeatureFromAPI } from '@/hooks/queries/features'

export type FeatureType = 'boolean_flag' | 'usage_quota' | 'numeric_limit'

export interface Feature {
  id: string
  name: string
  title: string
  description?: string
  type: FeatureType
}

export interface SelectedFeature {
  feature_id: string
  display_order: number
  config: {
    limit?: number
  }
  // Denormalized for UI
  featureName?: string
  featureTitle?: string
  featureType?: FeatureType
}

interface FeatureSelectorProps {
  availableFeatures: Feature[]
  selectedFeatures: SelectedFeature[]
  onFeaturesChange: (features: SelectedFeature[]) => void
  isLoading?: boolean
  organizationId: string
}

// Sortable Feature Item Component
function SortableFeatureItem({
  feature,
  selectedFeature,
  onRemove,
  onLimitChange,
}: {
  feature: Feature
  selectedFeature: SelectedFeature
  onRemove: () => void
  onLimitChange: (limit: number | undefined) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: selectedFeature.feature_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isLimited =
    feature.type === 'usage_quota' || feature.type === 'numeric_limit'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Feature Info */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <div className="font-medium">{feature.title}</div>
          <div className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {feature.type.replace('_', ' ')}
          </div>
        </div>

        {/* Limit Input */}
        {isLimited && (
          <div className="flex items-center gap-2">
            <Label htmlFor={`limit-${feature.id}`} className="text-xs">
              Limit:
            </Label>
            <Input
              id={`limit-${feature.id}`}
              type="number"
              min="0"
              placeholder="Unlimited"
              value={selectedFeature.config.limit ?? ''}
              onChange={(e) => {
                const value = e.target.value
                onLimitChange(value === '' ? undefined : parseInt(value, 10))
              }}
              className="h-7 w-32 text-xs"
            />
            <span className="text-xs text-muted-foreground">
              {feature.type === 'usage_quota' ? 'per period' : 'total'}
            </span>
          </div>
        )}

        {feature.type === 'boolean_flag' && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3 w-3" />
            Included
          </div>
        )}
      </div>

      {/* Remove Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function FeatureSelector({
  availableFeatures,
  selectedFeatures,
  onFeaturesChange,
  isLoading = false,
  organizationId,
}: FeatureSelectorProps) {
  const [open, setOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleAddFeature = useCallback((feature: Feature) => {
    const newFeature: SelectedFeature = {
      feature_id: feature.id,
      display_order: selectedFeatures.length + 1,
      config: feature.type !== 'boolean_flag' ? { limit: undefined } : {},
      // Denormalized
      featureName: feature.name,
      featureTitle: feature.title,
      featureType: feature.type,
    }
    onFeaturesChange([...selectedFeatures, newFeature])
    setOpen(false)
  }, [selectedFeatures, onFeaturesChange])

  const handleFeatureCreated = useCallback((newFeature: FeatureFromAPI) => {
    // Auto-add the newly created feature to the selection
    handleAddFeature({
      id: newFeature.id,
      name: newFeature.name,
      title: newFeature.title,
      description: newFeature.description,
      type: newFeature.type,
    })
    setCreateDialogOpen(false)
  }, [handleAddFeature])

  const handleRemoveFeature = useCallback((featureId: string) => {
    const filtered = selectedFeatures.filter((f) => f.feature_id !== featureId)
    // Re-order
    const reordered = filtered.map((f, idx) => ({
      ...f,
      display_order: idx + 1,
    }))
    onFeaturesChange(reordered)
  }, [selectedFeatures, onFeaturesChange])

  const handleLimitChange = useCallback((featureId: string, limit: number | undefined) => {
    const updated = selectedFeatures.map((f) =>
      f.feature_id === featureId
        ? { ...f, config: { ...f.config, limit } }
        : f
    )
    onFeaturesChange(updated)
  }, [selectedFeatures, onFeaturesChange])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = selectedFeatures.findIndex(
        (f) => f.feature_id === active.id
      )
      const newIndex = selectedFeatures.findIndex(
        (f) => f.feature_id === over.id
      )

      const reordered = arrayMove(selectedFeatures, oldIndex, newIndex)
      // Update display_order
      const withNewOrder = reordered.map((f, idx) => ({
        ...f,
        display_order: idx + 1,
      }))
      onFeaturesChange(withNewOrder)
    }
  }

  const alreadySelectedIds = useMemo(
    () => new Set(selectedFeatures.map((f) => f.feature_id)),
    [selectedFeatures]
  )
  const availableToAdd = useMemo(
    () => availableFeatures.filter((f) => !alreadySelectedIds.has(f.id)),
    [availableFeatures, alreadySelectedIds]
  )

  return (
    <div className="space-y-4">
      {/* Add Feature Button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start" disabled={isLoading}>
            <Plus className="mr-2 h-4 w-4" />
            Add Feature
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search features..." />
            <CommandList>
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-6">
                  <p className="text-sm text-muted-foreground">No features found.</p>
                  <button
                    onClick={() => {
                      setOpen(false)
                      setCreateDialogOpen(true)
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Create a new feature
                  </button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {/* Create New Feature Button */}
                <CommandItem
                  onSelect={() => {
                    setOpen(false)
                    setCreateDialogOpen(true)
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex w-full items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="font-medium">Create New Feature</div>
                      <div className="text-xs text-muted-foreground">
                        Build a custom feature with templates
                      </div>
                    </div>
                  </div>
                </CommandItem>

                {availableToAdd.length > 0 && <CommandSeparator />}

                {/* Existing Features */}
                {availableToAdd.map((feature) => (
                  <CommandItem
                    key={feature.id}
                    value={feature.title}
                    onSelect={() => handleAddFeature(feature)}
                    className="cursor-pointer"
                  >
                    <div className="flex w-full items-center gap-2">
                      <FeatureTypeIcon type={feature.type} className="h-8 w-8" />
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">{feature.title}</div>
                        {feature.description && (
                          <div className="text-xs text-muted-foreground">
                            {feature.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Features List with Drag and Drop */}
      {selectedFeatures.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={selectedFeatures.map((f) => f.feature_id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {selectedFeatures.map((selectedFeature) => {
                // Try to find feature in availableFeatures
                let feature = availableFeatures.find(
                  (f) => f.id === selectedFeature.feature_id
                )

                // If not found (e.g., in edit mode), use denormalized data
                if (!feature && selectedFeature.featureName) {
                  feature = {
                    id: selectedFeature.feature_id,
                    name: selectedFeature.featureName,
                    title: selectedFeature.featureTitle || selectedFeature.featureName,
                    type: selectedFeature.featureType || 'boolean_flag',
                  }
                }

                // If still no feature data, skip rendering
                if (!feature) return null

                return (
                  <SortableFeatureItem
                    key={selectedFeature.feature_id}
                    feature={feature}
                    selectedFeature={selectedFeature}
                    onRemove={() => handleRemoveFeature(selectedFeature.feature_id)}
                    onLimitChange={(limit) => handleLimitChange(selectedFeature.feature_id, limit)}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {selectedFeatures.length === 0 && (
        <div className="flex h-32 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed">
          <Sparkles className="h-8 w-8 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-sm font-medium">No features added yet</p>
            <p className="text-xs text-muted-foreground">
              Click "Add Feature" to get started
            </p>
          </div>
        </div>
      )}

      {/* Create Feature Dialog */}
      <CreateFeatureDialog
        organizationId={organizationId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onFeatureCreated={handleFeatureCreated}
      />
    </div>
  )
}
