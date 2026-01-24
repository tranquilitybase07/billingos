import { useMemo } from 'react'

interface AlertProps {
  color: 'blue' | 'gray' | 'red' | 'green'
}

const Alert: React.FC<React.PropsWithChildren<AlertProps>> = ({
  children,
  color,
}) => {
  const colorClasses = useMemo(() => {
    switch (color) {
      case 'blue':
        return 'bg-info border border-info-border text-info-foreground'
      case 'gray':
        return 'bg-warning border border-warning-border text-warning-foreground'
      case 'red':
        return 'bg-destructive-light border border-destructive-border text-destructive'
      case 'green':
        return 'bg-success border border-success-border text-success-foreground'
    }
  }, [color])

  return <div className={`rounded-lg p-2 ${colorClasses}`}>{children}</div>
}

export default Alert
