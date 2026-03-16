'use client';

import { cn } from '@/lib/utils';

interface ContinueButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export function ContinueButton({ onClick, label = 'Continue', className }: ContinueButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white cursor-pointer',
        'hover:bg-blue-700 active:bg-blue-800 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
    >
      {label}
      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden="true">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
