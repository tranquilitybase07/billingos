import { Metadata } from 'next'
import EditProductPage from './EditProductPage'

export const metadata: Metadata = {
  title: 'Edit Product',
}

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string; id: string }>
}) {
  const { organization, id } = await params

  return <EditProductPage organizationSlug={organization} productId={id} />
}
