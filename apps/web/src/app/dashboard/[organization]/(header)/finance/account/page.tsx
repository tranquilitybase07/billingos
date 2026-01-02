'use client'

import { useState } from 'react'
import { useOrganization } from '@/providers/OrganizationProvider'
import {
  usePaymentStatus,
  useSubmitBusinessDetails,
} from '@/hooks/queries/organization'
import {
  useAccount,
  useCreateAccount,
} from '@/hooks/queries/account'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
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

  const { data: paymentStatus, isLoading: isLoadingStatus } = usePaymentStatus(organization.id)
  const { data: account, isLoading: isLoadingAccount } = useAccount(organization.id)
  const submitBusinessDetails = useSubmitBusinessDetails(organization.id)
  const createAccount = useCreateAccount()

  const isPaymentReady = paymentStatus?.payment_ready ?? false
  const hasBusinessDetails = paymentStatus?.is_details_submitted ?? false
  const hasAccount = !!account

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

      // Get onboarding link and redirect
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts/${newAccount.id}/onboarding-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const { url } = await response.json()
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts/${account.id}/onboarding-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get onboarding link',
        variant: 'destructive',
      })
    }
  }

  if (isLoadingStatus || isLoadingAccount) {
    return (
      <DashboardBody>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardBody>
    )
  }

  return (
    <DashboardBody className="gap-6">
      {/* Status banner */}
      {isPaymentReady ? (
        <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-900 dark:text-green-100">
            Payment account active
          </AlertTitle>
          <AlertDescription className="text-green-800 dark:text-green-200">
            Your Stripe Connect account is fully set up and ready to accept payments.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
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
                  <CheckCircle className="h-5 w-5 text-green-600" />
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </CardTitle>
              <CardDescription>
                Create and verify your Stripe Connect account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasAccount ? (
            <>
              <p className="text-sm text-muted-foreground">
                You'll be redirected to Stripe to complete your account setup.
              </p>
              <Button
                onClick={handleCreateStripeAccount}
                disabled={!hasBusinessDetails || createAccount.isPending}
              >
                {createAccount.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Stripe Account
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              {!hasBusinessDetails && (
                <p className="text-xs text-muted-foreground">
                  Please submit business details first
                </p>
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
                  <span className="text-muted-foreground">Status</span>
                  <span className="capitalize">{account.is_details_submitted ? 'Active' : 'Pending'}</span>
                </div>
              </div>
              {!isPaymentReady && (
                <Button onClick={handleContinueOnboarding}>
                  Continue Onboarding
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </DashboardBody>
  )
}
