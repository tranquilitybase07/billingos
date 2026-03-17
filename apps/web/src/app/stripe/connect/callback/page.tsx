'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useExchangeOAuthCode } from '@/hooks/queries/migration'
import { Card } from '@/components/ui/card'
import { Loading03Icon, AlertCircleIcon, CheckmarkCircle01Icon } from 'hugeicons-react'

export default function StripeConnectCallbackPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const exchangeCode = useExchangeOAuthCode()
  const hasRun = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const code = searchParams.get('code')
  const state = searchParams.get('state') // organization_id
  const oauthError = searchParams.get('error')
  const oauthErrorDescription = searchParams.get('error_description')

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    if (oauthError) {
      setError(oauthErrorDescription || oauthError)
      return
    }

    if (!code || !state) {
      setError('Missing required parameters from Stripe')
      return
    }

    exchangeCode
      .mutateAsync({ code, organization_id: state })
      .then((migration) => {
        // Redirect to the account settings page with migration info
        // We need to get the org slug — redirect to a generic path that will resolve it
        router.replace(
          `/stripe/connect/success?migration_id=${migration.id}&organization_id=${state}`,
        )
      })
      .catch((err) => {
        setError(err.message || 'Failed to connect Stripe account')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <AlertCircleIcon size={48} className="mx-auto mb-4 text-destructive" />
          <h1 className="text-xl font-semibold">Connection failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-6 text-sm text-primary underline"
          >
            Go back
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <Loading03Icon size={48} className="mx-auto mb-4 animate-spin text-primary" />
        <h1 className="text-xl font-semibold">Connecting your Stripe account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please wait while we set up your account...
        </p>
      </Card>
    </div>
  )
}
