'use client'

import Link from 'next/link'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useTopCustomers } from '@/hooks/queries/analytics'
import { orgPath } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function TopCustomersCard() {
  const { organization } = useOrganization()
  const { data, isLoading } = useTopCustomers(organization.id, 5)

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(cents / 100)

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Top Customers</CardTitle>
        <Link href={orgPath(organization.slug, '/customers')}>
          <Button variant="ghost" size="sm" className="text-xs">
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-1/2 mb-1" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : !data?.data.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No customer data yet.
          </p>
        ) : (
          <div className="space-y-3">
            {data.data.map((customer) => (
              <div
                key={customer.customer_id}
                className="flex items-center gap-3"
              >
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                  {customer.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {customer.name || customer.email.split('@')[0]}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {customer.email}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums whitespace-nowrap">
                  {formatCurrency(customer.total_revenue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
