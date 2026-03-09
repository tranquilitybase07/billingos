'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Sparkles,
  Loader2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Flag,
  Activity,
  Hash,
} from 'lucide-react'
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
  createFeatureFormSchema,
  generateFeatureNameSlug,
  assembleFeaturePayload,
  parseFeatureToFormValues,
  RESET_PERIOD_OPTIONS,
  type CreateFeatureFormValues,
  type FeatureType,
} from '@/lib/validations/feature'
import {
  FEATURE_TEMPLATES,
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

const TYPE_CARDS = [
  {
    type: 'boolean_flag' as FeatureType,
    label: 'On/Off Feature',
    description: 'Enabled or disabled per plan',
    examples: 'Priority Support, Custom Branding',
    icon: Flag,
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-500/10',
  },
  {
    type: 'usage_quota' as FeatureType,
    label: 'Usage Limit',
    description: 'Resets each billing cycle',
    examples: 'API calls/month, Emails/day',
    icon: Activity,
    iconColor: 'text-green-500',
    iconBg: 'bg-green-500/10',
  },
  {
    type: 'numeric_limit' as FeatureType,
    label: 'Fixed Limit',
    description: "Hard cap that doesn't reset",
    examples: 'Team seats, Storage GB',
    icon: Hash,
    iconColor: 'text-purple-500',
    iconBg: 'bg-purple-500/10',
  },
]

const DEFAULT_VALUES: Omit<CreateFeatureFormValues, 'organization_id'> = {
  name: '',
  title: '',
  description: '',
  type: 'boolean_flag',
  unit: '',
  reset_period: undefined,
  category: '',
  premium: false,
  advanced_metadata: [],
}

export function CreateFeatureDialog({
  organizationId,
  open: openProp,
  isOpen,
  onOpenChange: onOpenChangeProp,
  onClose,
  onFeatureCreated,
}: CreateFeatureDialogProps) {
  const open = openProp ?? isOpen ?? false
  const onOpenChange =
    onOpenChangeProp ?? ((open: boolean) => !open && onClose?.())
  const { toast } = useToast()
  const createFeature = useCreateFeature()

  const [activeTab, setActiveTab] = useState<'templates' | 'custom'>('templates')
  const [autoGenerateName, setAutoGenerateName] = useState(true)
  const [showIdentifierEdit, setShowIdentifierEdit] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const form = useForm<CreateFeatureFormValues>({
    resolver: zodResolver(createFeatureFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: {
      ...DEFAULT_VALUES,
      organization_id: organizationId,
    },
  })

  const { fields: advancedFields, append: appendField, remove: removeField } =
    useFieldArray({ control: form.control, name: 'advanced_metadata' })

  const resetForm = useCallback(() => {
    form.reset({ ...DEFAULT_VALUES, organization_id: organizationId })
    setAutoGenerateName(true)
    setActiveTab('templates')
    setShowIdentifierEdit(false)
    setShowAdvanced(false)
  }, [form, organizationId])

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(resetForm, 300)
    }
  }, [open, resetForm])

  // Auto-generate name slug from title
  const titleValue = form.watch('title')
  const nameValue = form.watch('name')
  const selectedType = form.watch('type')

  useEffect(() => {
    if (autoGenerateName && titleValue) {
      form.setValue('name', generateFeatureNameSlug(titleValue), {
        shouldValidate: false,
      })
    }
  }, [titleValue, autoGenerateName, form])

  const handleTemplateSelect = useCallback(
    (template: FeatureTemplate) => {
      const parsed = parseFeatureToFormValues({
        properties: template.properties ?? null,
        metadata: template.metadata ?? null,
      })
      form.reset({
        organization_id: organizationId,
        name: template.name,
        title: template.title,
        description: template.description,
        type: template.type,
        unit: parsed.unit,
        reset_period: parsed.reset_period,
        category: parsed.category,
        premium: parsed.premium,
        advanced_metadata: parsed.advanced_metadata,
      })
      setAutoGenerateName(false)
      setShowIdentifierEdit(false)
      setShowAdvanced(false)
      setActiveTab('custom')
    },
    [organizationId, form]
  )

  const onSubmit = useCallback(
    async (data: CreateFeatureFormValues) => {
      if (createFeature.isPending) return
      try {
        const payload = assembleFeaturePayload(data) as any
        const feature = await createFeature.mutateAsync(payload)
        resetForm()
        toast({
          title: 'Feature Created',
          description: `"${feature.title}" was created successfully`,
        })
        onFeatureCreated?.(feature)
        onOpenChange(false)
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.message || 'Failed to create feature',
          variant: 'destructive',
        })
      }
    },
    [createFeature, resetForm, toast, onFeatureCreated, onOpenChange]
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

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates">
              <Sparkles className="mr-2 h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          {/* ── Templates Tab ─────────────────────────────────────── */}
          <TabsContent value="templates" className="space-y-4 pt-6">
            <div className="space-y-1">
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
                  className="group flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-all hover:border-primary hover:shadow-sm"
                >
                  <div className="flex w-full items-start justify-between">
                    <div
                      className={cn(
                        'rounded-lg p-2',
                        template.iconColor
                          .replace('text-', 'bg-')
                          .replace('-500', '-500/10')
                      )}
                    >
                      <template.icon
                        className={cn('h-5 w-5', template.iconColor)}
                      />
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

          {/* ── Custom Tab ────────────────────────────────────────── */}
          <TabsContent value="custom" className="pt-6">
            <Form {...form}>
              <form
                onSubmit={(e) => {
                  e.stopPropagation()
                  form.handleSubmit(onSubmit)(e)
                }}
                className="space-y-6"
              >
                {/* Step 1: Type selection cards */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">
                      What kind of feature?
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Choose the type that best describes how this feature works
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {TYPE_CARDS.map((card) => {
                      const isSelected = selectedType === card.type
                      return (
                        <button
                          key={card.type}
                          type="button"
                          onClick={() =>
                            form.setValue('type', card.type, {
                              shouldValidate: false,
                            })
                          }
                          className={cn(
                            'flex flex-col gap-2 rounded-lg border p-3 text-left transition-all',
                            isSelected
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border hover:border-primary/50 hover:bg-muted/30'
                          )}
                        >
                          <div
                            className={cn(
                              'rounded-md p-1.5 w-fit',
                              card.iconBg
                            )}
                          >
                            <card.icon
                              className={cn('h-4 w-4', card.iconColor)}
                            />
                          </div>
                          <div>
                            <p className="text-xs font-semibold leading-tight">
                              {card.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                              {card.description}
                            </p>
                          </div>
                          <p className="text-[10px] text-muted-foreground/60 leading-tight">
                            {card.examples}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t" />

                {/* Title + inline identifier */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            selectedType === 'boolean_flag'
                              ? 'e.g. Priority Support'
                              : selectedType === 'usage_quota'
                              ? 'e.g. API Calls per Month'
                              : 'e.g. Team Members'
                          }
                          {...field}
                        />
                      </FormControl>

                      {/* Identifier preview / inline edit */}
                      {nameValue && (
                        <div className="mt-1">
                          {!showIdentifierEdit ? (
                            <button
                              type="button"
                              onClick={() => setShowIdentifierEdit(true)}
                              className="flex items-center gap-1 group"
                            >
                              <span className="text-xs text-muted-foreground">
                                Identifier:{' '}
                                <code className="font-mono">{nameValue}</code>
                              </span>
                              <Pencil className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                            </button>
                          ) : (
                            <Controller
                              control={form.control}
                              name="name"
                              render={({
                                field: nameField,
                                fieldState,
                              }) => (
                                <div className="space-y-1">
                                  <Input
                                    placeholder="api_calls_per_month"
                                    className="h-7 text-xs font-mono"
                                    value={nameField.value}
                                    onChange={(e) => {
                                      setAutoGenerateName(false)
                                      nameField.onChange(e)
                                    }}
                                    onBlur={nameField.onBlur}
                                  />
                                  {fieldState.error && (
                                    <p className="text-xs text-destructive">
                                      {fieldState.error.message}
                                    </p>
                                  )}
                                </div>
                              )}
                            />
                          )}
                        </div>
                      )}

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
                {selectedType === 'usage_quota' && (
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
                          <FormDescription>
                            What is being counted?
                          </FormDescription>
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

                {selectedType === 'numeric_limit' && (
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
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Advanced options
                  </button>

                  {showAdvanced && (
                    <div className="space-y-2 pl-4 border-l-2 border-muted">
                      <p className="text-xs text-muted-foreground">
                        Add custom metadata fields for your own tracking
                      </p>
                      {advancedFields.map((advField, index) => (
                        <div
                          key={advField.id}
                          className="flex items-center gap-2"
                        >
                          <Input
                            placeholder="key"
                            className="h-7 text-xs font-mono w-28 flex-none"
                            {...form.register(
                              `advanced_metadata.${index}.key`
                            )}
                          />
                          <Input
                            placeholder="value"
                            className="h-7 text-xs flex-1"
                            {...form.register(
                              `advanced_metadata.${index}.value`
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 flex-none"
                            onClick={() => removeField(index)}
                          >
                            <X className="h-3 w-3" />
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
                        <Plus className="h-3 w-3 mr-1" />
                        Add field
                      </Button>
                    </div>
                  )}
                </div>

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
      </SheetContent>
    </Sheet>
  )
}
