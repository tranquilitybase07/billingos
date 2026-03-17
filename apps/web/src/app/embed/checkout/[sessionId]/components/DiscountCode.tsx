'use client'

import { useState } from 'react'

interface DiscountCodeProps {
  onApply?: (code: string) => Promise<{ success: boolean; discountLabel?: string; error?: string }>
  onRemove?: () => void
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export function DiscountCode({ onApply, onRemove }: DiscountCodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [appliedCode, setAppliedCode] = useState('')
  const [discountLabel, setDiscountLabel] = useState('')

  const handleApply = async () => {
    if (!code.trim()) return

    setStatus('loading')
    setErrorMessage('')

    if (onApply) {
      const result = await onApply(code.trim())
      if (result.success) {
        setAppliedCode(code.trim().toUpperCase())
        setDiscountLabel(result.discountLabel ?? '')
        setStatus('success')
      } else {
        setErrorMessage(result.error ?? 'Invalid or expired code')
        setStatus('error')
      }
    } else {
      setStatus('idle')
    }
  }

  const handleRemove = () => {
    onRemove?.()
    setCode('')
    setAppliedCode('')
    setDiscountLabel('')
    setStatus('idle')
    setExpanded(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleApply()
  }

  if (status === 'success') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 bg-white dark:bg-[#1c1c1e] border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 flex-1">{appliedCode}</span>
          {discountLabel && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{discountLabel}</span>
          )}
          <button
            onClick={handleRemove}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-1"
            aria-label="Remove discount code"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors underline underline-offset-2"
      >
        Have a promo code?
      </button>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            if (status === 'error') setStatus('idle')
          }}
          onKeyDown={handleKeyDown}
          disabled={status === 'loading'}
          placeholder="Enter code"
          className={[
            'flex-1 text-sm px-3 py-2 rounded-lg border bg-white dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'uppercase tracking-wide',
            status === 'error' ? 'border-red-400' : 'border-gray-200 dark:border-[#2e2e30]',
          ].join(' ')}
          autoFocus
        />
        <button
          onClick={handleApply}
          disabled={!code.trim() || status === 'loading'}
          className={[
            'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            code.trim() && status !== 'loading'
              ? 'bg-gray-200 dark:bg-[#242426] hover:bg-blue-500 dark:hover:bg-[var(--checkout-accent,#3b82f6)] hover:text-white dark:hover:text-white text-gray-700 dark:text-gray-200'
              : 'bg-gray-100 dark:bg-[#1c1c1e] text-gray-400 dark:text-gray-600 border border-gray-200 dark:border-[#2e2e30]',
          ].join(' ')}
        >
          {status === 'loading' ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            'Apply'
          )}
        </button>
      </div>
      {status === 'error' && (
        <p className="text-xs text-red-500 dark:text-red-400">{errorMessage}</p>
      )}
    </div>
  )
}
