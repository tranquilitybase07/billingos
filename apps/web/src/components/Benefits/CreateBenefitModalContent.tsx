'use client'

import { BenefitForm } from './BenefitForm'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { useState } from 'react'

interface CreateBenefitModalContentProps {
  organizationId: string
  onBenefitCreated: () => void
  hideModal: () => void
}

export function CreateBenefitModalContent({
  organizationId,
  onBenefitCreated,
  hideModal,
}: CreateBenefitModalContentProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true)
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Simulate benefit creation
      console.log('Creating benefit:', data)

      toast({
        title: 'Benefit Created',
        description: `Benefit "${data.description}" was created successfully`,
      })

      onBenefitCreated()
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create benefit',
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
        <div>
          <h2 className="text-xl font-semibold">Create Benefit</h2>
          <p className="text-sm text-muted-foreground">
            Benefits are perks that come with your products
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={hideModal}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Form */}
      <BenefitForm
        onSubmit={handleSubmit}
        onCancel={hideModal}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
