'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { CheckoutLinkForm } from '@/components/CheckoutLinks/CheckoutLinkForm'
import { Link as LinkOutlined, Add } from '@mui/icons-material'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface CheckoutLinksPageProps {
  organizationId: string
  organizationSlug: string
}

export default function CheckoutLinksPage({
  organizationId,
  organizationSlug,
}: CheckoutLinksPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = searchParams.get('productId')

  // Modal state
  const {
    isShown: isCreateModalShown,
    show: showCreateModal,
    hide: hideCreateModal,
  } = useModal()

  // TODO: Replace with actual data fetching when backend is ready
  const [checkoutLinks, setCheckoutLinks] = useState<any[]>([])

  const handleCreateCheckoutLink = (checkoutLink?: any) => {
    if (checkoutLink) {
      setCheckoutLinks([checkoutLink, ...checkoutLinks])
    }
    hideCreateModal()
  }

  if (checkoutLinks.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center pt-32">
          <div className="flex flex-col items-center justify-center gap-y-8">
            <LinkOutlined className="text-5xl text-muted-foreground/30" />
            <div className="flex flex-col items-center justify-center gap-y-2">
              <h3 className="text-xl">No Checkout Links</h3>
              <p className="text-muted-foreground">
                Create a new checkout link to share with your customers
              </p>
            </div>
            <Button onClick={showCreateModal}>
              <Add className="mr-2 h-4 w-4" />
              Create Checkout Link
            </Button>
          </div>
        </div>

        <InlineModal
          isShown={isCreateModalShown}
          hide={hideCreateModal}
          modalContent={
            <CheckoutLinkForm
              organizationId={organizationId}
              organizationSlug={organizationSlug}
              onClose={handleCreateCheckoutLink}
              productIds={productId ? [productId] : []}
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
              Create Checkout Link
            </Button>
          </div>
          <div className="rounded-lg border bg-card">
            <div className="p-6">
              <div className="space-y-4">
                {checkoutLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {link.label || 'Untitled Checkout Link'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Created {new Date(link.created_at).toLocaleDateString()}
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
          <CheckoutLinkForm
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            onClose={handleCreateCheckoutLink}
            productIds={productId ? [productId] : []}
          />
        }
      />
    </>
  )
}
