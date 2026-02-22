'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon01Icon, Sun02Icon, ComputerIcon } from 'hugeicons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ThemeSwitcherProps {
  variant?: 'dropdown' | 'inline'
  showLabel?: boolean
  className?: string
}

export function ThemeSwitcher({
  variant = 'dropdown',
  showLabel = false,
  className
}: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className={cn("h-9 w-9", className)} />
    )
  }

  const themes = [
    { value: 'light', label: 'Light', icon: Sun02Icon },
    { value: 'dark', label: 'Dark', icon: Moon01Icon },
    { value: 'system', label: 'System', icon: ComputerIcon },
  ]

  const currentTheme = themes.find(t => t.value === theme) || themes[2]

  if (variant === 'inline') {
    return (
      <div className={cn("flex items-center gap-1 rounded-lg bg-muted p-1", className)}>
        {themes.map((themeOption) => {
          const Icon = themeOption.icon
          const isActive = theme === themeOption.value

          return (
            <button
              key={themeOption.value}
              onClick={() => setTheme(themeOption.value)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              title={`Switch to ${themeOption.label} theme`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {showLabel && <span>{themeOption.label}</span>}
            </button>
          )
        })}
      </div>
    )
  }

  // Dropdown variant (default)
  const Icon = currentTheme.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9", className)}
          title="Change theme"
        >
          <Icon className="h-5 w-5" strokeWidth={1.5} />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {themes.map((themeOption) => {
          const ThemeIcon = themeOption.icon
          const isActive = theme === themeOption.value

          return (
            <DropdownMenuItem
              key={themeOption.value}
              onClick={() => setTheme(themeOption.value)}
              className={cn(
                "cursor-pointer",
                isActive && "bg-accent text-accent-foreground"
              )}
            >
              <ThemeIcon className="mr-2 h-4 w-4" strokeWidth={1.5} />
              <span>{themeOption.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
