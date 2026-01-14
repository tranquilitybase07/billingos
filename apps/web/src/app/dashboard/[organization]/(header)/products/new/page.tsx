import { Metadata } from 'next'
import NewProductPage from './NewProductPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Create Product',
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string }>
}) {
  const { organization } = await params

  return <NewProductPage organizationSlug={organization} />
}
