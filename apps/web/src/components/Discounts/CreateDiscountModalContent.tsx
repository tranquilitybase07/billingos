'use client'

import { DiscountForm } from './DiscountForm'
import { useCreateDiscount } from '@/hooks/queries/discounts'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { useState } from 'react'

interface CreateDiscountModalContentProps {
  organizationId: string
  onDiscountCreated: () => void
  hideModal: () => void
}

export function CreateDiscountModalContent({
  organizationId,
  onDiscountCreated,
  hideModal,
}: CreateDiscountModalContentProps) {
  const { toast } = useToast()
  const createDiscount = useCreateDiscount(organizationId)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true)
    try {
      await createDiscount.mutateAsync(data)

      toast({
        title: 'Discount Created',
        description: `Discount "${data.name}" was created successfully`,
      })

      onDiscountCreated()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.message || error.message || 'Failed to create discount',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }


  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-8 py-6">
        <h2 className="text-xl font-semibold">Create Discount</h2>
        <Button variant="ghost" size="icon" onClick={hideModal}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Form */}
      <DiscountForm
        organizationId={organizationId}
        onSubmit={handleSubmit}
        onCancel={hideModal}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
