import { Metadata } from 'next'
import { getOrganizationBySlug } from '@/lib/organization'
import ChurnSection from './ChurnSection'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Churn',
  }
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
    <ChurnSection
      organizationId={organization.id}
      organizationSlug={orgSlug}
    />
  )
}
