import React, { PropsWithChildren } from 'react'
import { twMerge } from 'tailwind-merge'

export interface ListProps extends PropsWithChildren {
  className?: string
  size?: 'small' | 'default'
}

export const List = ({ children, className, size = 'default' }: ListProps) => {
  return children ? (
    <div
      className={twMerge(
        'divide-border border-border flex flex-col divide-y overflow-hidden border',
        size === 'default' ? 'rounded-4xl' : 'rounded-2xl',
        className,
      )}
    >
      {children}
    </div>
  ) : null
}

export interface ListItemProps extends PropsWithChildren {
  className?: string
  inactiveClassName?: string
  selectedClassName?: string
  children: React.ReactNode
  selected?: boolean
  onSelect?: (e: React.MouseEvent) => void
  size?: 'small' | 'default'
}

export const ListItem = ({
  className,
  inactiveClassName,
  selectedClassName,
  children,
  selected,
  onSelect,
  size = 'default',
}: ListItemProps) => {
  return (
    <div
      className={twMerge(
        'flex flex-row items-center justify-between',
        selected
          ? 'bg-secondary'
          : 'hover:bg-secondary',
        selected ? selectedClassName : inactiveClassName,
        onSelect && 'cursor-pointer',
        size === 'default' ? 'px-6 py-4' : 'px-4 py-2',
        className,
      )}
      onClick={onSelect}
    >
      {children}
    </div>
  )
}
