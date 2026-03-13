'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { FunctionComponent, ReactElement, useEffect } from 'react'
import ReactDOM from 'react-dom'
import * as FocusScope from '@radix-ui/react-focus-scope'
import { Cancel01Icon } from 'hugeicons-react'

export interface InlineModalProps {
  isShown: boolean
  hide: () => void
  modalContent: ReactElement
  className?: string
  /** Show a close button in the top-right corner of the panel */
  showCloseButton?: boolean
}

export const InlineModal: FunctionComponent<InlineModalProps> = ({
  isShown,
  hide,
  modalContent,
  className = '',
  showCloseButton = false,
}) => {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isShown) {
        hide()
      }
    }

    if (isShown) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isShown, hide])

  const modal = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 overflow-hidden"
      onClick={hide}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
        animate={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
        exit={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 backdrop-blur-[2px]"
      />

      {/* Slide-over Panel */}
      <FocusScope.Root loop trapped={isShown}>
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
          onClick={(e) => e.stopPropagation()}
          className={`fixed bottom-0 right-0 top-0 flex h-screen w-full flex-col bg-white shadow-xl dark:bg-background dark:border-l dark:border-border md:w-[540px] ${className}`}
        >
          {showCloseButton && (
            <button
              type="button"
              onClick={hide}
              className="absolute right-4 top-4 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close panel"
            >
              <Cancel01Icon size={18} />
            </button>
          )}
          {modalContent}
        </motion.div>
      </FocusScope.Root>
    </motion.div>
  )

  if (typeof window === 'undefined') {
    return null
  }

  return ReactDOM.createPortal(
    <AnimatePresence>{isShown && modal}</AnimatePresence>,
    document.body,
  )
}
