import { Metadata } from 'next'
import CheckoutLinksPage from './CheckoutLinksPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Checkout Links',
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string }>
}) {
  const { organization } = await params

  // TODO: Fetch organization from API to get ID
  return (
    <CheckoutLinksPage
      organizationId="temp-org-id"
      organizationSlug={organization}
    />
  )
}
