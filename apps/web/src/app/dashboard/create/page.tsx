'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateOrganization } from '@/hooks/queries/organization'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

export default function CreateOrganizationPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [autoSlug, setAutoSlug] = useState(true)

  const createOrg = useCreateOrganization()

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value)
    if (autoSlug) {
      const generatedSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      setSlug(generatedSlug)
    }
  }

  const handleSlugChange = (value: string) => {
    setAutoSlug(false)
    setSlug(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const organization = await createOrg.mutateAsync({
        name,
        slug,
        email: email || undefined,
      })

      // Following Polar's pattern: redirect directly to the new organization
      // The organization layout will handle membership verification
      router.push(`/dashboard/${organization.slug}`)
    } catch (error: any) {
      console.error('Failed to create organization:', error)
      // Error handling will be shown via the mutation state
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Create your organization</h1>
          <p className="mt-2 text-muted-foreground">
            Get started by creating your first organization
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name *</Label>
            <Input
              id="name"
              type="text"
              placeholder="Acme Inc"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              minLength={2}
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug *</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">billingos.com/</span>
              <Input
                id="slug"
                type="text"
                placeholder="acme-inc"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                minLength={2}
                maxLength={255}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Only lowercase letters, numbers, and hyphens
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="billing@acme.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {createOrg.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {createOrg.error instanceof Error
                ? createOrg.error.message
                : 'Failed to create organization'}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={createOrg.isPending || !name || !slug}
          >
            {createOrg.isPending ? 'Creating...' : 'Create Organization'}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          By creating an organization, you agree to our{' '}
          <a href="#" className="underline hover:text-foreground">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="underline hover:text-foreground">
            Privacy Policy
          </a>
        </div>
      </Card>
    </div>
  )
}
