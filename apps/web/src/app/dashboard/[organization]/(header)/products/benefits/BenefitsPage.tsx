'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { CreateBenefitModalContent } from '@/components/Benefits/CreateBenefitModalContent'
import { Diamond as DiamondOutlined, Add } from '@mui/icons-material'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface BenefitsPageProps {
  organizationId: string
  organizationSlug: string
}

export default function BenefitsPage({
  organizationId,
  organizationSlug,
}: BenefitsPageProps) {
  // Modal state
  const {
    isShown: isCreateModalShown,
    show: showCreateModal,
    hide: hideCreateModal,
  } = useModal()

  // TODO: Replace with actual data fetching when backend is ready
  const [benefits, setBenefits] = useState<any[]>([])

  const handleCreateBenefit = () => {
    // TODO: Refresh benefits list
    hideCreateModal()
  }

  if (benefits.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center pt-32">
          <div className="flex flex-col items-center justify-center gap-y-8">
            <DiamondOutlined className="text-5xl text-muted-foreground/30" />
            <div className="flex flex-col items-center justify-center gap-y-2">
              <h3 className="text-xl">No Benefits</h3>
              <p className="text-muted-foreground">
                Create a benefit to get started
              </p>
            </div>
            <Button onClick={showCreateModal}>
              <Add className="mr-2 h-4 w-4" />
              Create Benefit
            </Button>
          </div>
        </div>

        <InlineModal
          isShown={isCreateModalShown}
          hide={hideCreateModal}
          modalContent={
            <CreateBenefitModalContent
              organizationId={organizationId}
              onBenefitCreated={handleCreateBenefit}
              hideModal={hideCreateModal}
            />
          }
        />
      </>
    )
  }

  return (
    <>
      <DashboardBody>
        <div className="flex flex-col gap-y-8">
          <div className="flex justify-end">
            <Button onClick={showCreateModal}>
              <Add className="mr-2 h-4 w-4" />
              Create Benefit
            </Button>
          </div>
          <div className="rounded-lg border bg-card">
            <div className="p-6">
              <div className="space-y-4">
                {benefits.map((benefit) => (
                  <div
                    key={benefit.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{benefit.description}</span>
                      <span className="text-sm text-muted-foreground">
                        {benefit.type}
                      </span>
                    </div>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardBody>

      <InlineModal
        isShown={isCreateModalShown}
        hide={hideCreateModal}
        modalContent={
          <CreateBenefitModalContent
            organizationId={organizationId}
            onBenefitCreated={handleCreateBenefit}
            hideModal={hideCreateModal}
          />
        }
      />
    </>
  )
}
