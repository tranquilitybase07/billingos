'use client'

import { AlertCircle, Loader2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Feature } from '@/hooks/queries/features'

interface DeleteFeatureConfirmationProps {
  feature: Feature
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  isDeleting?: boolean
  hasProducts?: boolean
}

/**
 * Confirmation dialog for feature deletion with warnings
 */
export function DeleteFeatureConfirmation({
  feature,
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  hasProducts = false,
}: DeleteFeatureConfirmationProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Feature</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the feature "{feature.title}"?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Feature details */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Name:</span>
              <span className="text-sm font-mono">{feature.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Type:</span>
              <span className="text-sm">{feature.type}</span>
            </div>
            {feature.description && (
              <div className="pt-2">
                <p className="text-sm text-muted-foreground">Description:</p>
                <p className="text-sm mt-1">{feature.description}</p>
              </div>
            )}
          </div>

          {/* Warning if feature is used by products */}
          {hasProducts && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This feature is currently being used by one or more products.
                You must remove it from all products before you can delete it.
              </AlertDescription>
            </Alert>
          )}

          {/* General warning */}
          {!hasProducts && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This action cannot be undone. This will permanently delete the
                feature and remove it from your organization.
              </AlertDescription>
            </Alert>
          )}

          {/* Stripe sync warning */}
          {feature.stripe_feature_id && !hasProducts && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This feature is synced with Stripe. Deleting it will also remove
                it from your Stripe account.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          {!hasProducts && (
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isDeleting}
              asChild
            >
              <AlertDialogAction>
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Feature'
                )}
              </AlertDialogAction>
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}