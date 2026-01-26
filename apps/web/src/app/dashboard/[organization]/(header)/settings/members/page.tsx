'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Loader2, Plus, Trash2, Crown, Settings, Users, Key } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function MembersPage() {
  const { organization } = useOrganization()
  const { user } = useAuth()
  const params = useParams()
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
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardBody>
    )
  }

  return (
    <DashboardBody className="gap-6">
      {/* Settings Navigation */}
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization settings
          </p>
        </div>

        <Tabs value="members" className="w-full">
          <TabsList>
            <TabsTrigger value="general" asChild>
              <Link href={`/dashboard/${params.organization}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                General
              </Link>
            </TabsTrigger>
            <TabsTrigger value="members" asChild>
              <Link href={`/dashboard/${params.organization}/settings/members`}>
                <Users className="mr-2 h-4 w-4" />
                Members
              </Link>
            </TabsTrigger>
            <TabsTrigger value="api-keys" asChild>
              <Link href={`/dashboard/${params.organization}/settings/api-keys`}>
                <Key className="mr-2 h-4 w-4" />
                API Keys
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
                    <Plus className="mr-2 h-4 w-4" />
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
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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

                return (
                  <TableRow key={member.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {member.email?.charAt(0).toUpperCase()}
                        </div>
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
                      <Badge
                        variant={isAdmin ? 'default' : 'secondary'}
                        className="gap-1"
                      >
                        {isAdmin && <Crown className="h-3 w-3" />}
                        {isAdmin ? 'Admin' : 'Member'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(member.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isCurrentUserAdmin && !isCurrentUser && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMemberToRemove(member.user_id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
