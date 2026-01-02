import { toast as sonnerToast } from 'sonner'

/**
 * Wrapper around sonner toast to match shadcn/ui toast API
 * Provides a consistent interface for showing toast notifications
 */
export const useToast = () => {
  return {
    toast: ({
      title,
      description,
      variant = 'default',
    }: {
      title?: string
      description?: string
      variant?: 'default' | 'destructive'
    }) => {
      if (variant === 'destructive') {
        sonnerToast.error(title, { description })
      } else {
        sonnerToast.success(title, { description })
      }
    },
  }
}
