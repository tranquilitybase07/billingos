'use client'

import { useState, useEffect } from 'react'
import { Copy01Icon, Tick01Icon } from 'hugeicons-react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  language?: string
  /** Optional filename shown as a tab above the code */
  filename?: string
  className?: string
}

/**
 * Styled code block with copy button.
 * Renders syntax-highlighted code using inline styles for zero-flash SSR.
 */
export function CodeBlock({
  code,
  language = 'typescript',
  filename,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function highlight() {
      try {
        const { codeToHtml } = await import('shiki')
        const html = await codeToHtml(code, {
          lang: language,
          themes: {
            dark: 'github-dark',
            light: 'github-light',
          },
          defaultColor: false,
        })
        if (!cancelled) setHighlighted(html)
      } catch {
        // Silently fall back to unstyled code
      }
    }
    highlight()
    return () => { cancelled = true }
  }, [code, language])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border border-border overflow-hidden',
        'bg-[#0d1117] dark:bg-[#0d1117]',
        className,
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border/50 bg-white/[0.03] px-4 py-2">
        <div className="flex items-center gap-2">
          {filename ? (
            <span className="font-mono text-xs text-muted-foreground">
              {filename}
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground/50 uppercase tracking-wider">
              {language}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-white/10',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Tick01Icon size={12} className="text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy01Icon size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <div className="overflow-x-auto">
        {highlighted ? (
          <div
            className={cn(
              'text-sm [&>pre]:p-4 [&>pre]:m-0 [&>pre]:bg-transparent!',
              '[&_.shiki]:bg-transparent!',
            )}
            // shiki renders color-scheme-aware HTML via data-theme
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <pre className="p-4 text-sm text-gray-300 overflow-x-auto">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
