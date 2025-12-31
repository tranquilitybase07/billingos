import Login from '@/components/auth/Login';
import Logo from '@/components/branding/Logo';
import Link from 'next/link';

export const metadata = {
  title: 'Login | BillingOS',
  description: 'Sign in to your BillingOS account',
};

export default function LoginPage() {
  return (
    <div className="flex h-screen w-full grow items-center justify-center">
      <div className="dark:bg-polar-900 flex w-full max-w-md flex-col justify-between gap-16 rounded-4xl bg-gray-50 p-12">
        <div className="flex flex-col items-center">
          <Logo size={60} />
          <h1 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
            Welcome back
          </h1>
        </div>
        <Login />
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
