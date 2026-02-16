'use client'

import { useCallback, useEffect } from 'react'

interface ParentMessage {
  type: 'INIT_CHECKOUT' | 'UPDATE_CONFIG' | 'CLOSE_CHECKOUT'
  sessionId?: string
  config?: {
    theme?: 'light' | 'dark' | 'auto'
    locale?: string
    collectBillingAddress?: boolean
  }
  payload?: any
}

interface IframeMessage {
  type:
    | 'CHECKOUT_READY'
    | 'CHECKOUT_SUCCESS'
    | 'CHECKOUT_ERROR'
    | 'CHECKOUT_CLOSE'
    | 'HEIGHT_CHANGED'
    | 'PROCESSING'
    | '3DS_REQUIRED'
  payload?: any
}

interface UseParentMessagingReturn {
  sendMessage: (message: IframeMessage) => void
}

/**
 * Hook for communicating with the parent window
 */
export function useParentMessaging(): UseParentMessagingReturn {
  /**
   * Send message to parent window
   */
  const sendMessage = useCallback((message: IframeMessage) => {
    console.log('[useParentMessaging] 📤 Sending message to parent:', message.type, message)

    // Get allowed parent origins from environment
    const allowedOrigins = getAllowedOrigins()
    console.log('[useParentMessaging] Allowed origins:', allowedOrigins)

    // Send to all allowed origins (parent will validate)
    allowedOrigins.forEach(origin => {
      try {
        console.log(`[useParentMessaging] Posting message to parent at origin: ${origin}`)
        window.parent.postMessage(message, origin)
        console.log(`[useParentMessaging] ✅ Message sent to ${origin}`)
      } catch (error) {
        console.error(`[useParentMessaging] ❌ Failed to send message to ${origin}:`, error)
      }
    })

    // Also send to wildcard for development
    if (process.env.NODE_ENV === 'development') {
      console.log('[useParentMessaging] 🔧 Dev mode: Also sending with wildcard origin')
      window.parent.postMessage(message, '*')
    }
  }, [])

  /**
   * Handle incoming messages from parent
   */
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin
      if (!validateOrigin(event.origin)) {
        console.warn(`Ignoring message from unauthorized origin: ${event.origin}`)
        return
      }

      // Validate message structure
      if (!event.data || typeof event.data !== 'object' || !event.data.type) {
        return
      }

      const message = event.data as ParentMessage

      // Handle different message types
      switch (message.type) {
        case 'INIT_CHECKOUT':
          // Apply configuration
          if (message.config?.theme) {
            applyTheme(message.config.theme)
          }
          if (message.config?.locale) {
            // Handle locale change if needed
          }
          break

        case 'UPDATE_CONFIG':
          // Update configuration dynamically
          if (message.config) {
            if (message.config.theme) {
              applyTheme(message.config.theme)
            }
          }
          break

        case 'CLOSE_CHECKOUT':
          // Close the checkout
          sendMessage({ type: 'CHECKOUT_CLOSE' })
          break

        default:
          break
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [sendMessage])

  return {
    sendMessage
  }
}

/**
 * Get allowed parent origins
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = []

  // Add configured origins
  if (process.env.NEXT_PUBLIC_ALLOWED_ORIGINS) {
    origins.push(...process.env.NEXT_PUBLIC_ALLOWED_ORIGINS.split(','))
  }

  // Add default origins
  origins.push('http://localhost:3000')
  origins.push('http://localhost:3001')
  origins.push('http://127.0.0.1:3000')
  origins.push('http://127.0.0.1:3001')

  // Add production domains
  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.push(process.env.NEXT_PUBLIC_APP_URL)
  }

  return [...new Set(origins)] // Remove duplicates
}

/**
 * Validate message origin
 */
function validateOrigin(origin: string): boolean {
  const allowedOrigins = getAllowedOrigins()
  return allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development'
}

/**
 * Apply theme to the document
 */
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  if (theme === 'auto') {
    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    theme = prefersDark ? 'dark' : 'light'
  }

  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}