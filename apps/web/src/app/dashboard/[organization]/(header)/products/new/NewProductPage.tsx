'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useProductForm } from '@/hooks/useProductForm'
import { useCreateProduct } from '@/hooks/queries/products'
import { useFeatures } from '@/hooks/queries/features'
import { PricingEngineSection } from '@/components/Products/PricingEngineSection'
import { FeatureSelector } from '@/components/Products/FeatureSelector'
import { LivePreviewCard } from '@/components/Products/LivePreviewCard'

interface NewProductPageProps {
  organizationSlug: string
}

export default function NewProductPage({ organizationSlug }: NewProductPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { organization } = useOrganization()

  // Form state management
  const form = useProductForm(organization.id)

  // Fetch available features
  const { data: features = [], isLoading: isFeaturesLoading } = useFeatures(organization.id)

  // Create product mutation
  const createProduct = useCreateProduct()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.isValid()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      })
      return
    }

    try {
      const payload = form.buildPayload()
      const product = await createProduct.mutateAsync(payload)

      toast({
        title: 'Product Created',
        description: `Product "${form.name}" was created successfully and published to Stripe`,
      })

      router.push(`/dashboard/${organizationSlug}/products`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create product',
        variant: 'destructive',
      })
    }
  }

  return (
    <DashboardBody title='Create Product' wide>
      {/* Header */}
      {/* <div className="mb-6 flex items-center gap-4">
        <Link href={`/dashboard/${organizationSlug}/products`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Create Product</h1>
          <p className="text-muted-foreground">
            Configure your product and see a live preview
          </p>
        </div>
      </div> */}

      {/* Split View: 70/30 Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[60%_40%] gap-8">
        {/* Left Column: Configuration Forms (70%) */}
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
              <div className="flex items-center gap-2">

                <CardTitle>Pricing Engine</CardTitle>
              </div>
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
                organizationId={organization.id}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between rounded-lg border-t bg-muted/30 p-6">
            <Link href={`/dashboard/${organizationSlug}/products`}>
              <Button type="button" variant="outline" disabled={createProduct.isPending}>
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              size="lg"
              disabled={createProduct.isPending || !form.isValid()}
              className="min-w-48"
            >
              {createProduct.isPending ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Publishing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Publish to Stripe
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Right Column: Live Preview (30%) */}
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
