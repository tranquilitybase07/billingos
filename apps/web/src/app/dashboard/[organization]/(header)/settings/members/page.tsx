'use client'

import { useState } from 'react'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useAuth } from '@/providers/AuthProvider'
import {
  useListMembers,
  useInviteMember,
  useRemoveMember,
  useListInvitations,
  useRevokeInvitation,
  useResendInvitation,
} from '@/hooks/queries/organization'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import {
  Loading03Icon,
  PlusSignIcon,
  Delete02Icon,
  CrownIcon,
  UserMultiple02Icon,
  Mail01Icon,
  ReloadIcon,
} from 'hugeicons-react'
import { useToast } from '@/hooks/use-toast'

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export default function MembersPage() {
  const { organization } = useOrganization()
  const { user } = useAuth()
  const { toast } = useToast()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)
  const [invitationToRevoke, setInvitationToRevoke] = useState<string | null>(
    null,
  )

  const { data: membersData, isLoading: membersLoading } = useListMembers(
    organization.id,
  )
  const { data: invitationsData, isLoading: invitationsLoading } =
    useListInvitations(organization.id)
  const inviteMember = useInviteMember(organization.id)
  const removeMember = useRemoveMember(organization.id)
  const revokeInvitation = useRevokeInvitation(organization.id)
  const resendInvitation = useResendInvitation(organization.id)

  const members = membersData || []
  const invitations = invitationsData || []
  const currentUserMember = members.find((m) => m.user_id === user?.id)
  const isCurrentUserAdmin = currentUserMember?.is_admin ?? false

  const handleInvite = async () => {
    try {
      await inviteMember.mutateAsync({ email: inviteEmail })
      toast({
        title: 'Invitation sent',
        description: `${inviteEmail} will receive a link to join ${organization.name}.`,
      })
      setInviteEmail('')
      setInviteOpen(false)
    } catch (error) {
      toast({
        title: 'Could not send invitation',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleRemove = async (memberId: string) => {
    try {
      await removeMember.mutateAsync(memberId)
      toast({
        title: 'Member removed',
        description: 'They no longer have access to the organization.',
      })
      setMemberToRemove(null)
    } catch (error) {
      toast({
        title: 'Could not remove member',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleRevoke = async (invitationId: string) => {
    try {
      await revokeInvitation.mutateAsync(invitationId)
      toast({ title: 'Invitation revoked' })
      setInvitationToRevoke(null)
    } catch (error) {
      toast({
        title: 'Could not revoke invitation',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleResend = async (invitationId: string, email: string) => {
    try {
      await resendInvitation.mutateAsync(invitationId)
      toast({
        title: 'Invitation resent',
        description: `A new link was sent to ${email}.`,
      })
    } catch (error) {
      toast({
        title: 'Could not resend invitation',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  if (membersLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading03Icon
          size={32}
          className="animate-spin text-muted-foreground"
        />
      </div>
    )
  }

  const inviteDialog = (
    <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusSignIcon size={16} className="mr-2" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            They&apos;ll receive an email with a link to join {organization.name}.
            They can sign up or sign in with an existing account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  inviteEmail &&
                  !inviteMember.isPending
                ) {
                  handleInvite()
                }
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleInvite}
            disabled={!inviteEmail || inviteMember.isPending}
          >
            {inviteMember.isPending ? (
              <>
                <Loading03Icon size={16} className="mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              'Send Invitation'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage who has access to this organization
              </CardDescription>
            </div>
            {isCurrentUserAdmin && inviteDialog}
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserMultiple02Icon
                size={48}
                className="text-muted-foreground mb-4"
              />
              <h3 className="text-sm font-medium">No team members yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Invite teammates by email — they&apos;ll get a link to join.
              </p>
              {isCurrentUserAdmin && (
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => setInviteOpen(true)}
                >
                  <PlusSignIcon size={16} className="mr-2" />
                  Invite Member
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isCurrentUser = member.user_id === user?.id
                  const isAdmin = member.is_admin ?? false
                  const initial = member.email?.charAt(0).toUpperCase() || '?'

                  return (
                    <TableRow key={member.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {initial}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{member.email}</span>
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isAdmin ? 'default' : 'secondary'}
                          className="gap-1"
                        >
                          {isAdmin && <CrownIcon size={12} />}
                          {isAdmin ? 'Admin' : 'Member'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(member.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {isCurrentUserAdmin && !isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMemberToRemove(member.user_id)}
                          >
                            <Delete02Icon
                              size={16}
                              className="text-destructive"
                            />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(invitations.length > 0 || invitationsLoading) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail01Icon size={18} className="text-muted-foreground" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              People who have been invited but haven&apos;t accepted yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {invitation.email.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {invitation.email}
                          </span>
                          {invitation.invited_by_email && (
                            <span className="text-xs text-muted-foreground">
                              Invited by {invitation.invited_by_email}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {invitation.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {relativeTime(invitation.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isCurrentUserAdmin && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleResend(invitation.id, invitation.email)
                            }
                            disabled={resendInvitation.isPending}
                            title="Resend invitation"
                          >
                            <ReloadIcon size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInvitationToRevoke(invitation.id)}
                            title="Revoke invitation"
                          >
                            <Delete02Icon
                              size={16}
                              className="text-destructive"
                            />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to the organization and all its
              resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && handleRemove(memberToRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? (
                <>
                  <Loading03Icon size={16} className="mr-2 animate-spin" />
                  Removing…
                </>
              ) : (
                'Remove Member'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!invitationToRevoke}
        onOpenChange={(open) => !open && setInvitationToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The invitation link will stop working. You can always send a new
              one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                invitationToRevoke && handleRevoke(invitationToRevoke)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokeInvitation.isPending}
            >
              {revokeInvitation.isPending ? (
                <>
                  <Loading03Icon size={16} className="mr-2 animate-spin" />
                  Revoking…
                </>
              ) : (
                'Revoke Invitation'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
