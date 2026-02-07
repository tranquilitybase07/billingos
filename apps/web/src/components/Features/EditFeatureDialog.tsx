'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useToast } from '@/hooks/use-toast'
import { useUpdateFeature, type Feature } from '@/hooks/queries/features'
import {
  updateFeatureSchema,
  parseJsonSafely,
  type UpdateFeatureFormData,
  type FeatureType,
} from '@/lib/validations/feature'
import { FEATURE_TYPE_INFO } from '@/lib/constants/feature-templates'
import { cn } from '@/lib/utils'

interface EditFeatureDialogProps {
  feature: Feature
  isOpen: boolean
  onClose: () => void
  onFeatureUpdated?: (feature: Feature) => void
}

/**
 * Feature editing dialog with form validation
 */
export function EditFeatureDialog({
  feature,
  isOpen,
  onClose,
  onFeatureUpdated,
}: EditFeatureDialogProps) {
  const { toast } = useToast()
  const updateFeature = useUpdateFeature()

  const form = useForm<UpdateFeatureFormData>({
    resolver: zodResolver(updateFeatureSchema),
    mode: 'onSubmit',
    defaultValues: {
      title: feature.title,
      description: feature.description || '',
      type: feature.type,
      properties: feature.properties,
      metadata: feature.metadata,
    },
  })

  // Reset form when feature changes
  useEffect(() => {
    if (feature && isOpen) {
      form.reset({
        title: feature.title,
        description: feature.description || '',
        type: feature.type,
        properties: feature.properties,
        metadata: feature.metadata,
      })
    }
  }, [feature, isOpen, form])

  const onSubmit = useCallback(async (data: UpdateFeatureFormData) => {
    // Prevent double submission
    if (updateFeature.isPending) return

    try {
      const updatedFeature = await updateFeature.mutateAsync({
        id: feature.id,
        ...data,
      })

      // Show success notification
      toast({
        title: 'Feature Updated',
        description: `Feature "${updatedFeature.title}" was updated successfully`,
      })

      // Notify parent and close
      onFeatureUpdated?.(updatedFeature)
      onClose()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update feature',
        variant: 'destructive',
      })
    }
  }, [updateFeature, feature.id, toast, onFeatureUpdated, onClose])

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Edit Feature</SheetTitle>
          <SheetDescription>
            Update the feature details. The identifier (name) cannot be changed.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.stopPropagation()
              form.handleSubmit(onSubmit)(e)
            }}
            className="space-y-6 mt-6"
          >
            {/* Name (Read-only) */}
            <div className="space-y-2">
              <FormLabel>Name (Identifier)</FormLabel>
              <Input
                value={feature.name}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                The identifier cannot be changed after creation
              </p>
            </div>

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="API Calls per Month"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Human-readable name shown to customers
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feature Type *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(FEATURE_TYPE_INFO).map(([type, info]) => (
                        <SelectItem key={type} value={type}>
                          <div className="flex items-center gap-2">
                            <info.icon className={cn('h-4 w-4', info.color)} />
                            <span>{info.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {FEATURE_TYPE_INFO[field.value as FeatureType]?.description}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detailed description of this feature..."
                      rows={3}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional description for internal reference
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Properties (JSON) */}
            <FormField
              control={form.control}
              name="properties"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Properties (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='{"unit": "requests", "reset_period": "monthly"}'
                      rows={3}
                      value={field.value ? JSON.stringify(field.value, null, 2) : ''}
                      onChange={(e) => {
                        const parsed = parseJsonSafely(e.target.value)
                        field.onChange(parsed || undefined)
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional JSON configuration for this feature
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Metadata (JSON) */}
            <FormField
              control={form.control}
              name="metadata"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metadata (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='{"category": "usage", "common": true}'
                      rows={3}
                      value={field.value ? JSON.stringify(field.value, null, 2) : ''}
                      onChange={(e) => {
                        const parsed = parseJsonSafely(e.target.value)
                        field.onChange(parsed || undefined)
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional metadata for categorization and filtering
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Stripe Sync Info */}
            {feature.stripe_feature_id && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium">Stripe Integration</p>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Feature ID:</span>{' '}
                    <code className="font-mono">{feature.stripe_feature_id}</code>
                  </p>
                  {feature.stripe_synced_at && (
                    <p>
                      <span className="text-muted-foreground">Last Synced:</span>{' '}
                      {new Date(feature.stripe_synced_at).toLocaleString()}
                    </p>
                  )}
                  {feature.stripe_sync_status && (
                    <p>
                      <span className="text-muted-foreground">Status:</span>{' '}
                      <span className={cn(
                        'font-medium',
                        feature.stripe_sync_status === 'synced' && 'text-green-600',
                        feature.stripe_sync_status === 'pending' && 'text-yellow-600',
                        feature.stripe_sync_status === 'failed' && 'text-red-600'
                      )}>
                        {feature.stripe_sync_status}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateFeature.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateFeature.isPending}>
                {updateFeature.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Feature'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}