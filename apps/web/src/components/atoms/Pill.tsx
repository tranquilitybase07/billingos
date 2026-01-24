import { twMerge } from 'tailwind-merge'

const Pill = ({
  children,
  color,
  className,
}: {
  children: React.ReactNode
  color: 'gray' | 'blue' | 'purple' | 'yellow' | 'red' | 'green'
  className?: string
}) => {
  return (
    <span
      className={twMerge(
        'inline-flex items-center space-x-1 rounded-full px-1.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all duration-200',

        color === 'blue'
          ? 'bg-info text-info-foreground'
          : '',
        color === 'gray'
          ? 'bg-muted text-muted-foreground'
          : '',
        color === 'purple'
          ? 'bg-accent text-accent-foreground'
          : '',
        color === 'yellow'
          ? 'bg-warning text-warning-foreground'
          : '',
        color === 'red'
          ? 'bg-destructive-light text-destructive'
          : '',
        color === 'green'
          ? 'bg-success text-success-foreground'
          : '',
        className,
      )}
    >
      {children}
    </span>
  )
}

export default Pill
