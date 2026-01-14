'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Autorenew, X } from '@mui/icons-material'
import { useState } from 'react'

interface DiscountFormData {
  name: string
  code?: string
  type: 'percentage' | 'fixed'
  basis_points?: number
  amount?: number
  currency?: string
  duration: 'once' | 'forever' | 'repeating'
  duration_in_months?: number
  max_redemptions?: number
}

interface DiscountFormProps {
  initialData?: Partial<DiscountFormData>
  onSubmit: (data: DiscountFormData) => Promise<void>
  onCancel: () => void
  isUpdate?: boolean
  isSubmitting?: boolean
}

export function DiscountForm({
  initialData,
  onSubmit,
  onCancel,
  isUpdate = false,
  isSubmitting = false,
}: DiscountFormProps) {
  const [name, setName] = useState(initialData?.name || '')
  const [code, setCode] = useState(initialData?.code || '')
  const [type, setType] = useState<'percentage' | 'fixed'>(
    initialData?.type || 'percentage',
  )
  const [basisPoints, setBasisPoints] = useState(
    initialData?.basis_points?.toString() || '',
  )
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '')
  const [currency, setCurrency] = useState(initialData?.currency || 'usd')
  const [duration, setDuration] = useState<'once' | 'forever' | 'repeating'>(
    initialData?.duration || 'once',
  )
  const [durationInMonths, setDurationInMonths] = useState(
    initialData?.duration_in_months?.toString() || '',
  )
  const [maxRedemptions, setMaxRedemptions] = useState(
    initialData?.max_redemptions?.toString() || '',
  )

  const generateCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    setCode(result)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: DiscountFormData = {
      name,
      code: code || undefined,
      type,
      duration,
      duration_in_months:
        duration === 'repeating' && durationInMonths
          ? parseInt(durationInMonths)
          : undefined,
      max_redemptions: maxRedemptions ? parseInt(maxRedemptions) : undefined,
    }

    if (type === 'percentage') {
      data.basis_points = basisPoints ? parseInt(basisPoints) : undefined
    } else {
      data.amount = amount ? parseInt(amount) : undefined
      data.currency = currency
    }

    await onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="Summer Sale"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Displayed to customers when they apply the discount
          </p>
        </div>

        {/* Code */}
        <div className="space-y-2">
          <Label htmlFor="code">
            Code <span className="text-muted-foreground">(optional)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="code"
              placeholder="SUMMER2024"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={generateCode}
              title="Generate code"
            >
              <Autorenew className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave empty to apply through Checkout Link or API only
          </p>
        </div>

        {/* Discount Type */}
        {!isUpdate && (
          <div className="space-y-2">
            <Label>
              Discount Type <span className="text-destructive">*</span>
            </Label>
            <Tabs value={type} onValueChange={(v) => setType(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="percentage">Percentage</TabsTrigger>
                <TabsTrigger value="fixed">Fixed Amount</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Amount Fields */}
        {type === 'percentage' ? (
          <div className="space-y-2">
            <Label htmlFor="basisPoints">
              Percentage <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="basisPoints"
                type="number"
                placeholder="10"
                value={basisPoints}
                onChange={(e) => setBasisPoints(e.target.value)}
                min="1"
                max="100"
                step="0.01"
                required
                disabled={isUpdate}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
            {isUpdate && (
              <p className="text-xs text-muted-foreground">
                The percentage cannot be changed once the discount has been
                redeemed by a customer.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="amount">
              Amount <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="10.00"
                  value={amount ? (parseInt(amount) / 100).toFixed(2) : ''}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) * 100
                    setAmount(value ? value.toString() : '')
                  }}
                  min="0.01"
                  step="0.01"
                  className="pl-7"
                  required
                  disabled={isUpdate}
                />
              </div>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usd">USD</SelectItem>
                  <SelectItem value="eur">EUR</SelectItem>
                  <SelectItem value="gbp">GBP</SelectItem>
                  <SelectItem value="cad">CAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isUpdate && (
              <p className="text-xs text-muted-foreground">
                The amount cannot be changed once the discount has been redeemed
                by a customer.
              </p>
            )}
          </div>
        )}

        {/* Recurring Options */}
        <Accordion type="single" collapsible>
          <AccordionItem value="recurring">
            <AccordionTrigger>Recurring options</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <Select
                  value={duration}
                  onValueChange={(v) => setDuration(v as any)}
                  disabled={isUpdate}
                >
                  <SelectTrigger id="duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                    <SelectItem value="repeating">Repeating</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {duration === 'once' &&
                    'Applied once on the first invoice'}
                  {duration === 'forever' &&
                    'Applied on every invoice'}
                  {duration === 'repeating' &&
                    `Applied for the first ${durationInMonths || 'X'} month(s)`}
                </p>
              </div>

              {duration === 'repeating' && (
                <div className="space-y-2">
                  <Label htmlFor="durationInMonths">Duration in Months</Label>
                  <Input
                    id="durationInMonths"
                    type="number"
                    placeholder="3"
                    value={durationInMonths}
                    onChange={(e) => setDurationInMonths(e.target.value)}
                    min="1"
                    disabled={isUpdate}
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Restrictions */}
          <AccordionItem value="restrictions">
            <AccordionTrigger>Restrictions</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="maxRedemptions">Maximum Redemptions</Label>
                <Input
                  id="maxRedemptions"
                  type="number"
                  placeholder="Unlimited"
                  value={maxRedemptions}
                  onChange={(e) => setMaxRedemptions(e.target.value)}
                  min="1"
                />
                <p className="text-xs text-muted-foreground">
                  Limit applies across all customers, not per customer
                </p>
              </div>

              <div className="space-y-2">
                <Label>Products</Label>
                <div className="rounded-lg border bg-muted/50 p-4">
                  <p className="text-sm text-muted-foreground">
                    Product selector coming soon. Discount will apply to all
                    products by default.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Footer Actions */}
      <div className="flex shrink-0 items-center justify-end gap-3 border-t px-8 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !name}>
          {isSubmitting
            ? isUpdate
              ? 'Updating...'
              : 'Creating...'
            : isUpdate
              ? 'Update Discount'
              : 'Create Discount'}
        </Button>
      </div>
    </form>
  )
}
