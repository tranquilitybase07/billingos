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
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Autorenew, X, CalendarMonth as CalendarIcon, Search } from '@mui/icons-material'
import { format } from 'date-fns'
import { useState } from 'react'
import { Discount } from '@/utils/discount'
import { useProducts } from '@/hooks/queries/products'

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
  product_ids?: string[]
  starts_at?: string
  ends_at?: string
}

const safeParseInt = (val: string) => {
  const parsed = parseInt(val)
  return isNaN(parsed) ? undefined : parsed
}

interface DiscountFormProps {
  organizationId?: string
  initialData?: Partial<Discount>
  onSubmit: (data: DiscountFormData) => Promise<void>
  onCancel: () => void
  isUpdate?: boolean
  isSubmitting?: boolean
}

export function DiscountForm({
  organizationId,
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
  const [amount, setAmount] = useState(
    initialData?.amount ? (initialData.amount / 100).toString() : '',
  )
  const [basisPoints, setBasisPoints] = useState(
    initialData?.basis_points?.toString() || '',
  )
  const [currency, setCurrency] = useState(initialData?.currency || 'USD')
  const [duration, setDuration] = useState<'once' | 'forever' | 'repeating'>(
    initialData?.duration || 'once',
  )
  const [durationInMonths, setDurationInMonths] = useState(
    initialData?.duration_in_months?.toString() || '',
  )
  const [maxRedemptions, setMaxRedemptions] = useState(
    initialData?.max_redemptions?.toString() || '',
  )
  const [productScope, setProductScope] = useState('all')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    initialData?.product_ids || [],
  )
  const [productSearch, setProductSearch] = useState('')
  const [startsAt, setStartsAt] = useState<Date | undefined>(
    initialData?.starts_at ? new Date(initialData.starts_at) : undefined,
  )
  const [endsAt, setEndsAt] = useState<Date | undefined>(
    initialData?.ends_at ? new Date(initialData.ends_at) : undefined,
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const handleStartDateChange = (date: Date | undefined) => {
    setStartsAt(date)
    // If end date is before new start date, reset it
    if (date && endsAt && endsAt < date) {
      setEndsAt(undefined)
    }
  }

  // Fetch products from catalog
  const { data: productsData, isLoading: isLoadingProducts } = useProducts(
    organizationId || '',
    {
      limit: 100, // Fetch all products for the picker (simplified)
    },
  )

  const products = productsData?.items || []
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase()),
  )

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId)
      }
      return [...prev, productId]
    })
  }

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
          ? safeParseInt(durationInMonths)
          : undefined,
      max_redemptions: maxRedemptions ? safeParseInt(maxRedemptions) : undefined,
      starts_at: startsAt?.toISOString(),
      ends_at: endsAt?.toISOString(),
    }

    if (type === 'percentage') {
      data.basis_points = basisPoints ? safeParseInt(basisPoints) : undefined
    } else {
      data.amount = amount ? Math.round(parseFloat(amount) * 100) : undefined
      data.currency = currency
    }

    data.product_ids = selectedProductIds

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
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
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
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="pl-7"
                  required
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      {selectedProductIds.length === 0
                        ? 'All products'
                        : `${selectedProductIds.length} product${selectedProductIds.length > 1 ? 's' : ''}`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    {/* Search */}
                    <div className="border-b p-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search products..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="h-8 pl-8 text-sm"
                        />
                      </div>
                    </div>

                    {/* Deselect all header */}
                    {selectedProductIds.length > 0 && (
                      <div className="flex items-center justify-between border-b px-3 py-2">
                        <span className="text-sm font-medium">
                          {selectedProductIds.length} selected
                        </span>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedProductIds([])}
                        >
                          Deselect all
                        </button>
                      </div>
                    )}

                    {/* Product list */}
                    <div className="max-h-52 overflow-y-auto">
                      {isLoadingProducts ? (
                        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                          Loading products...
                        </div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                          No products found
                        </div>
                      ) : (
                        filteredProducts.map((product) => {
                          const isSelected = selectedProductIds.includes(product.id)
                          return (
                            <button
                              type="button"
                              key={product.id}
                              className={`flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/10' : ''
                                }`}
                              onClick={() => toggleProduct(product.id)}
                            >
                              <span className={isSelected ? 'font-medium' : ''}>
                                {product.name}
                                {product.version && (
                                  <span className="ml-1.5 text-xs text-muted-foreground">
                                    v{product.version}
                                  </span>
                                )}
                              </span>
                              {isSelected && (
                                <svg
                                  className="h-4 w-4 text-primary"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  {selectedProductIds.length === 0
                    ? 'Discount applies to all products.'
                    : `Only the ${selectedProductIds.length} selected product${selectedProductIds.length > 1 ? 's' : ''} will be eligible.`}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Starts at</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startsAt ? format(startsAt, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startsAt}
                      onSelect={handleStartDateChange}
                      disabled={{ before: today }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Ends at</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endsAt ? format(endsAt, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endsAt}
                      onSelect={setEndsAt}
                      disabled={{ before: startsAt || today }}
                    />
                  </PopoverContent>
                </Popover>
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
