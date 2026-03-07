'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  type Environment,
  ENVIRONMENT_COOKIE,
  ENVIRONMENT_STORAGE_KEY,
  environmentConfig,
} from '@/lib/config/environment'

interface EnvironmentContextType {
  environment: Environment
  isSwitching: boolean
  switchEnvironment: (env: Environment) => Promise<void>
}

const EnvironmentContext = createContext<EnvironmentContextType>({
  environment: 'production',
  isSwitching: false,
  switchEnvironment: async () => {},
})

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<Environment>('production')
  const [isSwitching, setIsSwitching] = useState(false)

  // Read from localStorage on mount (client-side)
  useEffect(() => {
    const stored = localStorage.getItem(ENVIRONMENT_STORAGE_KEY)
    if (stored === 'sandbox') setEnvironment('sandbox')
  }, [])

  const switchEnvironment = useCallback(
    async (env: Environment) => {
      if (env === environment || isSwitching) return
      setIsSwitching(true)

      try {
        if (env === 'sandbox') {
          // Get current session token (always from production Supabase)
          const supabase = createClient()
          const {
            data: { session },
          } = await supabase.auth.getSession()

          if (!session) throw new Error('No active session')

          // Sync user to sandbox via production API
          const prodApiUrl = environmentConfig.production.apiUrl
          const response = await fetch(`${prodApiUrl}/sandbox/sync-user`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ userId: session.user.id }),
          })

          if (!response.ok) {
            const err = await response.json().catch(() => ({}))
            throw new Error(err.message || 'Failed to sync user to sandbox')
          }
        }

        localStorage.setItem(ENVIRONMENT_STORAGE_KEY, env)
        // Also set a cookie so server-side API calls can read the environment
        document.cookie = `${ENVIRONMENT_COOKIE}=${env}; path=/; max-age=31536000; SameSite=Lax`
        setEnvironment(env)
        // Reload so all queries/clients reinitialise with the new env
        window.location.reload()
      } catch (error) {
        setIsSwitching(false)
        throw error
      }
    },
    [environment, isSwitching],
  )

  return (
    <EnvironmentContext.Provider
      value={{ environment, isSwitching, switchEnvironment }}
    >
      {children}
    </EnvironmentContext.Provider>
  )
}

export function useEnvironment() {
  return useContext(EnvironmentContext)
}
