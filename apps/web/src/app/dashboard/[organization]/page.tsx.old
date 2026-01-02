'use client'

import { useParams } from 'next/navigation'
import { useListOrganizations } from '@/hooks/queries/organization'
import { useAuth } from '@/providers/AuthProvider'
import Button from '@/components/atoms/Button'
import { Card } from '@/components/ui/card'

export default function OrganizationDashboardPage() {
  const params = useParams()
  const { signOut } = useAuth()
  const slug = params.organization as string

  // Fetch all orgs and find by slug
  const { data: organizations, isLoading, error } = useListOrganizations()
  const organization = organizations?.find(org => org.slug === slug)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading organization...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md p-6 text-center">
          <h2 className="text-xl font-semibold text-destructive mb-2">
            Organization not found
          </h2>
          <p className="text-muted-foreground mb-4">
            The organization "{slug}" could not be found or you don't have access to it.
          </p>
          <Button onClick={() => window.location.href = '/dashboard'}>
            Go to Dashboard
          </Button>
        </Card>
      </div>
    )
  }

  if (!organization) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold">{organization.name}</h1>
              <span className="text-xs text-muted-foreground">/{organization.slug}</span>
            </div>
            <Button onClick={signOut} variant="secondary">
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6">
          {/* Welcome Card */}
          <Card className="p-6">
            <h2 className="text-2xl font-bold mb-4">
              Welcome to {organization.name}!
            </h2>
            <p className="text-muted-foreground mb-6">
              Your organization is ready. Here's what you can do next:
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="p-4 border-2 hover:border-primary transition-colors cursor-pointer">
                <h3 className="font-semibold mb-2">💼 Business Details</h3>
                <p className="text-sm text-muted-foreground">
                  Submit your business information for verification
                </p>
              </Card>

              <Card className="p-4 border-2 hover:border-primary transition-colors cursor-pointer">
                <h3 className="font-semibold mb-2">💳 Setup Payments</h3>
                <p className="text-sm text-muted-foreground">
                  Connect your Stripe account to accept payments
                </p>
              </Card>

              <Card className="p-4 border-2 hover:border-primary transition-colors cursor-pointer">
                <h3 className="font-semibold mb-2">👥 Invite Team</h3>
                <p className="text-sm text-muted-foreground">
                  Add team members to collaborate
                </p>
              </Card>
            </div>
          </Card>

          {/* Organization Details */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Organization Details</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Name</dt>
                <dd className="mt-1 text-sm">{organization.name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Slug</dt>
                <dd className="mt-1 text-sm font-mono">{organization.slug}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Email</dt>
                <dd className="mt-1 text-sm">{organization.email || 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Website</dt>
                <dd className="mt-1 text-sm">{organization.website || 'Not set'}</dd>
              </div>
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
                  {new Date(organization.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Coming Soon */}
          <Card className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">More Features Coming Soon!</h3>
            <p className="text-sm text-muted-foreground mb-4">
              We're building the dashboard, payment setup, and team management pages.
            </p>
            <p className="text-xs text-muted-foreground">
              Current progress: Organization creation ✅ | Dashboard layout 🚧 | Payment setup 🚧 | Team management 🚧
            </p>
          </Card>
        </div>
      </main>
    </div>
  )
}
