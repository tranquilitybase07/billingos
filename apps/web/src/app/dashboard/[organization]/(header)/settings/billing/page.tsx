'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '@/providers/OrganizationProvider'
import {
  usePaymentStatus,
  useSubmitBusinessDetails,
} from '@/hooks/queries/organization'
import {
  useAccountByOrganization,
  useCreateAccount,
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
} from 'hugeicons-react'
import { useToast } from '@/hooks/use-toast'
import { SettingsTabNav } from '../_components/SettingsTabNav'
import { InfoRow } from './_components/InfoRow'
import { CurrencySelector } from './_components/CurrencySelector'

export default function BillingPage() {
  const { organization } = useOrganization()
  const { toast } = useToast()
  const [businessDetails, setBusinessDetails] = useState({
    business_name: organization.name,
    country: (organization.details as Record<string, string>)?.country || 'US',
    about: '',
    product_description: '',
    intended_use: '',
  })

  const { data: paymentStatus, isLoading: isLoadingStatus } = usePaymentStatus(organization.id)
  const { data: account, isLoading: isLoadingAccount } = useAccountByOrganization(organization.id)
  const submitBusinessDetails = useSubmitBusinessDetails(organization.id)
  const createAccount = useCreateAccount()

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
              <CardTitle>Payment Account</CardTitle>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30">
                <CheckmarkCircle01Icon size={14} className="mr-1" />
                Active
              </Badge>
            </div>
            <CardDescription>
              Your payment account is set up and ready to accept payments.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

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

            <Button onClick={handleContinueSetup}>
              Continue Setup
              <ArrowUpRight01Icon size={16} className="ml-2" />
            </Button>
          </CardContent>
        </Card>
      </DashboardBody>
    )
  }

  // State C: No Account (setup needed)
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
                Complete these steps to start accepting payments from your customers.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
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
