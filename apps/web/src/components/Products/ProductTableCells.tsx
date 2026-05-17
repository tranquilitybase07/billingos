'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVerticalIcon, ViewIcon, ViewOffIcon } from 'hugeicons-react'

import { useModal } from '@/components/Modal/useModal'
import { useUpdateProduct } from '@/hooks/queries/products'
import { useProductVisibility } from '@/hooks/useProductVisibility'
import { Product } from '@/utils/product'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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

function stop(callback: (e: React.MouseEvent) => void) {
  return (e: React.MouseEvent) => {
    e.stopPropagation()
    callback(e)
  }
}

export function ProductVisibilityCell({ product }: { product: Product }) {
  const { isVisible, toggleVisibility, isUpdating } = useProductVisibility(product)

  if (product.is_archived) {
    return <span className="text-muted-foreground">—</span>
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              {isVisible ? (
                <ViewIcon size={14} className="text-muted-foreground" />
              ) : (
                <ViewOffIcon size={14} className="text-muted-foreground" />
              )}
              <Switch
                checked={isVisible}
                onCheckedChange={toggleVisibility}
                disabled={isUpdating}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">
              {isVisible
                ? 'Visible in pricing table'
                : 'Hidden from pricing table'}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

interface ProductActionsCellProps {
  product: Product
  organizationSlug: string
}

export function ProductActionsCell({ product, organizationSlug }: ProductActionsCellProps) {
  const router = useRouter()
  const { toast } = useToast()
  const updateProduct = useUpdateProduct()
  const { show: showModal, hide: hideModal, isShown } = useModal()

  const onArchive = useCallback(async () => {
    try {
      await updateProduct.mutate({
        id: product.id,
        body: { is_archived: true },
      })
      toast({ title: 'Product archived', description: 'The product has been archived' })
    } catch {
      toast({
        title: 'Error',
        description: 'An error occurred while archiving the product',
        variant: 'destructive',
      })
    }
  }, [updateProduct, product, toast])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Product actions"
          >
            <MoreVerticalIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            onClick={stop(() => {
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
              onClick={stop(() => {
                router.push(`/dashboard/${organizationSlug}/products/${product.id}/edit`)
              })}
            >
              Edit Product
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={stop(() => {
              router.push(`/dashboard/${organizationSlug}/products/new?fromProductId=${product.id}`)
            })}
          >
            Duplicate Product
          </DropdownMenuItem>
          {!product.is_archived && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={stop(showModal)}
                className="text-destructive focus:text-destructive"
              >
                Archive Product
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isShown} onOpenChange={hideModal}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive &quot;{product.name}&quot;</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this product? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onArchive}
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
