'use client'

import { ProductPage } from '@/components/Products/ProductPage/ProductPage'
import { useProduct } from '@/hooks/queries/products'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardBody } from '@/components/Layout/DashboardLayout'

interface ProductDetailPageProps {
  organizationSlug: string
  productId: string
}

export default function ProductDetailPage({
  organizationSlug,
  productId,
}: ProductDetailPageProps) {
  const { data: product, isLoading, error } = useProduct(productId)

  if (isLoading) {
    return (
      <DashboardBody>
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </DashboardBody>
    )
  }

  if (error || !product) {
    return (
      <DashboardBody>
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <h2 className="text-xl font-medium">Product not found</h2>
          <p className="text-muted-foreground">
            The product you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
        </div>
      </DashboardBody>
    )
  }

  return (
    <ProductPage
      organizationSlug={organizationSlug}
      product={product}
    />
  )
}
