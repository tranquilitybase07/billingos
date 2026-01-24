'use client'

import { Button } from '@/components/ui/button'
import { Clipboard, ClipboardCheck } from 'lucide-react'
import { PropsWithChildren, useState } from 'react'

const CopyToClipboardButton = (
  props: PropsWithChildren<{
    text: string
    onCopy?: () => void
  }>,
) => {
  const { text, onCopy } = props
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)

    onCopy?.()

    setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  return (
    <Button
      className="ml-0.5 h-6 w-6"
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
    >
      {!copied &&
        (props.children ? props.children : <Clipboard className="h-3 w-3" />)}
      {copied && <ClipboardCheck className="h-3 w-3" />}
    </Button>
  )
}

export default CopyToClipboardButton
