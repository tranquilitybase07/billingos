'use client'

import { AlertCircle } from 'lucide-react'
import { useEnvironment } from '@/providers/EnvironmentProvider'

export function TestModeBanner() {
  const { environment } = useEnvironment()

  if (environment !== 'sandbox') return null

  return (
    <div className="w-full bg-orange-500 text-white text-center py-2 px-4 text-sm font-medium">
      <div className="flex items-center justify-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Test Mode — no real payments will be processed</span>
      </div>
    </div>
  )
}
