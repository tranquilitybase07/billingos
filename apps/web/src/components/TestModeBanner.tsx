'use client'

import { AlertCircleIcon } from 'hugeicons-react'
import { useEnvironment } from '@/providers/EnvironmentProvider'

export function TestModeBanner() {
  const { environment } = useEnvironment()

  if (environment !== 'sandbox') return null

  return (
    <div className="fixed top-0 left-0 right-0 z-60 w-full bg-orange-500 text-white text-center py-2 px-4 text-sm font-medium">
      <div className="flex items-center justify-center gap-2">
        <AlertCircleIcon size={16} className="shrink-0" />
        <span>Test Mode — no real payments will be processed</span>
      </div>
    </div>
  )
}
