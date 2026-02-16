'use client'

import CopyToClipboardButton from '@/components/CopyToClipboardButton/CopyToClipboardButton'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { CreateDiscountModalContent } from '@/components/Discounts/CreateDiscountModalContent'
import { EditDiscountModalContent } from '@/components/Discounts/EditDiscountModalContent'
import { useDiscounts, useDeleteDiscount } from '@/hooks/queries'
import {
  DataTablePaginationState,
  DataTableSortingState,
  getAPIParams,
  serializeSearchParams,
} from '@/utils/datatable'
import { getDiscountDisplay, Discount } from '@/utils/discount'
import { Add as AddOutlined, MoreVert as MoreVertOutlined, Search, Discount as DiscountOutlined } from '@mui/icons-material'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { useRouter } from 'next/navigation'
import React, { useCallback, useState } from 'react'

interface ClientPageProps {
  organizationId: string
  organizationSlug: string
  pagination: DataTablePaginationState
  sorting: DataTableSortingState
  query: string | undefined
}

const ClientPage: React.FC<ClientPageProps> = ({
  organizationId,
  organizationSlug,
  pagination,
  sorting,
  query: _query,
}) => {
  const router = useRouter()
  const [query, setQuery] = useState(_query || '')
  const [debouncedQuery, setDebouncedQuery] = useState(_query || '')
  const { toast } = useToast()

  // Debounce search query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const getSearchParams = (
    pagination: DataTablePaginationState,
    sorting: DataTableSortingState,
    query: string | undefined,
  ) => {
    const params = serializeSearchParams(pagination, sorting)

    if (query) {
      params.append('query', query)
    }

    return params
  }

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
      title: 'Discount Deleted',
      description: `Discount ${discountToDelete.name} successfully deleted`,
    })
    setShowDeleteModal(false)
  }, [discountToDelete, deleteDiscount, toast])

  const discountsHook = useDiscounts(organizationId, {
    ...getAPIParams(pagination, sorting),
    query: debouncedQuery || undefined,
  })

  const discounts = discountsHook.data?.items || []


  const [showNewModal, setShowNewModal] = useState(false)

  return (
    <DashboardBody wide>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search Discounts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button
            type="button"
            className="flex flex-row items-center gap-x-2"
            onClick={() => setShowNewModal(true)}
          >
            <AddOutlined className="h-4 w-4" />
            <span>New Discount</span>
          </Button>
        </div>
        {discounts.length > 0 ? (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Redemptions</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discounts.map((discount) => (
                  <TableRow key={discount.id}>
                    <TableCell>{discount.name}</TableCell>
                    <TableCell>
                      {discount.code ? (
                        <div className="flex flex-row items-center gap-1 font-mono">
                          <div>{discount.code}</div>
                          <div>
                            <CopyToClipboardButton
                              text={discount.code}
                              onCopy={() => {
                                toast({
                                  title: 'Copied To Clipboard',
                                  description: `Discount Code was copied to clipboard`,
                                })
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{getDiscountDisplay(discount)}</TableCell>
                    <TableCell>
                      {discount.redemptions_count}
                      {discount.max_redemptions ? `/${discount.max_redemptions}` : ''}
                    </TableCell>
                    <TableCell>
                      <FormattedDateTime
                        datetime={discount.created_at}
                        resolution="day"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-50 transition-opacity hover:opacity-100"
                          >
                            <MoreVertOutlined />
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
                            Copy Discount ID
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setDiscountToDelete(discount)
                              setShowDeleteModal(true)
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            Delete Discount
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-y-6 rounded-lg border bg-card py-48 shadow-sm">
            <DiscountOutlined className="text-5xl text-muted-foreground/30" />
            <div className="flex flex-col items-center gap-y-6">
              <div className="flex flex-col items-center gap-y-2">
                <h3 className="text-lg font-medium">No discounts found</h3>
                <p className="text-muted-foreground">
                  Create discount codes to offer special pricing
                </p>
              </div>
              <Button onClick={() => setShowNewModal(true)} variant="secondary">
                <span>Create Discount</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Discount Modal */}
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

      {/* Edit Discount Modal */}
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
            <AlertDialogTitle>Delete Discount</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the discount &quot;{discountToDelete?.name}&quot;? This action cannot be undone.
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
