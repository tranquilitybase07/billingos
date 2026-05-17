'use client'

import {
  Cell,
  ColumnDef,
  OnChangeFn,
  PaginationState,
  Row,
  RowSelectionState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import React from 'react'
import { twMerge } from 'tailwind-merge'
import { DataTablePagination } from './DataTablePagination'

export interface ReactQueryLoading {
  isFetching: boolean
  isFetched: boolean
  isLoading: boolean
  status: string
  fetchStatus: string
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  rowCount?: number
  pageCount?: number
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  getSubRows?: (row: TData) => TData[] | undefined
  className?: string
  wrapperClassName?: string
  headerClassName?: string
  isLoading: boolean | ReactQueryLoading
  getCellColSpan?: (cell: Cell<TData, unknown>) => number
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string
  rowSelection?: RowSelectionState
  enableRowSelection?: boolean
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  onRowClick?: (row: Row<TData>) => void
  /** Optional component shown when data is empty */
  emptyState?: React.ReactNode
}

export type DataTableColumnDef<TData, TValue = unknown> = ColumnDef<
  TData,
  TValue
>

export type DataTablePaginationState = PaginationState
export type DataTableSortingState = SortingState

const queryIsDisabled = (s: ReactQueryLoading): boolean => {
  if (s.status === 'pending' && s.fetchStatus === 'idle') {
    return true
  }
  return false
}

export function DataTable<TData, TValue>({
  columns,
  data,
  rowCount,
  pageCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  getSubRows,
  className,
  wrapperClassName,
  headerClassName,
  isLoading,
  getCellColSpan,
  getRowId,
  rowSelection,
  enableRowSelection,
  onRowSelectionChange,
  onRowClick,
  emptyState,
}: DataTableProps<TData, TValue>) {
  // eslint-disable-next-line react-hooks/incompatible-library -- tanstack/react-table is compatible, false positive
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount,
    pageCount,
    onPaginationChange,
    onSortingChange,
    getSubRows,
    getExpandedRowModel: getExpandedRowModel(),
    getRowId,
    enableRowSelection,
    onRowSelectionChange,
    enableMultiRowSelection: false,
    state: {
      pagination,
      sorting,
      rowSelection,
    },
  })

  const calcLoading =
    typeof isLoading === 'boolean'
      ? isLoading
      : (!isLoading.isFetched || isLoading.isLoading) &&
        !queryIsDisabled(isLoading)

  const skeletonRows = 5

  return (
    <div className={twMerge('flex flex-col gap-6', className)}>
      <div
        className={twMerge(
          'overflow-hidden',
          wrapperClassName,
        )}
      >
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className={twMerge('bg-transparent hover:bg-transparent border-border/40', headerClassName)}
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.column.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {calcLoading ? (
              // Skeleton rows matching column count
              Array.from({ length: skeletonRows }).map((_, rowIdx) => (
                <TableRow key={rowIdx} className="hover:bg-transparent">
                  {columns.map((_, colIdx) => (
                    <TableCell key={colIdx}>
                      <Skeleton className="h-4 w-full max-w-[180px]" style={{ opacity: 0.5 + (colIdx % 3) * 0.15 }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={twMerge(
                        'group transition-colors',
                        enableRowSelection || onRowClick
                          ? row.getCanSelect()
                            ? 'cursor-pointer'
                            : ''
                          : undefined,
                      )}
                      data-state={
                        enableRowSelection
                          ? row.getIsSelected()
                            ? 'selected'
                            : undefined
                          : undefined
                      }
                      onClick={
                        onRowClick
                          ? () => onRowClick(row)
                          : enableRowSelection
                            ? row.getToggleSelectedHandler()
                            : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => {
                        const colSpan = getCellColSpan
                          ? getCellColSpan(cell)
                          : 1

                        return (
                          <React.Fragment key={cell.id}>
                            {colSpan ? (
                              <TableCell
                                colSpan={colSpan}
                                style={{ width: cell.column.getSize() }}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </TableCell>
                            ) : null}
                          </React.Fragment>
                        )
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={columns.length}
                      className="p-0"
                    >
                      {emptyState ?? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <p className="text-sm text-muted-foreground">No results found</p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
      {pagination ? <DataTablePagination table={table} /> : null}
    </div>
  )
}
