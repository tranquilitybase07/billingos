import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import Logo from '@/components/branding/Logo'
import Link from 'next/link'

export const metadata = {
  title: 'Forgot Password | BillingOS',
  description: 'Reset your BillingOS password',
}

export default function ForgotPasswordPage() {
  return (
    <div className="flex h-screen w-full grow items-center justify-center">
      <div className="flex w-full max-w-md flex-col justify-between gap-16 rounded-4xl p-12">
        <div className="flex flex-col items-center">
          <Logo size={40} />
          <h1 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
            Forgot your password?
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Remember your password?{' '}
          <Link
            href="/login"
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
