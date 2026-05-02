import { Metadata } from 'next'
import { getOrganizationBySlug } from '@/lib/organization'
import CancellationsPage from './CancellationsPage'

export const metadata: Metadata = {
  title: 'Churn',
}

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string }>
}) {
  const { organization: orgSlug } = await params
  const organization = await getOrganizationBySlug(orgSlug)

  if (!organization) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Organization not found
      </div>
    )
  }

  return (
    <CancellationsPage
      organizationId={organization.id}
      organizationSlug={orgSlug}
    />
  )
}
