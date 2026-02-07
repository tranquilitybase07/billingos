'use client'

import { useModal } from '@/components/Modal/useModal'
import ProductPriceLabel from '@/components/Products/ProductPriceLabel'
import { ProductThumbnail } from '@/components/Products/ProductThumbnail'
import { useUpdateProduct } from '@/hooks/queries/products'
import { Product, isMeteredPrice, isSeatBasedPrice } from '@/utils/product'
import { MoreVert as MoreVertOutlined } from '@mui/icons-material'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

interface ProductListItemProps {
  product: Product
  organization: { id: string; slug: string }
}

export const ProductListItem = ({
  product,
  organization,
}: ProductListItemProps) => {
  const router = useRouter()
  const { toast } = useToast()
  const {
    show: showModal,
    hide: hideModal,
    isShown: isConfirmModalShown,
  } = useModal()

  const handleContextMenuCallback = (
    callback: (e: React.MouseEvent) => void,
  ) => {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      callback(e)
    }
  }

  const updateProduct = useUpdateProduct()

  const onArchiveProduct = useCallback(async () => {
    try {
      await updateProduct.mutate({
        id: product.id,
        body: {
          is_archived: true,
        },
      })

      toast({
        title: 'Product archived',
        description: 'The product has been archived',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred while archiving the product',
        variant: 'destructive',
      })
    }
  }, [updateProduct, product, toast])

  const isUsageBasedProduct = product.prices.some((price) =>
    isMeteredPrice(price),
  )

  const isSeatBasedProduct = product.prices.some((price) =>
    isSeatBasedPrice(price),
  )

  return (
    <>
      <Link
        href={`/dashboard/${organization.slug}/products/${product.id}`}
        className="flex flex-row items-center justify-between gap-x-6 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
      >
        <div className="flex min-w-0 grow flex-row items-center gap-x-4 text-sm">
          <ProductThumbnail product={product} />
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{product.name}</span>
              {product.version && product.version > 1 && (
                <Badge variant="outline" className="text-xs">
                  v{product.version}
                </Badge>
              )}
              {product.version_status === 'superseded' && (
                <Badge variant="secondary" className="text-xs">
                  Old Version
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-x-4 md:gap-x-6">
          {product.is_archived ? (
            <Badge variant="destructive">Archived</Badge>
          ) : (
            <>
              {isUsageBasedProduct && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                  Metered Pricing
                </Badge>
              )}
              {isSeatBasedProduct && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                  Seat Pricing
                </Badge>
              )}
              <span className="text-sm leading-snug">
                <ProductPriceLabel product={product} />
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.preventDefault()
                  router.push(
                    `/dashboard/${organization.slug}/products/checkout-links?productId=${product.id}`,
                  )
                }}
              >
                Share
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-50 transition-opacity hover:opacity-100"
                  >
                    <MoreVertOutlined />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleContextMenuCallback(() => {
                      if (typeof navigator !== 'undefined') {
                        navigator.clipboard.writeText(product.id)
                      }
                    })}
                  >
                    Copy Product ID
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {!product.is_archived && (
                    <DropdownMenuItem
                      onClick={handleContextMenuCallback(() => {
                        router.push(
                          `/dashboard/${organization.slug}/products/${product.id}/edit`,
                        )
                      })}
                    >
                      Edit Product
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={handleContextMenuCallback(() => {
                      router.push(
                        `/dashboard/${organization.slug}/products/new?fromProductId=${product.id}`,
                      )
                    })}
                  >
                    Duplicate Product
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleContextMenuCallback(showModal)}
                    className="text-destructive focus:text-destructive"
                  >
                    Archive Product
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </Link>

      <AlertDialog open={isConfirmModalShown} onOpenChange={hideModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive &quot;{product.name}&quot;</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this product? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onArchiveProduct}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
