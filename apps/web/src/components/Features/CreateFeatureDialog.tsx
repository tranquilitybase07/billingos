'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Sparkles, Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
import { useCreateFeature, type Feature } from '@/hooks/queries/features'
import {
  createFeatureSchema,
  generateFeatureNameSlug,
  parseJsonSafely,
  type CreateFeatureFormData,
  type FeatureType,
} from '@/lib/validations/feature'
import {
  FEATURE_TEMPLATES,
  FEATURE_TYPE_INFO,
  type FeatureTemplate,
} from '@/lib/constants/feature-templates'
import { FeatureTypeIcon } from './FeatureTypeIcon'
import { cn } from '@/lib/utils'

interface CreateFeatureDialogProps {
  organizationId: string
  open?: boolean
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  onFeatureCreated?: (feature: Feature) => void
}

/**
 * Reusable feature creation dialog with templates and custom form
 * Uses Sheet (drawer) on desktop, Dialog on mobile
 */
export function CreateFeatureDialog({
  organizationId,
  open: openProp,
  isOpen,
  onOpenChange: onOpenChangeProp,
  onClose,
  onFeatureCreated,
}: CreateFeatureDialogProps) {
  // Support both prop naming conventions
  const open = openProp ?? isOpen ?? false
  const onOpenChange = onOpenChangeProp ?? ((open: boolean) => !open && onClose?.())
  const { toast } = useToast()
  const createFeature = useCreateFeature()
  const [activeTab, setActiveTab] = useState<'templates' | 'custom'>('templates')
  const [autoGenerateName, setAutoGenerateName] = useState(true)

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Reset to initial state when dialog is closed
      setTimeout(() => {
        form.reset({
          organization_id: organizationId,
          name: '',
          title: '',
          description: '',
          type: 'boolean_flag',
          properties: undefined,
          metadata: undefined,
        })
        setAutoGenerateName(true)
        setActiveTab('templates')
      }, 300) // Wait for animation to complete
    }
  }, [open, organizationId])

  const form = useForm<CreateFeatureFormData>({
    resolver: zodResolver(createFeatureSchema),
    mode: 'onSubmit', // Only validate on submit, not onChange
    reValidateMode: 'onSubmit',
    defaultValues: {
      organization_id: organizationId,
      name: '',
      title: '',
      description: '',
      type: 'boolean_flag',
      properties: undefined,
      metadata: undefined,
    },
  })

  // Auto-generate name from title
  const titleValue = form.watch('title')
  useEffect(() => {
    if (autoGenerateName && titleValue) {
      form.setValue('name', generateFeatureNameSlug(titleValue), {
        shouldValidate: false,
      })
    }
  }, [titleValue, autoGenerateName, form])

  const handleTemplateSelect = useCallback((template: FeatureTemplate) => {
    // Use form.reset to set all values at once for better performance
    form.reset({
      organization_id: organizationId,
      name: template.name,
      title: template.title,
      description: template.description,
      type: template.type,
      properties: template.properties,
      metadata: template.metadata,
    })
    setAutoGenerateName(false)
    setActiveTab('custom')
  }, [organizationId, form])

  const onSubmit = useCallback(async (data: CreateFeatureFormData) => {
    // Prevent double submission
    if (createFeature.isPending) return

    try {
      const feature = await createFeature.mutateAsync(data)

      // Reset form to initial state
      form.reset({
        organization_id: organizationId,
        name: '',
        title: '',
        description: '',
        type: 'boolean_flag',
        properties: undefined,
        metadata: undefined,
      })
      setAutoGenerateName(true)
      setActiveTab('templates')

      // Show success notification
      toast({
        title: 'Feature Created',
        description: `Feature "${feature.title}" was created successfully`,
      })

      // Notify parent and close
      onFeatureCreated?.(feature)
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create feature',
        variant: 'destructive',
      })
    }
  }, [createFeature, organizationId, form, toast, onFeatureCreated, onOpenChange])

  const dialogContent = (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="templates">
          <Sparkles className="mr-2 h-4 w-4" />
          Templates
        </TabsTrigger>
        <TabsTrigger value="custom">Custom</TabsTrigger>
      </TabsList>

      {/* Templates Tab */}
      <TabsContent value="templates" className="space-y-4 pt-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Quick Start</h3>
          <p className="text-sm text-muted-foreground">
            Choose a pre-configured template to get started quickly
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => handleTemplateSelect(template)}
              className={cn(
                'group flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-all hover:border-primary hover:shadow-sm'
              )}
            >
              <div className="flex w-full items-start justify-between">
                <div className={cn('rounded-lg p-2', template.iconColor.replace('text-', 'bg-').replace('-500', '-500/10'))}>
                  <template.icon className={cn('h-5 w-5', template.iconColor)} />
                </div>
                <FeatureTypeIcon type={template.type} className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-medium">{template.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {template.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </TabsContent>

      {/* Custom Tab */}
      <TabsContent value="custom" className="pt-6">
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.stopPropagation() // Prevent event from bubbling to parent product form
              form.handleSubmit(onSubmit)(e)
            }}
            className="space-y-6"
          >
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

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (Identifier) *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="api_calls_per_month"
                      {...field}
                      onChange={(e) => {
                        setAutoGenerateName(false)
                        field.onChange(e)
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Unique identifier (lowercase, numbers, underscores only)
                    {autoGenerateName && ' - Auto-generated from title'}
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

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createFeature.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createFeature.isPending}>
                {createFeature.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Feature'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </TabsContent>
    </Tabs>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create Feature</SheetTitle>
          <SheetDescription>
            Create a new feature to include in your products
          </SheetDescription>
        </SheetHeader>
        {dialogContent}
      </SheetContent>
    </Sheet>
  )
}
