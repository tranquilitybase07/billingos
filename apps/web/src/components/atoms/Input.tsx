import { Input as ShadInput } from '@/components/ui/input'
import { ComponentProps } from 'react'
import { twMerge } from 'tailwind-merge'

export type InputProps = ComponentProps<typeof ShadInput> & {
  preSlot?: React.ReactNode
  postSlot?: React.ReactNode
}

const Input = ({ ref, preSlot, postSlot, className, ...props }: InputProps) => {
  return (
    <div className="relative flex flex-1 flex-row rounded-full">
      <ShadInput
        className={twMerge(
          'h-10 rounded-xl border border-input bg-card px-3 py-2 text-base text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus:z-10 focus:border-primary/50 focus:ring-[3px] focus:ring-primary/10 focus-visible:ring-primary/10 md:text-sm ring-offset-transparent',
          preSlot ? 'pl-10' : '',
          postSlot ? 'pr-10' : '',
          className,
        )}
        ref={ref}
        {...props}
      />
      {preSlot && (
        <div className="text-muted-foreground pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
          {preSlot}
        </div>
      )}
      {postSlot && (
        <div className="text-muted-foreground pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center pr-4">
          {postSlot}
        </div>
      )}
    </div>
  )
}

Input.displayName = 'Input'

export default Input
