import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import Logo from '@/components/branding/Logo'

export const metadata = {
  title: 'Reset Password | BillingOS',
  description: 'Set a new password for your BillingOS account',
}

export default function ResetPasswordPage() {
  return (
    <div className="flex h-screen w-full grow items-center justify-center">
      <div className="flex w-full max-w-md flex-col justify-between gap-16 rounded-4xl p-12">
        <div className="flex flex-col items-center">
          <Logo size={40} />
          <h1 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
            Set new password
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Choose a strong password for your account
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  )
}
