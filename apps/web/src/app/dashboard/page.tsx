'use client';

import { useAuth } from '@/providers/AuthProvider';
import Button from '@/components/atoms/Button';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              BillingOS Dashboard
            </h1>
            <Button onClick={signOut} variant="secondary">
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-gray-900 shadow rounded-lg p-6 border border-gray-200 dark:border-gray-800">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome to BillingOS!
          </h2>
          <div className="space-y-2">
            <p className="text-gray-600 dark:text-gray-400">
              <strong>Email:</strong> {user.email}
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              <strong>User ID:</strong> {user.id}
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              <strong>Email Verified:</strong>{' '}
              {user.email_confirmed_at ? 'Yes' : 'No'}
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              <strong>Created At:</strong>{' '}
              {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
