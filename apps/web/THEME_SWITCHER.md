# Theme Switcher Documentation

## Overview

BillingOS now supports three theme modes:
- **Light Mode** - Bright, clean interface
- **Dark Mode** - Dark interface (previous default)
- **System Mode** - Automatically follows your OS preference

## Location

The theme switcher is located in the **sidebar header**, next to the collapse/expand button.

## Features

### 1. **Theme Persistence**
- Your theme preference is saved in localStorage
- Persists across sessions and page reloads
- Storage key: `billingos-theme`

### 2. **System Theme Detection**
- Default mode is "System" which auto-detects your OS preference
- Automatically updates when you change OS theme settings
- Works on macOS, Windows, and Linux

### 3. **Smooth Transitions**
- Theme changes apply instantly without page reload
- `disableTransitionOnChange` prevents flash during initial load

## Component Details

### ThemeSwitcher Component

**Location:** `src/components/ThemeSwitcher.tsx`

**Variants:**
1. **Dropdown** (currently used)
   - Compact button with icon
   - Dropdown menu with theme options
   - Shows current theme icon

2. **Inline** (alternative, not currently used)
   - Horizontal toggle buttons
   - All three options visible
   - Optional labels

**Props:**
```tsx
interface ThemeSwitcherProps {
  variant?: 'dropdown' | 'inline'  // Default: 'dropdown'
  showLabel?: boolean              // Default: false
  className?: string               // Optional custom classes
}
```

### Usage Examples

**Current Implementation (Sidebar):**
```tsx
<ThemeSwitcher variant="dropdown" />
```

**Alternative Inline Style:**
```tsx
<ThemeSwitcher variant="inline" showLabel={true} />
```

## Theme Provider Configuration

**Location:** `src/providers/ThemeProvider.tsx`

**Settings:**
- `defaultTheme: "system"` - Uses OS preference by default
- `enableSystem: true` - Enables system theme detection
- `attribute: "class"` - Uses class-based theming (Tailwind compatible)
- `storageKey: "billingos-theme"` - LocalStorage key for persistence
- `disableTransitionOnChange` - Prevents flash on initial load

## Customization

### Change Default Theme

Edit `src/providers/ThemeProvider.tsx`:
```tsx
defaultTheme="dark"  // or "light", "system"
```

### Add Theme Switcher Elsewhere

```tsx
import { ThemeSwitcher } from '@/components/ThemeSwitcher'

// Dropdown style
<ThemeSwitcher variant="dropdown" />

// Inline toggle style with labels
<ThemeSwitcher variant="inline" showLabel={true} />
```

### Disable System Theme

Edit `src/providers/ThemeProvider.tsx`:
```tsx
enableSystem={false}
defaultTheme="dark"
```

## Icons Used

- **Light Mode:** Sun icon (Sun02Icon from hugeicons-react)
- **Dark Mode:** Moon icon (Moon01Icon from hugeicons-react)
- **System Mode:** Computer icon (ComputerIcon from hugeicons-react)

## Technical Notes

### Hydration Safety
The component uses `useEffect` and `mounted` state to prevent hydration mismatches between server and client rendering.

### Theme Detection
The `useTheme` hook from `next-themes` handles:
- Theme persistence
- System preference detection
- Theme change events
- Initial theme resolution

### CSS Classes
Themes are applied via Tailwind's `dark:` modifier:
```css
/* Light mode */
.bg-background

/* Dark mode */
.dark .bg-background
```

## Troubleshooting

**Theme not persisting:**
- Check browser localStorage for `billingos-theme` key
- Ensure cookies/localStorage are enabled

**Flash of wrong theme:**
- The `suppressHydrationWarning` attribute on `<html>` tag prevents this
- `disableTransitionOnChange` prevents animation flash

**System theme not updating:**
- Ensure `enableSystem={true}` in ThemeProvider
- Check OS supports `prefers-color-scheme` media query
- Try manually selecting System theme from dropdown
