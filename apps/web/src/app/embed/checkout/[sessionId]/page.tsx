import { Suspense } from 'react'
import { CheckoutContent } from './components/CheckoutContent'

export default function CheckoutEmbedPage({
  params
}: {
  params: { sessionId: string }
}) {
  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutContent sessionId={params.sessionId} />
      </Suspense>
    </div>
  )
}

function CheckoutSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
        <div className="space-y-3">
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
        </div>
        <div className="mt-6">
          <div className="h-12 bg-gray-300 rounded"></div>
        </div>
      </div>
    </div>
  )
}