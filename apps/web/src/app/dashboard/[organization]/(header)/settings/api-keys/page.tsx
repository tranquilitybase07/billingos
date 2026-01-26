'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useOrganization } from '@/providers/OrganizationProvider'
import {
  useListApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from '@/hooks/queries/api-keys'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
  Settings,
  Users,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ApiKey, ApiKeyPairCreated, CreateApiKeyDTO } from '@/lib/api/types'

export default function ApiKeysPage() {
  const { organization } = useOrganization()
  const params = useParams()
  const { toast } = useToast()

  // State
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null)
  const [createdKeyPair, setCreatedKeyPair] = useState<ApiKeyPairCreated | null>(null)
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [showPublishableKey, setShowPublishableKey] = useState(false)

  // Form state
  const [formData, setFormData] = useState<CreateApiKeyDTO>({
    name: '',
    environment: 'test',
  })

  // Queries
  const { data: apiKeys = [], isLoading } = useListApiKeys(organization.id)
  const createApiKey = useCreateApiKey(organization.id)
  const revokeApiKey = useRevokeApiKey(organization.id)

  // Group keys by pair
  const keyPairs = useMemo(() => {
    const pairs: Array<{
      pairId: string | null
      name?: string
      environment: string
      secretKey: ApiKey | null
      publishableKey: ApiKey | null
      createdAt: Date
    }> = []

    const processedPairs = new Set<string>()

    apiKeys.forEach((key) => {
      if (key.keyPairId) {
        // Skip if already processed
        if (processedPairs.has(key.keyPairId)) return
        processedPairs.add(key.keyPairId)

        // Find both keys in the pair
        const secretKey = apiKeys.find(
          (k) => k.keyPairId === key.keyPairId && k.keyType === 'secret'
        )
        const publishableKey = apiKeys.find(
          (k) => k.keyPairId === key.keyPairId && k.keyType === 'publishable'
        )

        pairs.push({
          pairId: key.keyPairId,
          name: key.name,
          environment: key.environment,
          secretKey: secretKey || null,
          publishableKey: publishableKey || null,
          createdAt: key.createdAt,
        })
      } else {
        // Legacy individual key
        pairs.push({
          pairId: null,
          name: key.name,
          environment: key.environment,
          secretKey: key.keyType === 'secret' ? key : null,
          publishableKey: key.keyType === 'publishable' ? key : null,
          createdAt: key.createdAt,
        })
      }
    })

    return pairs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }, [apiKeys])

  // Handlers
  const handleCreate = async () => {
    try {
      const result = await createApiKey.mutateAsync(formData)
      setCreatedKeyPair(result)
      setCreateDialogOpen(false)
      setFormData({ name: '', environment: 'test' })
      toast({
        title: 'Success',
        description: 'API key pair created successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to create API keys',
        variant: 'destructive',
      })
    }
  }

  const handleRevoke = async () => {
    if (!revokeKeyId) return

    try {
      await revokeApiKey.mutateAsync(revokeKeyId)
      setRevokeKeyId(null)
      toast({
        title: 'Success',
        description: 'API key pair revoked successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to revoke API keys',
        variant: 'destructive',
      })
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: 'Copied',
      description: `${label} copied to clipboard`,
    })
  }

  const getEnvironmentBadge = (env: string) => {
    return env === 'live' ? (
      <Badge variant="destructive">Live</Badge>
    ) : (
      <Badge variant="outline">Test</Badge>
    )
  }

  return (
    <DashboardBody className="space-y-6">
      {/* Settings Navigation */}
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization settings
          </p>
        </div>

        <Tabs value="api-keys" className="w-full">
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
          <p className="text-muted-foreground mt-2">
            Manage API key pairs for your organization
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create API Keys
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key Pair</DialogTitle>
              <DialogDescription>
                Generate a secret and publishable key pair (like Stripe)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  placeholder="e.g., Production, Staging"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="environment">Environment</Label>
                <Select
                  value={formData.environment}
                  onValueChange={(value: 'live' | 'test') =>
                    setFormData({ ...formData, environment: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Creates both secret (sk_) and publishable (pk_) keys together
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createApiKey.isPending}
              >
                {createApiKey.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Key Pair
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Created Key Pair Success Dialog */}
      <Dialog open={!!createdKeyPair} onOpenChange={() => setCreatedKeyPair(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Save Your API Keys
            </DialogTitle>
            <DialogDescription>
              {createdKeyPair?.warning}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Secret Key */}
            <div className="rounded-lg border bg-muted p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Secret Key <Badge variant="default">Backend Only</Badge>
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                  >
                    {showSecretKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(createdKeyPair?.secretKey.fullKey || '', 'Secret key')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <code className="block font-mono text-sm break-all">
                {showSecretKey
                  ? createdKeyPair?.secretKey.fullKey
                  : `${createdKeyPair?.secretKey.keyPrefix}${'•'.repeat(32)}`}
              </code>
            </div>

            {/* Publishable Key */}
            <div className="rounded-lg border bg-muted p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Publishable Key <Badge variant="secondary">Frontend Safe</Badge>
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPublishableKey(!showPublishableKey)}
                  >
                    {showPublishableKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(createdKeyPair?.publishableKey.fullKey || '', 'Publishable key')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <code className="block font-mono text-sm break-all">
                {showPublishableKey
                  ? createdKeyPair?.publishableKey.fullKey
                  : `${createdKeyPair?.publishableKey.keyPrefix}${'•'.repeat(32)}`}
              </code>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                <strong>Security Notice:</strong> Store these keys in a secure
                location. Never share your secret key or commit it to version
                control. This is your only chance to copy them.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setCreatedKeyPair(null)}>I've Saved My Keys</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog
        open={!!revokeKeyId}
        onOpenChange={() => setRevokeKeyId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key Pair</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke this API key pair? Both the secret
              and publishable keys will be revoked. Applications using these keys
              will immediately lose access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeApiKey.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Revoking...
                </>
              ) : (
                'Revoke Key Pair'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <CardTitle>Your API Key Pairs</CardTitle>
          <CardDescription>
            {keyPairs.length === 0
              ? 'No API keys yet. Create a pair to get started.'
              : `You have ${keyPairs.length} key ${keyPairs.length === 1 ? 'pair' : 'pairs'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : keyPairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Key className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground max-w-sm">
                API keys allow your applications to authenticate with BillingOS.
                Create your first key pair to get started.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Secret Key</TableHead>
                  <TableHead>Publishable Key</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keyPairs.map((pair) => (
                  <TableRow key={pair.pairId || pair.secretKey?.id || pair.publishableKey?.id}>
                    <TableCell className="font-medium">
                      {pair.name || (
                        <span className="text-muted-foreground italic">
                          Unnamed
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {pair.secretKey ? (
                        <code className="text-sm font-mono">{pair.secretKey.keyPrefix}***</code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {pair.publishableKey ? (
                        <code className="text-sm font-mono">{pair.publishableKey.keyPrefix}***</code>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getEnvironmentBadge(pair.environment)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(pair.createdAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {pair.secretKey?.revokedAt || pair.publishableKey?.revokedAt ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Revoked
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokeKeyId(pair.secretKey?.id || pair.publishableKey?.id || '')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Documentation Section */}
      <Card>
        <CardHeader>
          <CardTitle>Using Your API Keys</CardTitle>
          <CardDescription>
            Quick guide on how to use API key pairs in your application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Server-Side (Node.js)</h4>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
              <code>{`// Use your SECRET key on the backend
const response = await fetch('https://api.billingos.com/v1/session-tokens', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${process.env.BILLINGOS_SECRET_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    externalUserId: user.id,
    expiresIn: 3600
  })
})

const { sessionToken } = await response.json()`}</code>
            </pre>
          </div>

          <div>
            <h4 className="font-medium mb-2">Client-Side (React)</h4>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
              <code>{`// Fetch session token from YOUR backend
const { sessionToken } = await fetch('/api/billingos-session').then(r => r.json())

// Use in your app
import { BillingOSProvider } from '@billingos/react'

<BillingOSProvider sessionToken={sessionToken}>
  <App />
</BillingOSProvider>`}</code>
            </pre>
          </div>
        </CardContent>
      </Card>
    </DashboardBody>
  )
}
