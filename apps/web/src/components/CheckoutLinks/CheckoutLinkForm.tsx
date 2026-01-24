'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DiscountSelector } from '@/components/Discounts/DiscountSelector'
import { useToast } from '@/hooks/use-toast'
import { X } from 'lucide-react'
import { useState } from 'react'

interface CheckoutLinkFormProps {
  organizationId: string
  organizationSlug: string
  onClose: (checkoutLink?: any) => void
  productIds?: string[]
}

export const CheckoutLinkForm = ({
  organizationId,
  organizationSlug,
  onClose,
  productIds = [],
}: CheckoutLinkFormProps) => {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [label, setLabel] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>(productIds)
  const [successUrl, setSuccessUrl] = useState('')
  const [presetDiscount, setPresetDiscount] = useState<string>('')
  const [allowDiscountCodes, setAllowDiscountCodes] = useState(true)
  const [requireBillingAddress, setRequireBillingAddress] = useState(false)
  const [metadata, setMetadata] = useState<Array<{ key: string; value: string }>>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const newCheckoutLink = {
        id: `cl_${Date.now()}`,
        label,
        products: selectedProducts,
        success_url: successUrl,
        preset_discount: presetDiscount || null,
        allow_discount_codes: allowDiscountCodes,
        require_billing_address: requireBillingAddress,
        metadata: metadata.reduce((acc, item) => {
          if (item.key) acc[item.key] = item.value
          return acc
        }, {} as Record<string, string>),
        created_at: new Date().toISOString(),
      }

      toast({
        title: 'Checkout Link Created',
        description: 'Your checkout link has been created successfully',
      })

      onClose(newCheckoutLink)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create checkout link',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const addMetadataField = () => {
    if (metadata.length < 50) {
      setMetadata([...metadata, { key: '', value: '' }])
    }
  }

  const removeMetadataField = (index: number) => {
    setMetadata(metadata.filter((_, i) => i !== index))
  }

  const updateMetadataField = (
    index: number,
    field: 'key' | 'value',
    value: string,
  ) => {
    const newMetadata = [...metadata]
    newMetadata[index][field] = value
    setMetadata(newMetadata)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-8 py-6">
        <h2 className="text-xl font-semibold">Create Checkout Link</h2>
        <Button variant="ghost" size="icon" onClick={() => onClose()}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="label">
              Label <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="label"
              placeholder="e.g., Summer Sale 2024"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Helpful for organizing multiple checkout links (internal use only)
            </p>
          </div>

          {/* Products */}
          <div className="space-y-2">
            <Label htmlFor="products">
              Products <span className="text-destructive">*</span>
            </Label>
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                Product selector coming soon. For now, products are pre-selected.
              </p>
              {selectedProducts.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedProducts.length} product(s) selected
                </p>
              )}
            </div>
          </div>

          {/* Success URL */}
          <div className="space-y-2">
            <Label htmlFor="successUrl">
              Success URL <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="successUrl"
              type="url"
              placeholder="https://yoursite.com/success"
              value={successUrl}
              onChange={(e) => setSuccessUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Redirect customers here after successful checkout. Supports{' '}
              <code className="rounded bg-muted px-1">{'Checkout_ID'}</code>{' '}
              placeholder.
            </p>
          </div>

          {/* Preset Discount */}
          <div className="space-y-2">
            <Label htmlFor="presetDiscount">
              Preset Discount <span className="text-muted-foreground">(optional)</span>
            </Label>
            <DiscountSelector
              organizationId={organizationId}
              value={presetDiscount}
              onValueChange={setPresetDiscount}
              placeholder="Select a discount"
            />
            <p className="text-xs text-muted-foreground">
              Automatically apply a discount at checkout
            </p>
          </div>

          {/* Allow Discount Codes */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="allowDiscountCodes" className="cursor-pointer">
                Allow Discount Codes
              </Label>
              <p className="text-sm text-muted-foreground">
                Let customers apply discount codes at checkout
              </p>
            </div>
            <Switch
              id="allowDiscountCodes"
              checked={allowDiscountCodes}
              onCheckedChange={setAllowDiscountCodes}
            />
          </div>

          {/* Require Billing Address */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="requireBillingAddress" className="cursor-pointer">
                Require Billing Address
              </Label>
              <p className="text-sm text-muted-foreground">
                Require full billing address (default: country only)
              </p>
            </div>
            <Switch
              id="requireBillingAddress"
              checked={requireBillingAddress}
              onCheckedChange={setRequireBillingAddress}
            />
          </div>

          {/* Metadata */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Metadata <span className="text-muted-foreground">(optional)</span>
              </Label>
              {metadata.length < 50 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMetadataField}
                >
                  Add Field
                </Button>
              )}
            </div>
            {metadata.length > 0 ? (
              <div className="space-y-3">
                {metadata.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="Key"
                      value={item.key}
                      onChange={(e) =>
                        updateMetadataField(index, 'key', e.target.value)
                      }
                    />
                    <Input
                      placeholder="Value"
                      value={item.value}
                      onChange={(e) =>
                        updateMetadataField(index, 'value', e.target.value)
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMetadataField(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add custom key-value pairs (max 50)
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t px-8 py-4">
          <Button type="button" variant="outline" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || selectedProducts.length === 0}
          >
            {isSubmitting ? 'Creating...' : 'Create Checkout Link'}
          </Button>
        </div>
      </form>
    </div>
  )
}
