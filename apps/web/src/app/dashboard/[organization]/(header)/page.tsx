'use client'

import Link from 'next/link'
import { useOrganization } from '@/providers/OrganizationProvider'
import { usePaymentStatus } from '@/hooks/queries/organization'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CreditCardIcon, UserMultiple02Icon, CheckmarkCircle01Icon, AlertCircleIcon, ArrowRight01Icon } from 'hugeicons-react'
import { Button } from '@/components/ui/button'
import { orgPath } from '@/lib/navigation'

import { DashboardAreaCharts } from '@/components/Dashboard/DashboardAreaCharts'

export default function DashboardHomePage() {
  const { organization } = useOrganization()
  const { data: paymentStatus, isLoading: isLoadingPayment } = usePaymentStatus(organization.id)

  const isPaymentSetup = paymentStatus?.payment_ready ?? false

  return (
    <DashboardBody className="gap-6">
      {/* Onboarding banner if payment not setup */}
      {!isLoadingPayment && !isPaymentSetup && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <AlertCircleIcon size={16} className="text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-900 dark:text-amber-100">
            Complete your setup
          </AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            Set up your Stripe Connect account to start accepting payments.
            <Link href={orgPath(organization.slug, '/finance/account')}>
              <Button variant="link" className="h-auto p-0 ml-1 text-amber-900 dark:text-amber-100">
                Get started <ArrowRight01Icon size={12} className="ml-1" />
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Welcome message */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back!</h2>
        <p className="text-muted-foreground mt-2">
          Here's an overview of {organization.name}
        </p>
      </div>

      {/* Quick actions cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Payment Setup Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CreditCardIcon size={32} className="text-primary" />
              {isPaymentSetup && (
                <CheckmarkCircle01Icon size={20} className="text-green-600" />
              )}
            </div>
            <CardTitle>Payment Setup</CardTitle>
            <CardDescription>
              {isPaymentSetup
                ? 'Your payment account is active'
                : 'Connect your Stripe account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={orgPath(organization.slug, '/finance/account')}>
              <Button variant={isPaymentSetup ? 'outline' : 'default'} className="w-full">
                {isPaymentSetup ? 'Manage Account' : 'Setup Payments'}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Team Management Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <UserMultiple02Icon size={32} className="text-primary" />
            </div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Invite and manage your team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={orgPath(organization.slug, '/settings/members')}>
              <Button variant="outline" className="w-full">
                Manage Team
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Organization Settings Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="bg-primary/10 rounded-md p-2">
                <span className="text-2xl font-bold text-primary">
                  {organization.name.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <CardTitle>Organization</CardTitle>
            <CardDescription>
              General settings and details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={orgPath(organization.slug, '/settings')}>
              <Button variant="outline" className="w-full">
                View Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Area Charts */}
      <DashboardAreaCharts />

      {/* Organization details */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Name</dt>
              <dd className="mt-1 text-sm font-medium">{organization.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Slug</dt>
              <dd className="mt-1 text-sm font-mono">{organization.slug}</dd>
            </div>
            {organization.email && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Email</dt>
                <dd className="mt-1 text-sm">{organization.email}</dd>
              </div>
            )}
            {organization.website && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Website</dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={organization.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {organization.website}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  {organization.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Created</dt>
              <dd className="mt-1 text-sm">
                {new Date(organization.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>


    </DashboardBody>
  )
}
