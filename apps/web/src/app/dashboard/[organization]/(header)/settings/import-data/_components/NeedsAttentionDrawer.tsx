'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CodeBlock } from '@/components/ui/code-block'
import { useToast } from '@/hooks/use-toast'
import { Alert01Icon } from 'hugeicons-react'
import {
  type MigrationJob,
  useManualBindCustomer,
} from '@/hooks/queries/import'

interface Props {
  organizationId: string
  job: MigrationJob
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Drawer surfaced when an import leaves Bucket 2 (stuck) customers. Two tabs:
// inline manual bind for small N, code snippet for power users.
export function NeedsAttentionDrawer({
  organizationId,
  job,
  open,
  onOpenChange,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Resolve unbound customers</SheetTitle>
          <SheetDescription>
            These customers couldn&rsquo;t be bound automatically (no email or
            a shared email with another customer). Bind them to your internal
            user IDs to make portal, checkout, and feature gates work for
            these users.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="manual" className="mt-6">
          <TabsList>
            <TabsTrigger value="manual">Resolve manually</TabsTrigger>
            <TabsTrigger value="backend">From your backend</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-4">
            <ManualResolveTab
              organizationId={organizationId}
              stuck={job.stuck_customers}
            />
          </TabsContent>

          <TabsContent value="backend" className="mt-4">
            <BackendResolveTab />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function ManualResolveTab({
  organizationId,
  stuck,
}: {
  organizationId: string
  stuck: MigrationJob['stuck_customers']
}) {
  const { toast } = useToast()
  const bind = useManualBindCustomer(organizationId)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  if (stuck.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing left to resolve.
      </p>
    )
  }

  const handleBind = async (customerId: string) => {
    const externalId = drafts[customerId]?.trim()
    if (!externalId) return
    try {
      await bind.mutateAsync({
        customer_id: customerId,
        external_id: externalId,
      })
      setDoneIds((s) => new Set(s).add(customerId))
      toast({
        title: 'Customer bound',
        description: `external_id = ${externalId}`,
      })
    } catch (e) {
      toast({
        title: 'Bind failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead className="w-28">Reason</TableHead>
            <TableHead className="w-64">External ID (your user ID)</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {stuck.map((c) => {
            const done = doneIds.has(c.customer_id)
            return (
              <TableRow key={c.customer_id} className={done ? 'opacity-50' : ''}>
                <TableCell>
                  <div className="text-sm font-medium">
                    {c.name || c.email || c.stripe_customer_id}
                  </div>
                  <div className="text-muted-foreground font-mono text-xs">
                    {c.stripe_customer_id}
                    {c.email ? ` · ${c.email}` : ''}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {c.reason === 'no_email'
                      ? 'No email'
                      : c.reason === 'email_collision'
                        ? 'Email shared'
                        : 'Manual'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="user_123"
                    value={drafts[c.customer_id] ?? ''}
                    onChange={(e) =>
                      setDrafts((s) => ({
                        ...s,
                        [c.customer_id]: e.target.value,
                      }))
                    }
                    disabled={done}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    onClick={() => handleBind(c.customer_id)}
                    disabled={done || !drafts[c.customer_id] || bind.isPending}
                  >
                    {done ? 'Bound' : 'Bind'}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="text-muted-foreground flex items-start gap-2 text-xs">
        <Alert01Icon size={14} className="mt-0.5 shrink-0" />
        <span>
          External IDs are immutable once set. Double-check before binding.
          The page reflects fresh state after the next import — bound
          customers stop appearing here as soon as they hit the SDK.
        </span>
      </div>
    </div>
  )
}

function BackendResolveTab() {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        For larger sets of unbound customers, resolve them from your backend
        using a script. The BillingOS Node SDK exposes two methods that pair
        with this drawer:
      </p>
      <CodeBlock
        language="typescript"
        code={`import { BillingOS } from '@billingos/node'

const billing = new BillingOS({ apiKey: process.env.BILLINGOS_API_KEY! })

// 1. Pull every customer that doesn't have an external_id yet.
const { customers } = await billing.listUnresolvedCustomers()

// 2. Look each one up in your own DB by email and bind.
for (const c of customers) {
  if (!c.email) continue
  const user = await db.users.findByEmail(c.email)
  if (user) {
    await billing.bindCustomer(c.id, user.id)
  }
}`}
      />
      <p className="text-muted-foreground text-xs">
        Available in <code className="font-mono">@billingos/node</code>{' '}
        ≥&nbsp;next release. Use a server-side <code>sk_live_*</code> /{' '}
        <code>sk_test_*</code> key — never expose it to the browser.
      </p>
    </div>
  )
}
