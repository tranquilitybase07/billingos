'use client'

import { useState } from 'react'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useAuth } from '@/providers/AuthProvider'
import {
  useListMembers,
  useInviteMember,
  useRemoveMember,
} from '@/hooks/queries/organization'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
} from 'hugeicons-react'
import { useToast } from '@/hooks/use-toast'
import { SettingsTabNav } from '../_components/SettingsTabNav'

export default function MembersPage() {
  const { organization } = useOrganization()
  const { user } = useAuth()
  const { toast } = useToast()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)

  const { data: membersData, isLoading } = useListMembers(organization.id)
  const inviteMember = useInviteMember(organization.id)
  const removeMember = useRemoveMember(organization.id)

  const members = membersData || []
  const currentUserMember = members.find((m) => m.user_id === user?.id)
  const isCurrentUserAdmin = currentUserMember?.is_admin ?? false

  const handleInvite = async () => {
    try {
      await inviteMember.mutateAsync({ email: inviteEmail })
      toast({
        title: 'Invitation sent',
        description: `An invitation has been sent to ${inviteEmail}`,
      })
      setInviteEmail('')
      setInviteOpen(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to invite member',
        variant: 'destructive',
      })
    }
  }

  const handleRemove = async (memberId: string) => {
    try {
      await removeMember.mutateAsync(memberId)
      toast({
        title: 'Member removed',
        description: 'The member has been removed from the organization',
      })
      setMemberToRemove(null)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove member',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
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
      <SettingsTabNav activeTab="members" />

      {/* Members Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage who has access to this organization
              </CardDescription>
            </div>
            {isCurrentUserAdmin && (
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
                      Send an invitation to join this organization
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
                          Sending...
                        </>
                      ) : (
                        'Send Invitation'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserMultiple02Icon size={48} className="text-muted-foreground mb-4" />
              <h3 className="text-sm font-medium">No team members yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Invite team members to collaborate on this organization.
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
                            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {member.email}
                              </span>
                              {isCurrentUser && (
                                <Badge variant="outline" className="text-xs">
                                  You
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <Badge
                            variant={isAdmin ? 'default' : 'secondary'}
                            className="gap-1"
                          >
                            {isAdmin && <CrownIcon size={12} />}
                            {isAdmin ? 'Admin' : 'Member'}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {isAdmin
                              ? 'Full access to all settings and billing'
                              : 'Can manage products and customers'}
                          </p>
                        </div>
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
                            <Delete02Icon size={16} className="text-destructive" />
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

      {/* Remove member confirmation dialog */}
      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to the organization and all its resources.
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
                  Removing...
                </>
              ) : (
                'Remove Member'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardBody>
  )
}
