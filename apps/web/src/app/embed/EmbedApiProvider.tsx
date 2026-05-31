'use client'

import { createContext, useContext } from 'react'

/**
 * Holds the API base URL for an embed (checkout/portal) iframe, resolved from
 * the session's environment (the `env` query param the SDK appends to the
 * iframe URL). Embed components must use {@link useEmbedApiUrl} instead of
 * getApiUrl()/NEXT_PUBLIC_API_URL — those default to production and don't know
 * which environment the session belongs to inside a customer-facing iframe.
 */
const EmbedApiUrlContext = createContext<string>('')

export function EmbedApiProvider({
  apiBaseUrl,
  children,
}: {
  apiBaseUrl: string
  children: React.ReactNode
}) {
  return (
    <EmbedApiUrlContext.Provider value={apiBaseUrl}>
      {children}
    </EmbedApiUrlContext.Provider>
  )
}

export function useEmbedApiUrl(): string {
  return useContext(EmbedApiUrlContext)
}
