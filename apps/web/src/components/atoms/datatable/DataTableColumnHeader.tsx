import { Column } from '@tanstack/react-table'

import { ArrowDown01Icon, ArrowUp01Icon } from 'hugeicons-react'
import { twMerge } from 'tailwind-merge'
import Button from '../Button'

interface DataTableColumnHeaderProps<
  TData,
  TValue,
> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={className}>{title}</div>
  }

  return (
    <div className={twMerge('flex items-center', className)}>
      <Button
        type="button"
        variant="ghost"
        className="p-0 hover:bg-transparent dark:hover:bg-transparent"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        <span>{title}</span>
        {column.getIsSorted() === 'desc' ? (
          <ArrowDown01Icon size={16} className="ml-2" />
        ) : column.getIsSorted() === 'asc' ? (
          <ArrowUp01Icon size={16} className="ml-2" />
        ) : null}
      </Button>
    </div>
  )
}
