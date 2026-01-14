'use client'

import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import { useDiscounts } from '@/hooks/queries/discounts'
import { getDiscountDisplay } from '@/utils/discount'
import { useMemo } from 'react'

interface DiscountSelectorProps {
  organizationId: string
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DiscountSelector({
  organizationId,
  value,
  onValueChange,
  placeholder = 'Select discount',
  className,
}: DiscountSelectorProps) {
  const { data: discountsData, isLoading } = useDiscounts(organizationId, {})

  const discountOptions: ComboboxOption[] = useMemo(() => {
    if (!discountsData?.items) return []

    return discountsData.items.map((discount) => ({
      value: discount.id,
      label: discount.name,
      description: `${discount.code || 'No code'} - ${getDiscountDisplay(discount)}`,
    }))
  }, [discountsData])

  return (
    <Combobox
      options={discountOptions}
      value={value}
      onValueChange={onValueChange}
      placeholder={isLoading ? 'Loading discounts...' : placeholder}
      searchPlaceholder="Search discounts..."
      emptyText="No discounts found."
      className={className}
      disabled={isLoading}
    />
  )
}
