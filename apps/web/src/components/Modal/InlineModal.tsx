'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { FunctionComponent, ReactElement, useEffect } from 'react'
import ReactDOM from 'react-dom'

export interface InlineModalProps {
  isShown: boolean
  hide: () => void
  modalContent: ReactElement
  className?: string
}

export const InlineModal: FunctionComponent<InlineModalProps> = ({
  isShown,
  hide,
  modalContent,
  className = '',
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
        animate={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        exit={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0"
      />

      {/* Slide-over Panel */}
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
        className={`fixed bottom-0 right-0 top-0 flex h-screen w-full flex-col bg-white shadow-xl dark:bg-gray-900 md:w-[540px] ${className}`}
      >
        {modalContent}
      </motion.div>
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
