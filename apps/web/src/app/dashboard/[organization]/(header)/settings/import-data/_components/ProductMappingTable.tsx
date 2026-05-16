'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { Product } from '@/hooks/queries/products'
import type { ImportPreview } from '@/hooks/queries/import'

interface Props {
  preview: ImportPreview
  products: Product[]
  // Map: stripe_product_id → bos_product_id (or empty string if unmapped)
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
}

// One row per Stripe product. Merchant picks a BOS product on the right.
// Active subscription count is shown as a hint so they can match priority.
export function ProductMappingTable({
  preview,
  products,
  value,
  onChange,
}: Props) {
  if (preview.productsList.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No active products in your Stripe account.
      </p>
    )
  }

  const handleSelect = (stripeProductId: string, bosProductId: string) => {
    onChange({ ...value, [stripeProductId]: bosProductId })
  }

  // Only current-version, non-archived BOS products are eligible.
  const eligible = products.filter(
    (p) => !p.is_archived && p.version_status !== 'superseded',
  )

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Stripe product</TableHead>
          <TableHead className="w-32 text-right">Active subs</TableHead>
          <TableHead className="w-72">BillingOS product</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {preview.productsList.map((p) => (
          <TableRow key={p.stripe_product_id}>
            <TableCell>
              <div className="font-medium">{p.name}</div>
              <div className="text-muted-foreground font-mono text-xs">
                {p.stripe_product_id}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <Badge variant="outline">{p.active_subscriptions}</Badge>
            </TableCell>
            <TableCell>
              <Select
                value={value[p.stripe_product_id] ?? ''}
                onValueChange={(v) => handleSelect(p.stripe_product_id, v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a BillingOS product" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((bos) => (
                    <SelectItem key={bos.id} value={bos.id}>
                      {bos.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
