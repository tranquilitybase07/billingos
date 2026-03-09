'use client'

import { ArrowLeft01Icon, ArrowRight01Icon } from 'hugeicons-react'
import { Button } from '@/components/ui/button'
import { PropsWithChildren } from 'react'

interface PaginationProps extends PropsWithChildren {
  totalCount: number
  pageSize: number
  currentPage: number
  siblingCount?: number
  onPageChange: (page: number) => void
  className?: string
  currentURL?: URLSearchParams
}

const Pagination = ({
  children,
  totalCount,
  pageSize,
  currentPage,
  onPageChange,
  className = '',
}: PaginationProps) => {
  const totalPages = Math.ceil(totalCount / pageSize)

  if (totalPages <= 1) {
    return <div className="flex flex-col">{children}</div>
  }

  return (
    <div className="flex flex-col gap-y-8">
      <div className="flex flex-col">{children}</div>
      <div className={`flex items-center justify-center gap-2 ${className}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ArrowLeft01Icon size={16} />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Next
          <ArrowRight01Icon size={16} />
        </Button>
      </div>
    </div>
  )
}

export default Pagination
