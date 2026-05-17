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
  const headerClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60'

  if (!column.getCanSort()) {
    return <div className={twMerge(headerClass, className)}>{title}</div>
  }

  return (
    <div className={twMerge('flex items-center', className)}>
      <Button
        type="button"
        variant="ghost"
        className={twMerge('p-0 hover:bg-transparent dark:hover:bg-transparent', headerClass)}
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
