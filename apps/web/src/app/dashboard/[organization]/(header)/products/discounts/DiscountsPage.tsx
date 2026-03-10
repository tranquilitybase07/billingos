'use client'

import CopyToClipboardButton from '@/components/CopyToClipboardButton/CopyToClipboardButton'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { CreateDiscountModalContent } from '@/components/Discounts/CreateDiscountModalContent'
import { EditDiscountModalContent } from '@/components/Discounts/EditDiscountModalContent'
import { DataTable, DataTableColumnDef, DataTableColumnHeader } from '@/components/atoms/datatable'
import { useDiscounts, useDeleteDiscount } from '@/hooks/queries'
import {
  DataTablePaginationState,
  DataTableSortingState,
  getAPIParams,
} from '@/utils/datatable'
import { getDiscountDisplay, Discount } from '@/utils/discount'
import { PlusSignIcon, MoreVerticalIcon, Search01Icon, DiscountTag01Icon } from 'hugeicons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import FormattedDateTime from '@/components/FormattedDateTime/FormattedDateTime'
import { useToast } from '@/hooks/use-toast'
import type { SortingState } from '@tanstack/react-table'
import React, { useCallback, useMemo, useState } from 'react'

interface ClientPageProps {
  organizationId: string
  pagination: DataTablePaginationState
  sorting: DataTableSortingState
  query: string | undefined
}

const ClientPage: React.FC<ClientPageProps> = ({
  organizationId,
  pagination,
  sorting: serverSorting,
  query: _query,
}) => {
  const [query, setQuery] = useState(_query || '')
  const [debouncedQuery, setDebouncedQuery] = useState(_query || '')
  const [sorting, setSorting] = useState<SortingState>(serverSorting as SortingState)
  const { toast } = useToast()

  // Debounce search query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleCopyDiscountId = useCallback(
    (discount: Discount) => () => {
      if (typeof navigator !== 'undefined') {
        navigator.clipboard.writeText(discount.id)
      }
    },
    [],
  )

  const deleteDiscount = useDeleteDiscount()

  const [discountToDelete, setDiscountToDelete] = useState<Discount>()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [discountToEdit, setDiscountToEdit] = useState<Discount>()
  const [showEditModal, setShowEditModal] = useState(false)

  const handleDeleteDiscount = useCallback(async () => {
    if (!discountToDelete) return

    const { error } = await deleteDiscount.mutateAsync(discountToDelete)
    if (error) {
      return
    }
    toast({
      title: 'Coupon Deleted',
      description: `Coupon ${discountToDelete.name} successfully deleted`,
    })
    setShowDeleteModal(false)
  }, [discountToDelete, deleteDiscount, toast])

  const discountsHook = useDiscounts(organizationId, {
    ...getAPIParams(pagination, serverSorting),
    query: debouncedQuery || undefined,
  })

  const discounts = useMemo(
    () => discountsHook.data?.items ?? [],
    [discountsHook.data?.items],
  )
  const sortedDiscounts = useMemo(() => {
    const list = [...discounts]
    if (sorting.length === 0) return list

    const { id, desc } = sorting[0]
    list.sort((a, b) => {
      let valueA: string | number = ''
      let valueB: string | number = ''

      switch (id) {
        case 'name':
          valueA = a.name || ''
          valueB = b.name || ''
          break
        case 'code':
          valueA = a.code || ''
          valueB = b.code || ''
          break
        case 'amount':
          valueA = getDiscountDisplay(a)
          valueB = getDiscountDisplay(b)
          break
        case 'redemptions':
          valueA = a.redemptions_count || 0
          valueB = b.redemptions_count || 0
          break
        case 'created_at':
          valueA = new Date(a.created_at).getTime()
          valueB = new Date(b.created_at).getTime()
          break
        default:
          break
      }

      if (valueA < valueB) return desc ? 1 : -1
      if (valueA > valueB) return desc ? -1 : 1
      return 0
    })

    return list
  }, [discounts, sorting])

  const [showNewModal, setShowNewModal] = useState(false)
  const columns: DataTableColumnDef<Discount>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row: { original: discount } }) => (
        <span>{discount.name}</span>
      ),
    },
    {
      accessorKey: 'code',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Code" />
      ),
      cell: ({ row: { original: discount } }) => (
        <>
          {discount.code ? (
            <div className="flex flex-row items-center gap-1 font-mono">
              <div>{discount.code}</div>
              <div>
                <CopyToClipboardButton
                  text={discount.code}
                  onCopy={() => {
                    toast({
                      title: 'Copied To Clipboard',
                      description: 'Coupon code was copied to clipboard',
                    })
                  }}
                />
              </div>
            </div>
          ) : (
            '—'
          )}
        </>
      ),
    },
    {
      id: 'amount',
      accessorFn: (discount) => getDiscountDisplay(discount),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row: { original: discount } }) => (
        <span>{getDiscountDisplay(discount)}</span>
      ),
    },
    {
      id: 'redemptions',
      accessorFn: (discount) => discount.redemptions_count || 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Redemptions" />
      ),
      cell: ({ row: { original: discount } }) => (
        <span>
          {discount.redemptions_count}
          {discount.max_redemptions ? `/${discount.max_redemptions}` : ''}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created At" />
      ),
      cell: ({ row: { original: discount } }) => (
        <FormattedDateTime
          datetime={discount.created_at}
          resolution="day"
        />
      ),
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row: { original: discount } }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-50 transition-opacity hover:opacity-100"
              >
                <MoreVerticalIcon size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                setDiscountToEdit(discount)
                setShowEditModal(true)
              }}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyDiscountId(discount)}>
                Copy Coupon ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setDiscountToDelete(discount)
                  setShowDeleteModal(true)
                }}
                className="text-destructive focus:text-destructive"
              >
                Delete Coupon
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <DashboardBody wide>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold">Coupons</h1>
          <p className="text-muted-foreground">Manage coupon codes and redemptions</p>
        </div>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-64">
            <Search01Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search Coupons"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button
            type="button"
            className="flex flex-row items-center gap-x-2"
            onClick={() => setShowNewModal(true)}
          >
            <PlusSignIcon size={16} />
            <span>New Coupon</span>
          </Button>
        </div>
        {discountsHook.isLoading || discounts.length > 0 ? (
          <DataTable
            data={sortedDiscounts}
            columns={columns}
            isLoading={discountsHook.isLoading}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-y-6 rounded-lg border bg-card py-48 shadow-sm">
            <DiscountTag01Icon size={48} className="text-muted-foreground/30" />
            <div className="flex flex-col items-center gap-y-6">
              <div className="flex flex-col items-center gap-y-2">
                <h3 className="text-lg font-medium">No coupons found</h3>
                <p className="text-muted-foreground">
                  Create coupon codes to offer special pricing
                </p>
              </div>
              <Button onClick={() => setShowNewModal(true)} variant="secondary">
                <span>Create Coupon</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Coupon Modal */}
      <InlineModal
        isShown={showNewModal}
        hide={() => setShowNewModal(false)}
        modalContent={
          <CreateDiscountModalContent
            organizationId={organizationId}
            onDiscountCreated={() => setShowNewModal(false)}
            hideModal={() => setShowNewModal(false)}
          />
        }
      />

      {/* Edit Coupon Modal */}
      <InlineModal
        isShown={showEditModal}
        hide={() => setShowEditModal(false)}
        modalContent={
          discountToEdit ? (
            <EditDiscountModalContent
              organizationId={organizationId}
              discount={discountToEdit}
              onDiscountUpdated={() => setShowEditModal(false)}
              hideModal={() => setShowEditModal(false)}
            />
          ) : <></>
        }
      />

      <AlertDialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Coupon</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the coupon &quot;{discountToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDiscount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardBody>
  )
}

export default ClientPage
