'use client'

import { useState } from 'react'
import { useOrganization } from '@/providers/OrganizationProvider'
import {
  usePaymentStatus,
  useSubmitBusinessDetails,
} from '@/hooks/queries/organization'
import {
  useAccountByOrganization,
  useCreateAccount,
} from '@/hooks/queries/account'
import {
  useStripeOAuthUrl,
  useLatestMigration,
  useStartMigration,
} from '@/hooks/queries/migration'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { MigrationProgress } from '@/components/Migration/MigrationProgress'
import {
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  ArrowUpRight01Icon,
  Loading03Icon,
  Download01Icon,
} from 'hugeicons-react'
import { useToast } from '@/hooks/use-toast'

export default function FinanceAccountPage() {
  const { organization } = useOrganization()
  const { toast } = useToast()
  const [businessDetails, setBusinessDetails] = useState({
    business_name: organization.name,
    country: 'US',
    about: '',
    product_description: '',
    intended_use: '',
  })
  const [setupMode, setSetupMode] = useState<'new' | 'existing' | null>(null)

  const { data: paymentStatus, isLoading: isLoadingStatus } = usePaymentStatus(organization.id)
  const { data: account, isLoading: isLoadingAccount } = useAccountByOrganization(organization.id)
  const { data: latestMigration } = useLatestMigration(organization.id)
  const { data: oauthUrlData } = useStripeOAuthUrl(
    setupMode === 'existing' ? organization.id : null,
  )
  const submitBusinessDetails = useSubmitBusinessDetails(organization.id)
  const createAccount = useCreateAccount()
  const startMigration = useStartMigration()

  const isPaymentReady = paymentStatus?.payment_ready ?? false
  const hasBusinessDetails = paymentStatus?.is_details_submitted ?? false
  const hasAccount = !!account
  const isAccountFullyOnboarded = account?.is_charges_enabled && account?.is_payouts_enabled
  const isStandardAccount = (account as any)?.connect_type === 'standard'

  const handleSubmitBusinessDetails = async () => {
    try {
      await submitBusinessDetails.mutateAsync(businessDetails)
      toast({
        title: 'Success',
        description: 'Business details submitted successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to submit business details',
        variant: 'destructive',
      })
    }
  }

  const handleCreateStripeAccount = async () => {
    try {
      const newAccount = await createAccount.mutateAsync({
        organization_id: organization.id,
        email: organization.email || '',
        country: businessDetails.country,
      })

      const { api } = await import('@/lib/api/client')
      const { url } = await api.post<{ url: string }>(
        `/accounts/${newAccount.id}/onboarding-link`,
        {},
      )

      window.location.href = url
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create Stripe account',
        variant: 'destructive',
      })
    }
  }

  const handleContinueOnboarding = async () => {
    if (!account) return

    try {
      const { api } = await import('@/lib/api/client')
      const { url } = await api.post<{ url: string }>(
        `/accounts/${account.id}/onboarding-link`,
        {},
      )

      window.location.href = url
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get onboarding link',
        variant: 'destructive',
      })
    }
  }

  const handleConnectExisting = () => {
    if (oauthUrlData?.url) {
      window.location.href = oauthUrlData.url
    }
  }

  const handleStartImport = (includeArchived = false) => {
    startMigration.mutate(
      { organization_id: organization.id, include_archived: includeArchived },
      {
        onError: (error) => {
          toast({
            title: 'Error',
            description: error instanceof Error ? error.message : 'Failed to start import',
            variant: 'destructive',
          })
        },
      },
    )
  }

  if (isLoadingStatus || isLoadingAccount) {
    return (
      <DashboardBody>
        <div className="flex items-center justify-center py-12">
          <Loading03Icon size={32} className="animate-spin text-muted-foreground" />
        </div>
      </DashboardBody>
    )
  }

  return (
    <DashboardBody className="gap-6">
      {/* Status banner */}
      {isPaymentReady ? (
        <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
          <CheckmarkCircle01Icon size={16} className="text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-900 dark:text-green-100">
            Payment account active
          </AlertTitle>
          <AlertDescription className="text-green-800 dark:text-green-200">
            Your Stripe Connect account is fully set up and ready to accept payments.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertCircleIcon size={16} />
          <AlertTitle>Setup required</AlertTitle>
          <AlertDescription>
            Complete the steps below to start accepting payments through Stripe Connect.
          </AlertDescription>
        </Alert>
      )}

      {/* Step 1: Business Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Step 1: Business Details
                {hasBusinessDetails && (
                  <CheckmarkCircle01Icon size={20} className="text-green-600" />
                )}
              </CardTitle>
              <CardDescription>
                Provide your business information for verification
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business_name">Business Name</Label>
            <Input
              id="business_name"
              value={businessDetails.business_name}
              onChange={(e) =>
                setBusinessDetails({ ...businessDetails, business_name: e.target.value })
              }
              disabled={hasBusinessDetails}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={businessDetails.country}
              onChange={(e) =>
                setBusinessDetails({ ...businessDetails, country: e.target.value })
              }
              disabled={hasBusinessDetails}
            />
          </div>
          {!hasBusinessDetails && (
            <Button
              onClick={handleSubmitBusinessDetails}
              disabled={submitBusinessDetails.isPending}
            >
              {submitBusinessDetails.isPending ? (
                <>
                  <Loading03Icon size={16} className="mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Business Details'
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Stripe Connect Account */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Step 2: Stripe Connect Account
                {hasAccount && (
                  <CheckmarkCircle01Icon size={20} className="text-green-600" />
                )}
              </CardTitle>
              <CardDescription>
                Create a new Stripe account or connect your existing one
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasAccount ? (
            <>
              {/* Setup mode selector */}
              {!setupMode && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setSetupMode('new')}
                    disabled={!hasBusinessDetails}
                    className="group rounded-lg border-2 border-muted p-4 text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="mb-2 text-2xl">🆕</div>
                    <div className="font-medium text-sm">Set up new Stripe account</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Create a fresh account managed by BillingOS
                    </div>
                  </button>
                  <button
                    onClick={() => setSetupMode('existing')}
                    disabled={!hasBusinessDetails}
                    className="group rounded-lg border-2 border-muted p-4 text-left transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="mb-2 text-2xl">📥</div>
                    <div className="font-medium text-sm">Connect existing Stripe account</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Import your products, customers & subscriptions
                    </div>
                  </button>
                </div>
              )}

              {!hasBusinessDetails && !setupMode && (
                <p className="text-xs text-muted-foreground">
                  Please submit business details first
                </p>
              )}

              {/* New account flow */}
              {setupMode === 'new' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You&apos;ll be redirected to Stripe to complete your account setup.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSetupMode(null)}>
                      Back
                    </Button>
                    <Button
                      onClick={handleCreateStripeAccount}
                      disabled={createAccount.isPending}
                    >
                      {createAccount.isPending ? (
                        <>
                          <Loading03Icon size={16} className="mr-2 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        <>
                          Create Stripe Account
                          <ArrowUpRight01Icon size={16} className="ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Existing account flow */}
              {setupMode === 'existing' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You&apos;ll be redirected to Stripe to authorize BillingOS to access your account.
                    Your existing products, customers, and subscriptions will be imported.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSetupMode(null)}>
                      Back
                    </Button>
                    <Button
                      onClick={handleConnectExisting}
                      disabled={!oauthUrlData?.url}
                    >
                      {!oauthUrlData?.url ? (
                        <>
                          <Loading03Icon size={16} className="mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          Connect Stripe Account
                          <ArrowUpRight01Icon size={16} className="ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Account ID</span>
                  <span className="font-mono">{account.stripe_id}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="capitalize">
                    {isStandardAccount ? 'Standard (OAuth)' : 'Express'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span>
                    {isAccountFullyOnboarded ? (
                      <span className="text-green-600">Active</span>
                    ) : account.is_details_submitted ? (
                      <span className="text-yellow-600">Pending Verification</span>
                    ) : (
                      <span className="text-gray-600">Pending</span>
                    )}
                  </span>
                </div>
                {isAccountFullyOnboarded && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Capabilities</span>
                    <span className="text-xs text-green-600">
                      ✓ Charges & Payouts Enabled
                    </span>
                  </div>
                )}
              </div>
              {!isAccountFullyOnboarded && !isStandardAccount && (
                <Button onClick={handleContinueOnboarding}>
                  Continue Onboarding
                  <ArrowUpRight01Icon size={16} className="ml-2" />
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Import from Stripe (only for Standard accounts) */}
      {hasAccount && isStandardAccount && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Step 3: Import Stripe Data
              {latestMigration?.status === 'completed' && (
                <CheckmarkCircle01Icon size={20} className="text-green-600" />
              )}
            </CardTitle>
            <CardDescription>
              Import your existing products, customers, and subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestMigration && latestMigration.status !== 'pending' ? (
              <div className="space-y-4">
                <MigrationProgress migration={latestMigration} />
                {(latestMigration.status === 'failed' ||
                  latestMigration.status === 'partial') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStartImport(latestMigration.include_archived)}
                    disabled={startMigration.isPending}
                  >
                    Retry import
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Import your existing Stripe data into BillingOS. Active products,
                  customers, and subscriptions will be imported.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleStartImport(false)}
                    disabled={startMigration.isPending}
                  >
                    {startMigration.isPending ? (
                      <>
                        <Loading03Icon size={16} className="mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Download01Icon size={16} className="mr-2" />
                        Import Active Data
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleStartImport(true)}
                    disabled={startMigration.isPending}
                  >
                    Import All (incl. archived)
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </DashboardBody>
  )
}
