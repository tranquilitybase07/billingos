'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useOrganization } from '@/providers/OrganizationProvider'
import {
  usePaymentStatus,
  useSubmitBusinessDetails,
} from '@/hooks/queries/organization'
import {
  accountKeys,
  useAccountByOrganization,
  useCreateAccount,
  useDisconnectAccount,
  useGetOAuthUrl,
} from '@/hooks/queries/account'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STRIPE_SUPPORTED_COUNTRIES } from '@/lib/constants/currencies'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  CheckmarkCircle01Icon,
  Loading03Icon,
  ArrowUpRight01Icon,
  CreditCardIcon,
  ConnectIcon,
} from 'hugeicons-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { SettingsTabNav } from '../_components/SettingsTabNav'
import { InfoRow } from './_components/InfoRow'
import { CurrencySelector } from './_components/CurrencySelector'
import { DisconnectAccountDialog } from './_components/DisconnectAccountDialog'

type ConnectMode = 'managed' | 'oauth'

export default function BillingPage() {
  const { organization } = useOrganization()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const oauthHandledRef = useRef(false)
  const [businessDetails, setBusinessDetails] = useState({
    business_name: organization.name,
    country: (organization.details as Record<string, string>)?.country || 'US',
    about: '',
    product_description: '',
    intended_use: '',
  })
  const [connectMode, setConnectMode] = useState<ConnectMode>('managed')

  const { data: paymentStatus, isLoading: isLoadingStatus } = usePaymentStatus(organization.id)
  const { data: account, isLoading: isLoadingAccount } = useAccountByOrganization(organization.id)
  const submitBusinessDetails = useSubmitBusinessDetails(organization.id)
  const createAccount = useCreateAccount()
  const getOAuthUrl = useGetOAuthUrl()
  const disconnectAccount = useDisconnectAccount(organization.id)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const handleDisconnect = async () => {
    if (!account) return
    try {
      await disconnectAccount.mutateAsync(account.id)
      setDisconnectOpen(false)
      toast({
        title: 'Disconnected',
        description: 'You can connect another Stripe account now.',
      })
    } catch (err) {
      toast({
        title: 'Disconnect failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      })
    }
  }

  // Simple products count check for currency lock
  const { data: productCount } = useQuery({
    queryKey: ['products-count', organization.id],
    queryFn: async () => {
      const { api: apiClient } = await import('@/lib/api/client')
      const products = await apiClient.get<{ id: string }[]>(
        `/products?organization_id=${organization.id}&limit=1`,
      )
      return products.length
    },
    enabled: !!organization.id,
  })

  const hasBusinessDetails = paymentStatus?.is_details_submitted ?? false
  const hasAccount = !!account
  const isAccountActive = account?.is_charges_enabled && account?.is_payouts_enabled
  const isStandardConnection = account?.stripe_connection_type === 'standard'

  // Handle OAuth callback flash (?oauth=success|error&message=...).
  // Guarded by a ref + URL strip so the effect can't re-enter and loop.
  useEffect(() => {
    if (oauthHandledRef.current) return
    const status = searchParams.get('oauth')
    if (status !== 'success' && status !== 'error') return
    oauthHandledRef.current = true

    if (status === 'success') {
      toast({
        title: 'Stripe account connected',
        description: 'Your existing Stripe account is now linked.',
      })
      queryClient.invalidateQueries({
        queryKey: accountKeys.byOrganization(organization.id),
      })
    } else {
      const message = searchParams.get('message') || 'Please try again.'
      toast({
        title: 'Connection failed',
        description: decodeURIComponent(message),
        variant: 'destructive',
      })
    }

    // Remove ?oauth=... from the URL so reloads / re-renders don't re-trigger.
    router.replace(pathname, { scroll: false })
  }, [searchParams, toast, queryClient, organization.id, router, pathname])

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

  const handleCreateAccount = async () => {
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
        description: error instanceof Error ? error.message : 'Failed to create account',
        variant: 'destructive',
      })
    }
  }

  const handleConnectExistingStripe = async () => {
    try {
      const { url } = await getOAuthUrl.mutateAsync({
        organization_id: organization.id,
      })
      window.location.href = url
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to start Stripe connection',
        variant: 'destructive',
      })
    }
  }

  const handleContinueSetup = async () => {
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
        description: error instanceof Error ? error.message : 'Failed to get setup link',
        variant: 'destructive',
      })
    }
  }

  const isLoading = isLoadingStatus || isLoadingAccount

  if (isLoading) {
    return (
      <DashboardBody className="gap-6">
        <SettingsTabNav activeTab="billing" />
        <div className="flex items-center justify-center py-12">
          <Loading03Icon size={32} className="animate-spin text-muted-foreground" />
        </div>
      </DashboardBody>
    )
  }

  // State A: Account Active
  if (hasAccount && isAccountActive) {
    return (
      <DashboardBody className="gap-6">
        <SettingsTabNav activeTab="billing" />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>Payment Account</CardTitle>
                <Badge
                  variant="outline"
                  className="border-muted-foreground/30 text-muted-foreground text-[10px] font-medium uppercase tracking-wide"
                >
                  {isStandardConnection ? 'Connected via OAuth' : 'Managed by BillingOS'}
                </Badge>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30">
                <CheckmarkCircle01Icon size={14} className="mr-1" />
                Active
              </Badge>
            </div>
            <CardDescription>
              {isStandardConnection
                ? 'Your Stripe account is connected. Manage it at dashboard.stripe.com.'
                : 'Your payment account is set up and ready to accept payments.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y">
              <InfoRow label="Charges Enabled" value={<span className="text-green-600 dark:text-green-400">Enabled</span>} />
              <InfoRow label="Payouts Enabled" value={<span className="text-green-600 dark:text-green-400">Enabled</span>} />
              {account.country && <InfoRow label="Country" value={account.country.toUpperCase()} />}
              {account.currency && <InfoRow label="Payout Currency" value={account.currency.toUpperCase()} />}
              <InfoRow
                label="Charge Currency"
                value={<CurrencySelector hasProducts={(productCount ?? 0) > 0} />}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDisconnectOpen(true)}
              >
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>

        <DisconnectAccountDialog
          open={disconnectOpen}
          onOpenChange={setDisconnectOpen}
          onConfirm={handleDisconnect}
          isPending={disconnectAccount.isPending}
          connectionType={isStandardConnection ? 'standard' : 'express'}
        />

        {organization.details && (
          <Card>
            <CardHeader>
              <CardTitle>Business Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {organization.details.business_name && (
                  <InfoRow label="Business Name" value={organization.details.business_name} />
                )}
                {organization.details.country && (
                  <InfoRow label="Country" value={organization.details.country} />
                )}
                {organization.details_submitted_at && (
                  <InfoRow
                    label="Submitted"
                    value={new Date(organization.details_submitted_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </DashboardBody>
    )
  }

  // State B: Account Pending (exists but not fully onboarded)
  if (hasAccount && !isAccountActive) {
    return (
      <DashboardBody className="gap-6">
        <SettingsTabNav activeTab="billing" />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Payment Account</CardTitle>
              <Badge variant="outline" className="text-yellow-600 border-yellow-300 dark:text-yellow-400 dark:border-yellow-600">
                Pending
              </Badge>
            </div>
            <CardDescription>
              Your payment account setup is incomplete. Continue to finish verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y">
              <InfoRow
                label="Charges"
                value={account.is_charges_enabled
                  ? <span className="text-green-600 dark:text-green-400">Enabled</span>
                  : <span className="text-yellow-600 dark:text-yellow-400">Pending</span>
                }
              />
              <InfoRow
                label="Payouts"
                value={account.is_payouts_enabled
                  ? <span className="text-green-600 dark:text-green-400">Enabled</span>
                  : <span className="text-yellow-600 dark:text-yellow-400">Pending</span>
                }
              />
              {account.country && <InfoRow label="Country" value={account.country.toUpperCase()} />}
            </div>

            {isStandardConnection ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Finish verification in your Stripe dashboard. Status will sync automatically.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
                      Complete in Stripe
                      <ArrowUpRight01Icon size={16} className="ml-2" />
                    </a>
                  </Button>
                  <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleContinueSetup}>
                  Continue Setup
                  <ArrowUpRight01Icon size={16} className="ml-2" />
                </Button>
                <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
                  Disconnect
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <DisconnectAccountDialog
          open={disconnectOpen}
          onOpenChange={setDisconnectOpen}
          onConfirm={handleDisconnect}
          isPending={disconnectAccount.isPending}
          connectionType={isStandardConnection ? 'standard' : 'express'}
        />
      </DashboardBody>
    )
  }

  // State C: No Account — choose a connection mode
  return (
    <DashboardBody className="gap-6">
      <SettingsTabNav activeTab="billing" />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CreditCardIcon size={20} className="text-primary" />
            </div>
            <div>
              <CardTitle>Set Up Payment Account</CardTitle>
              <CardDescription>
                Choose how you'd like to accept payments. You can always change this later by starting fresh.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode selector */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setConnectMode('managed')}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-4 text-left transition-all',
                connectMode === 'managed'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30',
              )}
            >
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-1.5">
                  <CreditCardIcon size={16} className="text-primary" />
                </div>
                <p className="text-sm font-semibold">BillingOS Managed</p>
              </div>
              <p className="text-xs text-muted-foreground">
                We'll create a new Stripe account for you. Best if you're new to Stripe.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setConnectMode('oauth')}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-4 text-left transition-all',
                connectMode === 'oauth'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30',
              )}
            >
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-1.5">
                  <ConnectIcon size={16} className="text-primary" />
                </div>
                <p className="text-sm font-semibold">Connect Your Stripe Account</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Link an existing Stripe account. Keep your dashboard, customers, and payment history.
              </p>
            </button>
          </div>

          <Separator />

          {connectMode === 'managed' ? (
            <>
              {/* Step 1: Business Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${hasBusinessDetails
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-primary/10 text-primary'
                    }`}>
                    {hasBusinessDetails ? <CheckmarkCircle01Icon size={14} /> : '1'}
                  </div>
                  <h3 className="text-sm font-medium">Business Details</h3>
                </div>

                {!hasBusinessDetails ? (
                  <div className="ml-8 space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="business_name">Business Name</Label>
                        <Input
                          id="business_name"
                          value={businessDetails.business_name}
                          onChange={(e) =>
                            setBusinessDetails({ ...businessDetails, business_name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Select
                          value={businessDetails.country}
                          onValueChange={(value) =>
                            setBusinessDetails({ ...businessDetails, country: value })
                          }
                        >
                          <SelectTrigger id="country">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent>
                            {STRIPE_SUPPORTED_COUNTRIES.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      onClick={handleSubmitBusinessDetails}
                      disabled={submitBusinessDetails.isPending}
                      size="sm"
                    >
                      {submitBusinessDetails.isPending ? (
                        <>
                          <Loading03Icon size={14} className="mr-1.5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit Details'
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="ml-8 text-sm text-muted-foreground">
                    Business details submitted.
                  </p>
                )}
              </div>

              <Separator />

              {/* Step 2: Create Account */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    2
                  </div>
                  <h3 className="text-sm font-medium">Create Payment Account</h3>
                </div>

                <div className="ml-8 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You'll be redirected to complete your payment account setup and connect your bank account.
                  </p>
                  <Button
                    onClick={handleCreateAccount}
                    disabled={!hasBusinessDetails || createAccount.isPending}
                  >
                    {createAccount.isPending ? (
                      <>
                        <Loading03Icon size={16} className="mr-2 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      <>
                        Create Account
                        <ArrowUpRight01Icon size={16} className="ml-2" />
                      </>
                    )}
                  </Button>
                  {!hasBusinessDetails && (
                    <p className="text-xs text-muted-foreground">
                      Complete Step 1 first.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            // OAuth flow: single button, Stripe handles everything
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You'll be sent to Stripe to authorize BillingOS to access your existing account.
                BillingOS will be able to create products, subscriptions, and customers on your behalf.
              </p>
              <Button
                onClick={handleConnectExistingStripe}
                disabled={getOAuthUrl.isPending}
              >
                {getOAuthUrl.isPending ? (
                  <>
                    <Loading03Icon size={16} className="mr-2 animate-spin" />
                    Redirecting to Stripe...
                  </>
                ) : (
                  <>
                    Continue to Stripe
                    <ArrowUpRight01Icon size={16} className="ml-2" />
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="mt-4 rounded-lg border bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Payments are processed securely by Stripe. Your data is encrypted and protected.
            </p>
          </div>
        </CardContent>
      </Card>
    </DashboardBody>
  )
}
