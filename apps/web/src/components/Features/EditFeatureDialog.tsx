'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Loading03Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  PlusSignIcon,
  Cancel01Icon,
  Flag01Icon,
  Activity01Icon,
  HashtagIcon,
} from 'hugeicons-react'
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
  updateFeatureFormSchema,
  assembleFeaturePayload,
  parseFeatureToFormValues,
  RESET_PERIOD_OPTIONS,
  type UpdateFeatureFormValues,
  type FeatureType,
} from '@/lib/validations/feature'
import { cn } from '@/lib/utils'

interface EditFeatureDialogProps {
  feature: Feature
  isOpen: boolean
  onClose: () => void
  onFeatureUpdated?: (feature: Feature) => void
}

const TYPE_DISPLAY = {
  boolean_flag: {
    label: 'On/Off Feature',
    description: 'Enabled or disabled per plan',
    icon: Flag01Icon,
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-500/10',
  },
  usage_quota: {
    label: 'Usage Limit',
    description: 'Resets each billing cycle',
    icon: Activity01Icon,
    iconColor: 'text-green-500',
    iconBg: 'bg-green-500/10',
  },
  numeric_limit: {
    label: 'Fixed Limit',
    description: "Hard cap that doesn't reset",
    icon: HashtagIcon,
    iconColor: 'text-purple-500',
    iconBg: 'bg-purple-500/10',
  },
} as const

export function EditFeatureDialog({
  feature,
  isOpen,
  onClose,
  onFeatureUpdated,
}: EditFeatureDialogProps) {
  const { toast } = useToast()
  const updateFeature = useUpdateFeature()
  const [showAdvanced, setShowAdvanced] = useState(false)

  const getDefaultValues = useCallback((): UpdateFeatureFormValues => {
    const parsed = parseFeatureToFormValues({
      properties: feature.properties ?? null,
      metadata: feature.metadata ?? null,
    })
    return {
      title: feature.title,
      description: feature.description || '',
      unit: parsed.unit,
      reset_period: parsed.reset_period,
      category: parsed.category,
      premium: parsed.premium,
      advanced_metadata: parsed.advanced_metadata,
    }
  }, [feature])

  const form = useForm<UpdateFeatureFormValues>({
    resolver: zodResolver(updateFeatureFormSchema),
    mode: 'onSubmit',
    defaultValues: getDefaultValues(),
  })

  const { fields: advancedFields, append: appendField, remove: removeField } =
    useFieldArray({ control: form.control, name: 'advanced_metadata' })

  // Reset form when feature changes or dialog opens
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: reset form state when dialog opens */
  useEffect(() => {
    if (isOpen) {
      form.reset(getDefaultValues())
      setShowAdvanced(false)
    }
  }, [feature, isOpen, getDefaultValues, form])
  /* eslint-enable react-hooks/set-state-in-effect */

  const onSubmit = useCallback(
    async (data: UpdateFeatureFormValues) => {
      if (updateFeature.isPending) return
      try {
        const payload = assembleFeaturePayload(data) as any
        const updatedFeature = await updateFeature.mutateAsync({
          id: feature.id,
          ...payload,
        })
        toast({
          title: 'Feature Updated',
          description: `"${updatedFeature.title}" was updated successfully`,
        })
        onFeatureUpdated?.(updatedFeature)
        onClose()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to update feature',
          variant: 'destructive',
        })
      }
    },
    [updateFeature, feature.id, toast, onFeatureUpdated, onClose]
  )

  const typeInfo = TYPE_DISPLAY[feature.type as FeatureType]
  const TypeIcon = typeInfo?.icon

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Edit Feature</SheetTitle>
          <SheetDescription>
            Update feature details. Type and identifier cannot be changed.
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
            {/* Read-only: Type display */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Feature Type</p>
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 bg-muted/30 cursor-not-allowed',
                  'opacity-70'
                )}
              >
                {typeInfo && TypeIcon && (
                  <div className={cn('rounded-md p-1.5', typeInfo.iconBg)}>
                    <TypeIcon className={cn('h-4 w-4', typeInfo.iconColor)} />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{typeInfo?.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeInfo?.description}
                  </p>
                </div>
                <p className="ml-auto text-xs text-muted-foreground">
                  Can't be changed
                </p>
              </div>
            </div>

            {/* Read-only: Identifier */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Identifier</p>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/30 opacity-70 cursor-not-allowed">
                <code className="text-sm font-mono text-muted-foreground">
                  {feature.name}
                </code>
              </div>
              <p className="text-xs text-muted-foreground">
                Cannot be changed after creation
              </p>
            </div>

            <div className="border-t" />

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="Feature title" {...field} />
                  </FormControl>
                  <FormDescription>
                    Human-readable name shown to customers
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
                  <FormLabel>
                    Description{' '}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description shown to customers..."
                      rows={2}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type-specific fields */}
            {feature.type === 'usage_quota' && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. requests, emails"
                          value={field.value || ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>What is being counted?</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reset_period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resets</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="How often?" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RESET_PERIOD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Billing cycle</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {feature.type === 'numeric_limit' && (
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. GB, members, projects"
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>
                      What is the limit measured in?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Advanced key-value metadata */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? (
                  <ArrowDown01Icon size={12} />
                ) : (
                  <ArrowRight01Icon size={12} />
                )}
                Advanced options
              </button>

              {showAdvanced && (
                <div className="space-y-2 pl-4 border-l-2 border-muted">
                  <p className="text-xs text-muted-foreground">
                    Add custom metadata fields for your own tracking
                  </p>
                  {advancedFields.map((advField, index) => (
                    <div key={advField.id} className="flex items-center gap-2">
                      <Input
                        placeholder="key"
                        className="h-7 text-xs font-mono w-28 flex-none"
                        {...form.register(`advanced_metadata.${index}.key`)}
                      />
                      <Input
                        placeholder="value"
                        className="h-7 text-xs flex-1"
                        {...form.register(`advanced_metadata.${index}.value`)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 flex-none"
                        onClick={() => removeField(index)}
                      >
                        <Cancel01Icon size={12} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => appendField({ key: '', value: '' })}
                  >
                    <PlusSignIcon size={12} className="mr-1" />
                    Add field
                  </Button>
                </div>
              )}
            </div>

            {/* Stripe Sync Info */}
            {feature.stripe_feature_id && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium">Stripe Integration</p>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Feature ID:</span>{' '}
                    <code className="font-mono text-xs">
                      {feature.stripe_feature_id}
                    </code>
                  </p>
                  {feature.stripe_synced_at && (
                    <p>
                      <span className="text-muted-foreground">
                        Last Synced:
                      </span>{' '}
                      {new Date(feature.stripe_synced_at).toLocaleString()}
                    </p>
                  )}
                  {feature.stripe_sync_status && (
                    <p>
                      <span className="text-muted-foreground">Status:</span>{' '}
                      <span
                        className={cn(
                          'font-medium',
                          feature.stripe_sync_status === 'synced' &&
                            'text-green-600',
                          feature.stripe_sync_status === 'pending' &&
                            'text-yellow-600',
                          feature.stripe_sync_status === 'failed' &&
                            'text-red-600'
                        )}
                      >
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
                    <Loading03Icon size={16} className="mr-2 animate-spin" />
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
