import { Suspense } from 'react'
import { PortalContent } from './components/PortalContent'
import { Loader2 } from 'lucide-react'

export default async function PortalEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ portalSessionId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { portalSessionId } = await params
  const { tab } = await searchParams

  return (
    <Suspense fallback={<PortalSkeleton />}>
      <PortalContent sessionId={portalSessionId} defaultTab={tab} />
    </Suspense>
  )
}

function PortalSkeleton() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        <div className="mt-6">
          <div className="flex gap-2 mb-4">
            <div className="h-10 bg-gray-200 rounded w-24"></div>
            <div className="h-10 bg-gray-200 rounded w-24"></div>
            <div className="h-10 bg-gray-200 rounded w-24"></div>
            <div className="h-10 bg-gray-200 rounded w-24"></div>
          </div>
          <div className="space-y-3">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
