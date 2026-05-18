'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loading03Icon } from 'hugeicons-react'

interface DeleteOrgDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
  orgName: string
  hasStripeAccount: boolean
}

export function DeleteOrgDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  orgName,
  hasStripeAccount,
}: DeleteOrgDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const canConfirm =
    confirmText.trim().toLowerCase() === orgName.trim().toLowerCase()

  const handleOpenChange = (next: boolean) => {
    if (!next) setConfirmText('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{orgName}&rdquo;</DialogTitle>
          <DialogDescription>
            This permanently deletes your BillingOS organization. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="font-medium">What will happen:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {hasStripeAccount && (
                <li>
                  BillingOS will lose access to your connected Stripe account
                  (OAuth will be revoked).
                </li>
              )}
              <li>
                All API keys and SDK session tokens for this organization will
                be revoked immediately — any live integrations will stop
                working.
              </li>
              <li>Team members will lose access to this organization.</li>
            </ul>
          </div>

          {hasStripeAccount && (
            <div className="space-y-1.5">
              <p className="font-medium">What will NOT happen:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Your Stripe account, customers, subscriptions, and invoices
                  are untouched.{' '}
                  <span className="font-medium text-foreground">
                    Active subscriptions will keep billing through Stripe.
                  </span>{' '}
                  If you want them stopped, cancel them in your Stripe
                  dashboard before deleting.
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="delete-org-confirm">
            Type{' '}
            <span className="font-mono font-semibold">{orgName}</span> to
            confirm
          </Label>
          <Input
            id="delete-org-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            placeholder={orgName}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!canConfirm || isPending}
          >
            {isPending ? (
              <>
                <Loading03Icon size={14} className="mr-1.5 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Organization'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
