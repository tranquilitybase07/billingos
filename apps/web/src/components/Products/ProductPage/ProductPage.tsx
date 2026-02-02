'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { ProductThumbnail } from '@/components/Products/ProductThumbnail'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MoreVert as MoreVertOutlined } from '@mui/icons-material'
import { ProductOverview } from './ProductOverview'
import { ProductMetricsView } from './ProductMetricsView'

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
    } catch (error) {
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
    } catch (error) {
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
    <Tabs defaultValue="overview" className="h-full">
      <DashboardBody
        title={
          <div className="flex min-w-0 flex-row items-center gap-4">
            <div className="flex min-w-0 flex-row items-center gap-4">
              <ProductThumbnail product={product} />
              <h1 className="truncate text-2xl font-semibold">{product.name}</h1>
            </div>

            <div className="flex flex-row items-center gap-2">
              <Badge
                variant="secondary"
                className={
                  isRecurring
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400'
                }
              >
                {isRecurring ? 'Subscription' : 'One-time'}
              </Badge>
              {product.is_archived && (
                <Badge variant="destructive">Archived</Badge>
              )}
            </div>
          </div>
        }
        header={
          <div className="flex flex-row items-center gap-2">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost">
                  <MoreVertOutlined fontSize="small" />
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
                    <DropdownMenuItem
                      onClick={() => {
                        router.push(
                          `/dashboard/${organizationSlug}/products/checkout-links?productId=${product.id}`
                        )
                      }}
                    >
                      Integrate Checkout
                    </DropdownMenuItem>
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
        }
      >
        <TabsList className="mb-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ProductOverview
            organizationSlug={organizationSlug}
            product={product}
            isRecurring={isRecurring}
          />
        </TabsContent>

        <TabsContent value="metrics">
          <ProductMetricsView
            product={product}
            isRecurring={isRecurring}
          />
        </TabsContent>

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
    </Tabs>
  )
}
