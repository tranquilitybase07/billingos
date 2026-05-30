export type Environment = 'production' | 'sandbox'

export const ENVIRONMENT_COOKIE = 'billingos-environment'
export const ENVIRONMENT_STORAGE_KEY = 'billingos-environment'

// Per-env last-visited-org cookies set by middleware.ts. Listed here so
// clearEnvironmentState() can wipe them — they leak across users otherwise.
const LAST_ORG_COOKIES = [
  'billingos_last_org_production',
  'billingos_last_org_sandbox',
]

/**
 * Clears all client-side env-related state. Call on sign-out or when the
 * signed-in user changes — otherwise the prior user's env preference and
 * last-visited org slugs leak into the new session.
 */
export function clearEnvironmentState(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ENVIRONMENT_STORAGE_KEY)
  const expire = (name: string) => {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
  }
  expire(ENVIRONMENT_COOKIE)
  LAST_ORG_COOKIES.forEach(expire)
}

export const environmentConfig = {
  production: {
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  sandbox: {
    apiUrl: process.env.NEXT_PUBLIC_SANDBOX_API_URL || 'http://localhost:3002',
    supabaseUrl:
      process.env.NEXT_PUBLIC_SANDBOX_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      '',
    supabaseAnonKey:
      process.env.NEXT_PUBLIC_SANDBOX_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  },
} as const

/**
 * Get the current environment from localStorage (client-side only).
 * Falls back to 'production' on server or if not set.
 */
export function getEnvironment(): Environment {
  if (typeof window === 'undefined') return 'production'
  const stored = localStorage.getItem(ENVIRONMENT_STORAGE_KEY)
  return stored === 'sandbox' ? 'sandbox' : 'production'
}

/**
 * Get the API URL for the current environment (client-side).
 */
export function getApiUrl(): string {
  return environmentConfig[getEnvironment()].apiUrl
}
