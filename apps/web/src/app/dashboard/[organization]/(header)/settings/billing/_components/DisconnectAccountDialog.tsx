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

const CONFIRM_PHRASE = 'disconnect'

interface DisconnectAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
  connectionType: 'express' | 'standard'
}

export function DisconnectAccountDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  connectionType,
}: DisconnectAccountDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const canConfirm = confirmText.trim().toLowerCase() === CONFIRM_PHRASE

  const handleOpenChange = (next: boolean) => {
    if (!next) setConfirmText('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect Stripe account</DialogTitle>
          <DialogDescription>
            {connectionType === 'standard'
              ? 'BillingOS will lose access to your Stripe account. Your Stripe account itself, and all data inside it, stays intact.'
              : 'This will permanently remove the Stripe account we created for you. Only allowed if no payments have been processed yet.'}{' '}
            You can reconnect (or pick a different mode) afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="disconnect-confirm">
            Type <span className="font-mono font-semibold">disconnect</span> to confirm
          </Label>
          <Input
            id="disconnect-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            placeholder="disconnect"
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
                Disconnecting...
              </>
            ) : (
              'Disconnect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
