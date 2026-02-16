'use client'

import { DiscountForm } from './DiscountForm'
import { useUpdateDiscount } from '@/hooks/queries/discounts'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { Discount } from '@/utils/discount'
import { useState } from 'react'

interface EditDiscountModalContentProps {
    organizationId: string
    discount: Discount
    onDiscountUpdated: () => void
    hideModal: () => void
}

export function EditDiscountModalContent({
    organizationId,
    discount,
    onDiscountUpdated,
    hideModal,
}: EditDiscountModalContentProps) {
    const { toast } = useToast()
    const updateDiscount = useUpdateDiscount(organizationId)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async (data: any) => {
        setIsSubmitting(true)
        try {
            await updateDiscount.mutateAsync({ id: discount.id, body: data })

            toast({
                title: 'Discount Updated',
                description: `Discount "${data.name}" was updated successfully`,
            })

            onDiscountUpdated()
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error?.response?.data?.message || error.message || 'Failed to update discount',
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
                <h2 className="text-xl font-semibold">Edit Discount</h2>
                <Button variant="ghost" size="icon" onClick={hideModal}>
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Form */}
            <DiscountForm
                organizationId={organizationId}
                initialData={{
                    name: discount.name,
                    code: discount.code || undefined,
                    type: discount.type,
                    basis_points: discount.basis_points || undefined,
                    amount: discount.amount || undefined,
                    currency: discount.currency || undefined,
                    duration: discount.duration || 'once',
                    duration_in_months: discount.duration_in_months || undefined,
                    max_redemptions: discount.max_redemptions || undefined,
                    starts_at: discount.starts_at || undefined,
                    ends_at: discount.ends_at || undefined,
                }}
                onSubmit={handleSubmit}
                onCancel={hideModal}
                isUpdate
                isSubmitting={isSubmitting}
            />
        </div>
    )
}
