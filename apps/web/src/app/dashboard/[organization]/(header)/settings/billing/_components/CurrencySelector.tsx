'use client'

import { useState } from 'react'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useUpdateOrgCurrency } from '@/hooks/queries/organization'
import { SUPPORTED_CURRENCIES } from '@/lib/constants/currencies'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loading03Icon, LockIcon } from 'hugeicons-react'

interface CurrencySelectorProps {
  hasProducts: boolean
}

export function CurrencySelector({ hasProducts }: CurrencySelectorProps) {
  const { organization } = useOrganization()
  const { toast } = useToast()
  const updateCurrency = useUpdateOrgCurrency(organization.id)

  const currentCurrency = organization.default_currency || 'usd'
  const [selected, setSelected] = useState(currentCurrency)

  const isSandbox = process.env.NEXT_PUBLIC_NODE_ENV === 'sandbox'
  const isLocked = hasProducts && !isSandbox
  const hasChanged = selected !== currentCurrency

  const handleUpdate = async () => {
    try {
      await updateCurrency.mutateAsync(selected)
      toast({
        title: 'Currency updated',
        description: `Default currency set to ${selected.toUpperCase()}`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to update currency',
        variant: 'destructive',
      })
      setSelected(currentCurrency)
    }
  }

  if (isLocked) {
    const info = SUPPORTED_CURRENCIES.find((c) => c.code === currentCurrency)
    return (
      <div className="flex items-center gap-2 text-sm">
        <span>{info ? `${info.symbol} ${info.name} (${info.code.toUpperCase()})` : currentCurrency.toUpperCase()}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <LockIcon size={12} />
          Locked after first product
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_CURRENCIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.symbol} {c.name} ({c.code.toUpperCase()})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasChanged && (
        <Button
          size="sm"
          onClick={handleUpdate}
          disabled={updateCurrency.isPending}
        >
          {updateCurrency.isPending ? (
            <Loading03Icon size={14} className="animate-spin" />
          ) : (
            'Update'
          )}
        </Button>
      )}
    </div>
  )
}
