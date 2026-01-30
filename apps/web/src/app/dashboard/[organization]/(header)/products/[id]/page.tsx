import { Metadata } from 'next'
import ProductDetailPage from './ProductDetailPage'

export const metadata: Metadata = {
  title: 'Product Details',
}

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string; id: string }>
}) {
  const { organization, id } = await params

  return <ProductDetailPage organizationSlug={organization} productId={id} />
}
