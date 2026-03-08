export type Environment = 'production' | 'sandbox'

export const ENVIRONMENT_COOKIE = 'billingos-environment'
export const ENVIRONMENT_STORAGE_KEY = 'billingos-environment'

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
  const env = stored === 'sandbox' ? 'sandbox' : 'production'
  console.log('[ENV] localStorage value:', stored, '→ resolved env:', env)
  return env
}

/**
 * Get the API URL for the current environment (client-side).
 */
export function getApiUrl(): string {
  console.log('[ENV] environmentConfig:', {
    production: environmentConfig.production.apiUrl,
    sandbox: environmentConfig.sandbox.apiUrl,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SANDBOX_API_URL: process.env.NEXT_PUBLIC_SANDBOX_API_URL,
  })
  const env = getEnvironment()
  const url = environmentConfig[env].apiUrl
  console.log('[ENV] getApiUrl() →', url)
  return url
}
