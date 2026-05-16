'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Loading03Icon, Alert01Icon } from 'hugeicons-react'
import { useToast } from '@/hooks/use-toast'
import {
  useImportPreview,
  useSaveMappings,
  useStartImport,
} from '@/hooks/queries/import'
import { useProducts } from '@/hooks/queries/products'
import { ProductMappingTable } from './ProductMappingTable'

interface Props {
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type WizardStep = 'preview' | 'mapping' | 'starting'

// 3-step wizard. The dialog stays minimal — once the worker is running, the
// parent page swaps to MigrationProgress (the dialog closes on success).
export function ImportWizard({ organizationId, open, onOpenChange }: Props) {
  const { toast } = useToast()
  const [step, setStep] = useState<WizardStep>('preview')
  const [mappings, setMappings] = useState<Record<string, string>>({})

  const preview = useImportPreview(organizationId, { enabled: open })
  const { data: productsResponse, isLoading: productsLoading } = useProducts(
    organizationId,
    { is_archived: false, limit: 100 },
  )
  const products = productsResponse?.items ?? []
  const saveMappings = useSaveMappings(organizationId)
  const startImport = useStartImport(organizationId)

  // Reset state whenever the wizard closes so re-opening is fresh.
  useEffect(() => {
    if (!open) {
      setStep('preview')
      setMappings({})
    }
  }, [open])

  const unmappedCount = useMemo(() => {
    if (!preview.data) return 0
    return preview.data.productsList.filter((p) => !mappings[p.stripe_product_id])
      .length
  }, [preview.data, mappings])

  const handleNext = () => {
    if (step === 'preview') setStep('mapping')
  }

  const handleStart = async () => {
    if (!preview.data) return
    setStep('starting')
    try {
      const mappingList = Object.entries(mappings)
        .filter(([, bosId]) => !!bosId)
        .map(([stripe_product_id, bos_product_id]) => ({
          stripe_product_id,
          bos_product_id,
        }))

      if (mappingList.length > 0) {
        await saveMappings.mutateAsync(mappingList)
      }
      await startImport.mutateAsync()
      toast({
        title: 'Import started',
        description:
          'Your customers and subscriptions are being imported in the background.',
      })
      onOpenChange(false)
    } catch (e) {
      toast({
        title: 'Failed to start import',
        description: (e as Error).message,
        variant: 'destructive',
      })
      setStep('mapping')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'preview' && 'Import from Stripe'}
            {step === 'mapping' && 'Map your products'}
            {step === 'starting' && 'Starting import…'}
          </DialogTitle>
          <DialogDescription>
            {step === 'preview' &&
              'We scanned your connected Stripe account. Here&rsquo;s what we found.'}
            {step === 'mapping' &&
              'Match each Stripe product to a BillingOS product. Subscriptions whose product is unmapped will be skipped — you can re-run later after mapping them.'}
            {step === 'starting' &&
              'Saving mappings and queuing the migration job.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'preview' && (
          <PreviewStep preview={preview} />
        )}

        {step === 'mapping' &&
          (preview.isLoading || productsLoading || !preview.data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-4">
              <ProductMappingTable
                preview={preview.data}
                products={products}
                value={mappings}
                onChange={setMappings}
              />
              {unmappedCount > 0 && (
                <Alert>
                  <Alert01Icon size={16} />
                  <AlertTitle>
                    {unmappedCount} product{unmappedCount === 1 ? '' : 's'} not
                    mapped
                  </AlertTitle>
                  <AlertDescription>
                    Subscriptions on unmapped products will be skipped. You can
                    create the missing BillingOS products and re-run the
                    import.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ))}

        {step === 'starting' && (
          <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
            <Loading03Icon size={16} className="animate-spin" />
            Saving mappings…
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleNext}
                disabled={preview.isLoading || !preview.data}
              >
                Next: map products
              </Button>
            </>
          )}
          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button
                onClick={handleStart}
                disabled={
                  saveMappings.isPending ||
                  startImport.isPending ||
                  !preview.data
                }
              >
                {unmappedCount === preview.data?.productsList.length
                  ? 'Skip mapping & migrate'
                  : 'Migrate'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewStep({
  preview,
}: {
  preview: ReturnType<typeof useImportPreview>
}) {
  if (preview.isLoading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }

  if (preview.isError) {
    return (
      <Alert variant="destructive">
        <Alert01Icon size={16} />
        <AlertTitle>Couldn&rsquo;t fetch preview</AlertTitle>
        <AlertDescription>
          {(preview.error as Error)?.message ?? 'Unknown error.'}
        </AlertDescription>
      </Alert>
    )
  }

  if (!preview.data) return null

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Customers" value={preview.data.customers} />
      <Stat label="Products" value={preview.data.products} />
      <Stat label="Prices" value={preview.data.prices} />
      <Stat label="Subscriptions" value={preview.data.subscriptions} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded-md border p-4">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground mt-1 text-sm">{label}</div>
    </div>
  )
}
