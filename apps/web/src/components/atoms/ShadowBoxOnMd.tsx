import { DetailedHTMLProps } from 'react'
import { twMerge } from 'tailwind-merge'

const ShadowBoxOnMd = ({
  className,
  children,
  ...props
}: DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>) => (
  <div
    className={twMerge(
      'md:bg-secondary md:border-border w-full md:rounded-xl md:border md:p-8 lg:rounded-4xl',
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export default ShadowBoxOnMd
