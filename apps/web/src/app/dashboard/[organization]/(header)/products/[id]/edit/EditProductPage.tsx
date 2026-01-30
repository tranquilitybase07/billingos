'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { Save } from 'lucide-react'
import Link from 'next/link'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useProductForm } from '@/hooks/useProductForm'
import { useProduct, useUpdateProduct } from '@/hooks/queries/products'
import { useFeatures } from '@/hooks/queries/features'
import { PricingEngineSection } from '@/components/Products/PricingEngineSection'
import { FeatureSelector } from '@/components/Products/FeatureSelector'
import { LivePreviewCard } from '@/components/Products/LivePreviewCard'

interface EditProductPageProps {
  organizationSlug: string
  productId: string
}

export default function EditProductPage({
  organizationSlug,
  productId,
}: EditProductPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { organization } = useOrganization()

  // Fetch the existing product
  const { data: product, isLoading, error } = useProduct(productId)

  if (isLoading) {
    return (
      <DashboardBody title="Edit Product" wide>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[60%_40%]">
          <div className="space-y-6">
            <Skeleton className="h-[200px] rounded-lg" />
            <Skeleton className="h-[300px] rounded-lg" />
            <Skeleton className="h-[200px] rounded-lg" />
          </div>
          <div className="hidden xl:block">
            <Skeleton className="h-[400px] rounded-lg" />
          </div>
        </div>
      </DashboardBody>
    )
  }

  if (error || !product) {
    return (
      <DashboardBody title="Edit Product">
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <h2 className="text-xl font-medium">Product not found</h2>
          <p className="text-muted-foreground">
            The product you&apos;re trying to edit doesn&apos;t exist or has been removed.
          </p>
          <Link href={`/dashboard/${organizationSlug}/products`}>
            <Button variant="secondary">Back to Products</Button>
          </Link>
        </div>
      </DashboardBody>
    )
  }

  return (
    <EditProductForm
      organizationSlug={organizationSlug}
      productId={productId}
      organizationId={organization.id}
    />
  )
}

/**
 * Separate component so useProductForm is only called after product data is loaded.
 * This avoids the hook being called before the product is available.
 */
function EditProductForm({
  organizationSlug,
  productId,
  organizationId,
}: {
  organizationSlug: string
  productId: string
  organizationId: string
}) {
  const router = useRouter()
  const { toast } = useToast()

  const { data: product } = useProduct(productId)
  const form = useProductForm(organizationId, product)
  const { data: features = [], isLoading: isFeaturesLoading } = useFeatures(organizationId)
  const updateProduct = useUpdateProduct()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationError = form.getValidationError()
    if (validationError) {
      toast({
        title: 'Validation Error',
        description: validationError,
        variant: 'destructive',
      })
      return
    }

    try {
      const payload = form.buildPayload()
      await updateProduct.mutateAsync({
        id: productId,
        body: payload,
      })

      toast({
        title: 'Product Updated',
        description: `Product "${form.name}" was updated successfully`,
      })

      router.push(`/dashboard/${organizationSlug}/products/${productId}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update product'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    }
  }

  return (
    <DashboardBody title="Edit Product" wide>
      {/* Split View: 60/40 Layout */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[60%_40%]">
        {/* Left Column: Configuration Forms */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                General details about your product
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  placeholder="Premium Subscription"
                  value={form.name}
                  onChange={(e) => form.setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Perfect for growing teams who need advanced features and priority support."
                  value={form.description}
                  onChange={(e) => form.setDescription(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  This will be shown to customers on the pricing page
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Engine */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing Engine</CardTitle>
              <CardDescription>
                Configure pricing, billing intervals, and free trials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PricingEngineSection
                prices={form.prices}
                onPricesChange={form.setPrices}
                trialDays={form.trialDays}
                onTrialDaysChange={form.setTrialDays}
                currency={form.currency}
                onCurrencyChange={form.setCurrency}
              />
            </CardContent>
          </Card>

          {/* Features & Entitlements */}
          <Card>
            <CardHeader>
              <CardTitle>Features & Entitlements</CardTitle>
              <CardDescription>
                Select features included in this product and configure limits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FeatureSelector
                availableFeatures={features}
                selectedFeatures={form.features}
                onFeaturesChange={form.setFeatures}
                isLoading={isFeaturesLoading}
                organizationId={organizationId}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between rounded-lg border-t bg-muted/30 p-6">
            <Link href={`/dashboard/${organizationSlug}/products/${productId}`}>
              <Button type="button" variant="outline" disabled={updateProduct.isPending}>
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              size="lg"
              disabled={updateProduct.isPending || !form.isValid()}
              className="min-w-48"
            >
              {updateProduct.isPending ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Right Column: Live Preview */}
        <div className="hidden xl:block">
          <LivePreviewCard
            productName={form.name}
            description={form.description}
            prices={form.prices}
            features={form.features}
            currency={form.currency}
            trialDays={form.trialDays}
          />
        </div>
      </div>
    </DashboardBody>
  )
}
