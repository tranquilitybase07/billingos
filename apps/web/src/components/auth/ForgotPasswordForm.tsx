'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

const ERROR_MESSAGES: Record<string, string> = {
  otp_expired:
    'That reset link has expired or was already used. Request a new one below.',
  access_denied:
    'That reset link is no longer valid. Request a new one below.',
}

export function ForgotPasswordForm({ errorCode }: { errorCode?: string }) {
  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? 'Something went wrong with that link. Request a new one below.'
    : null

  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?returnTo=/reset-password`,
      })

      if (error) throw error

      setSent(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined
      toast({
        title: 'Something went wrong',
        description: message || 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">Check your email</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            We sent a password reset link to <span className="font-medium">{email}</span>
          </p>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          Didn&apos;t get it? Check your spam folder or{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            try again
          </button>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
        >
          {errorMessage}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          autoComplete="email"
          required
        />
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
        {isLoading ? (
          <>
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Sending...
          </>
        ) : (
          'Send reset link'
        )}
      </Button>
    </form>
  )
}
