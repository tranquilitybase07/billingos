'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  useInvitationLookup,
  useAcceptInvitation,
} from '@/hooks/queries/organization'
import { useAuth } from '@/providers/AuthProvider'
import { setOnboardingCookie } from '@/components/Onboarding/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Logo from '@/components/branding/Logo'
import { useToast } from '@/hooks/use-toast'
import {
  Loading03Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
} from 'hugeicons-react'

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const { user, loading: authLoading, signOut } = useAuth()
  const {
    data: invitation,
    isLoading: lookupLoading,
    error: lookupError,
  } = useInvitationLookup(token)
  const acceptInvitation = useAcceptInvitation()
  const [isAccepting, setIsAccepting] = useState(false)

  const returnTo = `/invite/${token}`

  const orgName = invitation?.organization.name ?? 'this organization'
  const orgAvatar = invitation?.organization.avatar_url
  const invitedEmail = invitation?.email ?? ''
  const userEmail = user?.email ?? ''
  const emailsMatch =
    !!user && invitedEmail.toLowerCase() === userEmail.toLowerCase()

  const handleAccept = async () => {
    setIsAccepting(true)
    try {
      const result = await acceptInvitation.mutateAsync(token)
      setOnboardingCookie('complete')
      toast({
        title: `Welcome to ${orgName}`,
        description: 'You can now access the organization.',
      })
      router.push(`/dashboard/${result.organizationSlug}`)
    } catch (err: any) {
      toast({
        title: 'Could not accept invitation',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      })
      setIsAccepting(false)
    }
  }

  // Auto-accept if user is already authed with matching email
  useEffect(() => {
    if (!authLoading && !lookupLoading && invitation && emailsMatch && !isAccepting) {
      handleAccept()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, lookupLoading, invitation, emailsMatch])

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size={48} />
        </div>
        {children}
      </div>
    </div>
  )

  if (authLoading || lookupLoading) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loading03Icon
              size={32}
              className="animate-spin text-muted-foreground"
            />
            <p className="mt-4 text-sm text-muted-foreground">
              Loading invitation…
            </p>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (lookupError || !invitation) {
    const status = (lookupError as any)?.status
    const message =
      status === 410
        ? 'This invitation has expired or already been used.'
        : 'This invitation is invalid or no longer available.'
    return (
      <Shell>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Alert02Icon size={24} className="text-destructive" />
            </div>
            <CardTitle>Invitation unavailable</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </CardFooter>
        </Card>
      </Shell>
    )
  }

  // Authed + matching email → auto-accept (handled in effect); show progress
  if (user && emailsMatch) {
    return (
      <Shell>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckmarkCircle02Icon size={24} className="text-primary" />
            </div>
            <CardTitle>Joining {orgName}</CardTitle>
            <CardDescription>
              Setting up your access…
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-6">
            <Loading03Icon size={28} className="animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </Shell>
    )
  }

  // Authed but email mismatch
  if (user && !emailsMatch) {
    return (
      <Shell>
        <Card>
          <CardHeader className="text-center">
            <Avatar className="mx-auto mb-2 h-12 w-12">
              {orgAvatar && <AvatarImage src={orgAvatar} />}
              <AvatarFallback>{orgName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <CardTitle>Wrong account</CardTitle>
            <CardDescription>
              This invitation was sent to{' '}
              <span className="font-medium text-foreground">{invitedEmail}</span>
              , but you're signed in as{' '}
              <span className="font-medium text-foreground">{userEmail}</span>.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button onClick={() => signOut()} className="w-full">
              Sign out and continue
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard">Stay signed in</Link>
            </Button>
          </CardFooter>
        </Card>
      </Shell>
    )
  }

  // Unauthed — offer sign in or sign up, pre-filled with invited email
  const inviterEmail = invitation.inviter.email
  const signupHref = `/signup?email=${encodeURIComponent(invitedEmail)}&returnTo=${encodeURIComponent(returnTo)}`
  const loginHref = `/login?email=${encodeURIComponent(invitedEmail)}&returnTo=${encodeURIComponent(returnTo)}`

  return (
    <Shell>
      <Card>
        <CardHeader className="text-center">
          <Avatar className="mx-auto mb-3 h-14 w-14">
            {orgAvatar && <AvatarImage src={orgAvatar} />}
            <AvatarFallback className="text-lg">
              {orgName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <CardTitle>You're invited to {orgName}</CardTitle>
          <CardDescription>
            {inviterEmail ? (
              <>
                <span className="font-medium text-foreground">
                  {inviterEmail}
                </span>{' '}
                invited{' '}
              </>
            ) : (
              'Invited as '
            )}
            <span className="font-medium text-foreground">{invitedEmail}</span>{' '}
            to join as {invitation.role}.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href={signupHref}>Create an account</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={loginHref}>I already have an account</Link>
          </Button>
        </CardFooter>
      </Card>
    </Shell>
  )
}
