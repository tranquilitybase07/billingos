'use client'

import { useEffect } from 'react'

export default function CheckoutSuccessPage() {
  useEffect(() => {
    try {
      window.parent.postMessage({ type: 'CHECKOUT_SUCCESS', payload: {} }, '*')
    } catch {
      // best-effort — page works fine if there's no parent
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#141415]">
      <div className="text-center p-8">
        <svg
          className="w-12 h-12 mx-auto text-green-500 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Payment successful
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You can close this window.
        </p>
      </div>
    </div>
  )
}
