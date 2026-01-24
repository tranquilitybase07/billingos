import { PropsWithChildren } from 'react'
import { twMerge } from 'tailwind-merge'
import ShadowBoxOnMd from './ShadowBoxOnMd'

const ShadowBox = ({
  ref,
  ...props
}: PropsWithChildren<{ className?: string }> & {
  ref?: React.RefObject<HTMLDivElement>
}) => (
  <div
    ref={ref}
    className={twMerge(
      'bg-secondary border-border w-full rounded-xl border p-8 lg:rounded-4xl',
      props.className,
    )}
  >
    {props.children}
  </div>
)

ShadowBox.displayName = 'ShadowBox'

export default ShadowBox

export { ShadowBoxOnMd }
