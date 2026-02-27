import { Metadata } from 'next'
import { getOrganizationBySlug } from '@/lib/organization'
import AnalyticsPage from './AnalyticsPage'

export const metadata: Metadata = {
  title: 'Analytics',
}

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string }>
}) {
  const { organization: orgSlug } = await params
  const organization = await getOrganizationBySlug(orgSlug)

  if (!organization) {
    return <div>Organization not found</div>
  }

  return (
    <AnalyticsPage
      organizationId={organization.id}
      organizationSlug={orgSlug}
    />
  )
}
