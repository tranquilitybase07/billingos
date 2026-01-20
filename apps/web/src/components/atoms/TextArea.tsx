import { Textarea } from '@/components/ui/textarea'
import { twMerge } from 'tailwind-merge'

export interface TextAreaProps extends React.ComponentProps<'textarea'> {
  resizable?: boolean | undefined
}

const TextArea = ({
  ref,
  resizable = true,
  className,
  ...props
}: TextAreaProps) => {
  const classNames = twMerge(
    'border-input bg-card text-foreground placeholder:text-muted-foreground min-h-[120px] rounded-2xl focus-visible:ring-primary/10 p-4 text-sm shadow-xs outline-none focus:z-10 focus:border-primary/50 focus:ring-[3px] ring-offset-transparent',
    resizable ? '' : 'resize-none',
    className,
  )

  return <Textarea ref={ref} className={classNames} {...props} />
}

TextArea.displayName = 'TextArea'

export default TextArea
