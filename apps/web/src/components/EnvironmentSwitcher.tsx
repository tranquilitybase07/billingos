'use client'

import { useState } from 'react'
import { AlertCircleIcon, Loading03Icon, TestTube01Icon } from 'hugeicons-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEnvironment } from '@/providers/EnvironmentProvider'
import { toast } from 'sonner'

export function EnvironmentSwitcher() {
  const { environment, isSwitching, switchEnvironment } = useEnvironment()
  const [isLoading, setIsLoading] = useState(false)

  const handleSwitch = async (value: string) => {
    const newEnv = value as 'production' | 'sandbox'
    if (newEnv === environment) return

    setIsLoading(true)
    try {
      if (newEnv === 'sandbox') {
        toast.info('Setting up sandbox environment…')
      }
      await switchEnvironment(newEnv)
    } catch (err: any) {
      toast.error(err.message || 'Failed to switch environment')
      setIsLoading(false)
    }
  }

  const busy = isLoading || isSwitching

  return (
    <div className="flex items-center gap-2">
      {environment === 'sandbox' && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded text-xs font-semibold border border-orange-500/20">
          <AlertCircleIcon size={12} />
          TEST
        </div>
      )}

      <Select
        value={environment}
        onValueChange={handleSwitch}
        disabled={busy}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          {busy ? (
            <div className="flex items-center gap-1.5">
              <Loading03Icon size={12} className="animate-spin" />
              <span>Switching…</span>
            </div>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="production">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Production
            </div>
          </SelectItem>
          <SelectItem value="sandbox">
            <div className="flex items-center gap-2">
              <TestTube01Icon size={12} className="text-orange-500" />
              Sandbox
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
