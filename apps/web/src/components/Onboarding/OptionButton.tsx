'use client';

import { cn } from '@/lib/utils';

interface OptionButtonProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
}

export function OptionButton({ label, selected, onClick, className }: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-all duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-500'
          : 'border-border bg-card text-foreground hover:border-gray-300 hover:bg-muted/50 dark:hover:bg-muted/30',
        className
      )}
    >
      <span>{label}</span>
      {selected && (
        <span className="shrink-0 ml-3 flex items-center justify-center w-5 h-5 rounded-full bg-blue-600">
          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3" aria-hidden="true">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  );
}
