'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { useModal } from '@/components/Modal/useModal'
import { useUpdateProduct, Product } from '@/hooks/queries/products'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft01Icon, MoreVerticalIcon } from 'hugeicons-react'
import Link from 'next/link'
import { ProductOverview } from './ProductOverview'

export interface ProductPageProps {
  organizationSlug: string
  product: Product
}

export const ProductPage = ({ organizationSlug, product }: ProductPageProps) => {
  const router = useRouter()
  const { toast } = useToast()
  const updateProduct = useUpdateProduct()

  const {
    show: showArchiveModal,
    hide: hideArchiveModal,
    isShown: isArchiveModalShown,
  } = useModal()

  const {
    show: showUnarchiveModal,
    hide: hideUnarchiveModal,
    isShown: isUnarchiveModalShown,
  } = useModal()

  const handleArchiveProduct = useCallback(async () => {
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        body: { is_archived: true },
      })
      toast({
        title: 'Product Archived',
        description: 'Product has been successfully archived',
      })
      hideArchiveModal()
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to archive product',
        variant: 'destructive',
      })
    }
  }, [product.id, updateProduct, toast, hideArchiveModal])

  const handleUnarchiveProduct = useCallback(async () => {
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        body: { is_archived: false },
      })
      toast({
        title: 'Product Unarchived',
        description: 'Product has been successfully unarchived',
      })
      hideUnarchiveModal()
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to unarchive product',
        variant: 'destructive',
      })
    }
  }, [product.id, updateProduct, toast, hideUnarchiveModal])

  // Determine if product is recurring based on prices
  const isRecurring = product.prices?.some(
    (price) => price.type === 'recurring' || price.recurring_interval
  )

  return (
    <DashboardBody>
      {/* Page header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: back button + name + description + badges */}
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href={`/dashboard/${organizationSlug}/products`}
              className="mt-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft01Icon size={20} />
            </Link>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-3">
                <h1 className="truncate text-2xl font-semibold">{product.name}</h1>
                {product.version && product.version > 1 && (
                  <Badge variant="outline">v{product.version}</Badge>
                )}
                {product.version_status === 'superseded' && (
                  <Badge variant="secondary">Old Version</Badge>
                )}
                {product.is_archived && (
                  <Badge variant="destructive">Archived</Badge>
                )}
              </div>
              {product.description && (
                <p className="text-muted-foreground">{product.description}</p>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2">
            {!product.is_archived && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  router.push(
                    `/dashboard/${organizationSlug}/products/${product.id}/edit`
                  )
                }}
              >
                Edit Product
              </Button>
            )}
            {isRecurring && (
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/dashboard/${organizationSlug}/sales/subscriptions?product_id=${product.id}`}>
                  View Subscriptions
                </Link>
              </Button>
            )}
            <Button size="sm" variant="secondary" asChild>
              <Link href={`/dashboard/${organizationSlug}/analytics`}>
                View Analytics
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <MoreVerticalIcon size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    if (typeof navigator !== 'undefined') {
                      navigator.clipboard.writeText(product.id)
                      toast({
                        title: 'Copied',
                        description: 'Product ID copied to clipboard',
                      })
                    }
                  }}
                >
                  Copy Product ID
                </DropdownMenuItem>
                {!product.is_archived && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={showArchiveModal}
                      className="text-destructive focus:text-destructive"
                    >
                      Archive Product
                    </DropdownMenuItem>
                  </>
                )}
                {product.is_archived && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={showUnarchiveModal}>
                      Unarchive Product
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <ProductOverview
          organizationSlug={organizationSlug}
          product={product}
          isRecurring={isRecurring}
        />

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={isArchiveModalShown} onOpenChange={hideArchiveModal}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Product</AlertDialogTitle>
              <AlertDialogDescription>
                Archiving a product will not affect its current customers, only
                prevent new subscribers and purchases.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArchiveProduct}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      {/* Unarchive Confirmation Dialog */}
      <AlertDialog open={isUnarchiveModalShown} onOpenChange={hideUnarchiveModal}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unarchive Product</AlertDialogTitle>
              <AlertDialogDescription>
                Unarchiving this product will make it available for new
                subscribers and purchases again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleUnarchiveProduct}>
                Unarchive
              </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardBody>
  )
}
