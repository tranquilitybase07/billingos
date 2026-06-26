import { redirect } from 'next/navigation'

export default async function Page({
  params,
}: {
  params: Promise<{ organization: string }>
}) {
  const { organization: orgSlug } = await params
  redirect(`/dashboard/${orgSlug}/churn`)
}
