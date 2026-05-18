'use client'

import { useState, useMemo } from 'react'
import { useOrganization } from '@/providers/OrganizationProvider'
import {
  useListApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from '@/hooks/queries/api-keys'
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
import { useToast } from '@/hooks/use-toast'
import {
  Key01Icon,
  PlusSignIcon,
  Copy01Icon,
  Delete02Icon,
  Loading03Icon,
  ViewIcon,
  ViewOffIcon,
  Alert01Icon,
} from 'hugeicons-react'
import { formatDistanceToNow } from 'date-fns'
import type { ApiKey, ApiKeyPairCreated, CreateApiKeyDTO } from '@/lib/api/types'

export default function ApiKeysPage() {
  const { organization } = useOrganization()
  const { toast } = useToast()

  // State
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null)
  const [createdKeyPair, setCreatedKeyPair] = useState<ApiKeyPairCreated | null>(null)
  const [showSecretKey, setShowSecretKey] = useState(false)

  // Form state
  const [formData, setFormData] = useState<CreateApiKeyDTO>({
    name: '',
  })

  // Queries
  const { data: apiKeys = [], isLoading } = useListApiKeys(organization.id)
  const createApiKey = useCreateApiKey(organization.id)
  const revokeApiKey = useRevokeApiKey(organization.id)

  const getCreatedAtTime = (value: Date | string | null | undefined) => {
    if (!value) return 0
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }

  const formatCreatedAt = (value: Date | string | null | undefined) => {
    const time = getCreatedAtTime(value)
    if (time === 0) return 'Unknown'
    return formatDistanceToNow(new Date(time), { addSuffix: true })
  }

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

    return pairs.sort((a, b) => getCreatedAtTime(b.createdAt) - getCreatedAtTime(a.createdAt))
  }, [apiKeys])

  // Handlers
  const handleCreate = async () => {
    try {
      const result = await createApiKey.mutateAsync(formData)
      setCreatedKeyPair(result)
      setCreateDialogOpen(false)
      setFormData({ name: '' })
      toast({
        title: 'Success',
        description: 'API key created successfully',
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
        description: 'API key revoked successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to revoke API key',
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
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
          <p className="text-muted-foreground mt-2">
            Manage API keys for your organization
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusSignIcon size={16} className="mr-2" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                Generate a secret API key for your application
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

              <p className="text-xs text-muted-foreground">
                Your secret key will only be shown once after creation
              </p>
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
                  <Loading03Icon size={16} className="mr-2 animate-spin" />
                )}
                Create API Key
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
              <Alert01Icon size={20} className="text-amber-500" />
              Save Your API Key
            </DialogTitle>
            <DialogDescription>
              {createdKeyPair?.warning}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Secret Key */}
            <div className="rounded-lg border bg-muted p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">
                  API Key
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                  >
                    {showSecretKey ? (
                      <ViewOffIcon size={16} />
                    ) : (
                      <ViewIcon size={16} />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(createdKeyPair?.secretKey.fullKey || '', 'API key')}
                  >
                    <Copy01Icon size={16} />
                  </Button>
                </div>
              </div>
              <code className="block font-mono text-sm break-all">
                {showSecretKey
                  ? createdKeyPair?.secretKey.fullKey
                  : `${createdKeyPair?.secretKey.keyPrefix}${'•'.repeat(32)}`}
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
            <Button onClick={() => setCreatedKeyPair(null)}>I've Saved My Key</Button>
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
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke this API key? Applications using
              this key will immediately lose access. This action cannot be undone.
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
                  <Loading03Icon size={16} className="mr-2 animate-spin" />
                  Revoking...
                </>
              ) : (
                'Revoke Key'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            {keyPairs.length === 0
              ? 'No API keys yet. Create one to get started.'
              : `You have ${keyPairs.length} API ${keyPairs.length === 1 ? 'key' : 'keys'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loading03Icon size={32} className="animate-spin text-muted-foreground" />
            </div>
          ) : keyPairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Key01Icon size={48} className="text-muted-foreground mb-4" />
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
                  <TableHead>API Key</TableHead>
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
                    <TableCell>{getEnvironmentBadge(pair.environment)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCreatedAt(pair.createdAt)}
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
                          <Delete02Icon size={16} />
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
    </>
  )
}
