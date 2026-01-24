# Theme Customization Guide

## Overview

BillingOS uses a **CSS variable-based theming system** powered by shadcn/ui and Tailwind CSS 4. This means you can change the entire look and feel of your application by editing a single file: `apps/web/src/app/globals.css`.

**Key Benefits:**
- ✅ Change colors, borders, shadows centrally
- ✅ No need to touch individual components
- ✅ Automatic light/dark mode support
- ✅ Type-safe with CSS variables
- ✅ Runtime theme switching capability

---

## Architecture

### Two-Layer Token System

**Layer 1: Design Tokens** (Lines 10-150 in `globals.css`)
- Raw color scales (OKLCH format)
- Base design elements (shadows, fonts, animations)
- Color palettes: Blue, Green, Red, Gray, Polar (dark mode)

**Layer 2: Semantic Tokens** (Lines 152-236 in `globals.css`)
- Purpose-driven tokens that reference design tokens
- Separate definitions for light (`:root`) and dark (`:root.dark`) modes
- Component-specific tokens (e.g., `--primary`, `--destructive`, `--muted`)

**Example Flow:**
```css
/* Layer 1: Design Token */
@theme {
  --color-blue-600: oklch(0.546 0.245 262.881);
}

/* Layer 2: Semantic Token (Light Mode) */
:root {
  --primary: var(--color-blue);
  --color-blue: var(--color-blue-600);
}

/* Component Usage */
.button {
  background-color: var(--primary); /* Resolves to blue-600 */
}
```

---

## Complete Token Reference

### Core Semantic Tokens

Located in `globals.css` at lines 153-236.

#### Background & Foreground
```css
--background: Main page background color
--foreground: Main text color
```

#### Cards & Popovers
```css
--card: Card background
--card-foreground: Card text color
--popover: Popover background
--popover-foreground: Popover text color
```

#### Primary Actions
```css
--primary: Primary button/link color
--primary-foreground: Text on primary elements
```

#### Secondary Actions
```css
--secondary: Secondary button background
--secondary-foreground: Secondary button text
```

#### Muted Elements
```css
--muted: Muted background (for disabled/inactive states)
--muted-foreground: Muted text color (placeholders, help text)
```

#### Accent Elements
```css
--accent: Accent color (highlights, active states)
--accent-foreground: Text on accent elements
```

#### Destructive Actions
```css
--destructive: Destructive button/error background
--destructive-foreground: Text on destructive elements
--destructive-light: Light destructive background (alerts)
--destructive-border: Destructive border color
```

#### Borders & Inputs
```css
--border: Default border color
--input: Input field border color
--ring: Focus ring color
```

#### Hover States
```css
--hover: Hover background color
--hover-foreground: Hover text color
```

#### Alert Variants
```css
/* Info (Blue) */
--info: Info alert background
--info-foreground: Info text color
--info-border: Info border color

/* Success (Green) */
--success: Success alert background
--success-foreground: Success text color
--success-border: Success border color

/* Warning (Gray) */
--warning: Warning alert background
--warning-foreground: Warning text color
--warning-border: Warning border color
```

#### Sidebar
```css
--sidebar-background: Sidebar background
--sidebar-foreground: Sidebar text
--sidebar-primary: Sidebar active item color
--sidebar-primary-foreground: Sidebar active item text
--sidebar-border: Sidebar border color
```

#### Design Properties
```css
--radius: Border radius (default: 0.6rem)
```

---

## Common Customization Tasks

### 1. Change Primary Color (e.g., Blue → Purple)

**Option A: Use existing color scale**
```css
/* In globals.css, line 169 and 212 */
:root {
  --primary: var(--color-purple); /* Changed from --color-blue */
}

:root.dark {
  --primary: var(--color-purple); /* Changed from --color-blue */
}
```

**Option B: Add custom color**
```css
/* Step 1: Add design token in @theme block (line 10-150) */
@theme {
  --color-brand-500: oklch(0.65 0.25 330); /* Custom purple */
}

/* Step 2: Use in semantic tokens */
:root {
  --primary: var(--color-brand-500);
}

:root.dark {
  --primary: var(--color-brand-500);
}
```

### 2. Change Border Radius (Rounded → Sharp)

```css
/* In globals.css, line 187 */
:root {
  --radius: 0.3rem; /* Changed from 0.6rem for less roundness */
  /* OR */
  --radius: 0rem;   /* Completely sharp corners */
}
```

### 3. Change Background Colors

**Light Mode:**
```css
/* Line 154 */
:root {
  --background: var(--color-white);       /* Pure white */
  --card: var(--color-gray-50);          /* Slight gray for cards */
  --secondary: var(--color-gray-200);    /* Darker gray for secondary elements */
}
```

**Dark Mode:**
```css
/* Line 197 */
:root.dark {
  --background: var(--color-polar-950);   /* Darker background */
  --card: var(--color-polar-900);        /* Slightly lighter cards */
  --secondary: var(--color-polar-800);   /* Secondary elements */
}
```

### 4. Change Destructive/Error Color (Red → Orange)

```css
/* Lines 181-182 (light) and 224-225 (dark) */
:root {
  --destructive: var(--color-orange-500);
  --destructive-foreground: var(--color-orange-600);
  --destructive-light: var(--color-orange-50);
  --destructive-border: var(--color-orange-100);
}

:root.dark {
  --destructive: var(--color-orange-500);
  --destructive-foreground: var(--color-orange-500);
  --destructive-light: var(--color-orange-950);
  --destructive-border: var(--color-orange-900);
}
```

### 5. Adjust Hover States

```css
/* Lines added in recent update */
:root {
  --hover: var(--color-gray-100);  /* Lighter hover in light mode */
}

:root.dark {
  --hover: var(--color-polar-600);  /* Lighter hover in dark mode */
}
```

### 6. Change Alert Colors

```css
:root {
  /* Info alerts (blue → teal) */
  --info: var(--color-teal-50);
  --info-foreground: var(--color-teal-600);
  --info-border: var(--color-teal-100);

  /* Success alerts (green → emerald) */
  --success: var(--color-emerald-50);
  --success-foreground: var(--color-emerald-600);
  --success-border: var(--color-emerald-100);
}
```

---

## Creating a New Theme Variant

Want to add a "Forest" theme alongside your existing light/dark themes? Here's how:

### Step 1: Add New Semantic Token Block

```css
/* In globals.css, after line 236 */
:root.forest {
  --background: oklch(0.25 0.05 160);        /* Dark green background */
  --foreground: oklch(0.90 0.02 140);        /* Light greenish text */

  --card: oklch(0.30 0.06 160);              /* Slightly lighter cards */
  --card-foreground: oklch(0.95 0.01 140);

  --primary: oklch(0.65 0.20 145);           /* Vibrant green */
  --primary-foreground: oklch(0.98 0.01 145);

  --border: oklch(0.40 0.05 160);
  --input: oklch(0.40 0.05 160);

  /* ... add all other tokens following the pattern */
}
```

### Step 2: Update Theme Provider

```tsx
// In apps/web/src/providers/ThemeProvider.tsx
<NextThemesProvider
  attribute="class"
  defaultTheme="light"
  themes={['light', 'dark', 'forest']}  // Add new theme
  enableSystem={false}
>
  {children}
</NextThemesProvider>
```

### Step 3: Add Theme Switcher UI

```tsx
import { useTheme } from 'next-themes'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="forest">Forest</option>
    </select>
  )
}
```

---

## Available Color Scales

### OKLCH Color Palettes (Perceptually Uniform)

Located in `@theme` block (lines 10-150):

- **Blue**: `--color-blue-50` through `--color-blue-950` (10 shades)
- **Green**: `--color-green-50` through `--color-green-950` (10 shades)
- **Red**: `--color-red-50` through `--color-red-950` (10 shades)
- **Gray**: `--color-gray-50` through `--color-gray-950` (10 shades)

### Custom HSL Palette (Dark Mode Optimized)

- **Polar**: `--color-polar-50` through `--color-polar-950` (10 shades)
  - Optimized for dark mode
  - Used as default for dark theme backgrounds

### Special Colors

- **White**: `--color-white: oklch(1 0 0)`
- **Black**: `--color-black: oklch(0 0 0)`

---

## Testing Your Changes

### Visual Testing Checklist

After making theme changes, test these components:

- [ ] Buttons (all variants: default, destructive, outline, secondary, ghost, link)
- [ ] Input fields (text, textarea, select, combobox)
- [ ] Cards and containers
- [ ] Alerts (all colors: blue, gray, red, green)
- [ ] Data tables (headers, rows, pagination)
- [ ] Navigation (sidebar, tabs)
- [ ] Forms (switches, radio buttons, date pickers)
- [ ] Pills/badges (all colors)
- [ ] Hover and focus states
- [ ] Dark mode switch

### Browser Testing

Test in both light and dark modes:
1. Toggle dark mode on/off
2. Check color contrast (use browser DevTools)
3. Verify all interactive states (hover, focus, active, disabled)

### Automated Testing

```bash
# Run visual regression tests (if configured)
pnpm test:visual

# Check accessibility
pnpm test:a11y
```

---

## Troubleshooting

### Colors Not Changing

**Issue**: Changed CSS variable but UI didn't update.

**Solutions:**
1. **Hard refresh**: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Clear PostCSS cache**: `rm -rf .next && pnpm dev`
3. **Check spelling**: Ensure variable name matches exactly (e.g., `--color-blue` not `--color-blue-main`)
4. **Verify layer**: Make sure you edited semantic tokens (`:root`), not design tokens (`@theme`)

### Dark Mode Not Working

**Issue**: Dark mode colors not applying.

**Solutions:**
1. **Check theme provider**: Ensure `ThemeProvider` is wrapping your app in `layout.tsx`
2. **Verify class toggle**: Open browser DevTools, check if `<html>` has `class="dark"` when in dark mode
3. **Check selector**: Dark mode tokens should be in `:root.dark` block, not `:root`

### Component Still Has Hardcoded Color

**Issue**: Changed `--primary` but button is still old color.

**Solutions:**
1. **Check component file**: Some components may have inline styles or hardcoded Tailwind classes
2. **Report issue**: If you find a component with hardcoded colors after this refactor, it's a bug
3. **Quick fix**: Search for hardcoded color in component file and replace with CSS variable

### OKLCH Colors Look Wrong

**Issue**: OKLCH colors display incorrectly in older browsers.

**Solutions:**
1. **Browser support**: OKLCH requires modern browsers (Chrome 111+, Safari 16.4+, Firefox 113+)
2. **Fallback**: Add HSL fallbacks for older browsers:
   ```css
   --primary: hsl(220, 90%, 56%); /* Fallback */
   --primary: oklch(0.546 0.245 262.881); /* Modern browsers */
   ```

---

## Best Practices

### ✅ DO

- **Use semantic tokens** in components (e.g., `bg-primary`, `text-muted-foreground`)
- **Edit `globals.css` only** for theme changes
- **Test both light and dark modes** after changes
- **Use OKLCH colors** for better accessibility and perceptual uniformity
- **Keep token naming consistent** with shadcn/ui conventions

### ❌ DON'T

- **Don't hardcode colors** in components (e.g., `bg-blue-500`)
- **Don't edit component files** for theme changes
- **Don't mix color formats** (use OKLCH for custom colors)
- **Don't forget dark mode** - always define tokens for both `:root` and `:root.dark`
- **Don't skip testing** - visual regressions happen easily

---

## File Locations

### Primary Files

- **Theme Configuration**: `apps/web/src/app/globals.css`
  - Lines 10-150: Design tokens (`@theme` block)
  - Lines 152-236: Semantic tokens (`:root` and `:root.dark`)

- **Theme Provider**: `apps/web/src/providers/ThemeProvider.tsx`
  - Manages theme state
  - Handles dark mode toggling

- **Shadcn Config**: `components.json`
  - Line 16: `"cssVariables": true` (enables CSS variable mode)
  - Line 17: `"baseColor": "neutral"` (gray color family)

### Component Files (DO NOT EDIT for theming)

All components in `apps/web/src/components/` now use CSS variables exclusively:
- `atoms/Button.tsx`
- `atoms/Card.tsx`
- `atoms/Input.tsx`
- `atoms/Select.tsx`
- `atoms/Alert.tsx`
- And 20+ more...

---

## Migration Notes

### Recent Changes (January 2025)

**Refactored to CSS Variables:**
- All 24 atom components now use semantic tokens
- Removed 39 instances of hardcoded `polar-*` colors
- Removed 50+ instances of hardcoded `gray-*`, `blue-*`, `red-*` colors
- Added new semantic tokens:
  - `--hover` and `--hover-foreground`
  - `--info`, `--success`, `--warning` (alert variants)
  - `--destructive-light` and `--destructive-border`

**Benefits:**
- ✅ Single source of truth for all colors
- ✅ Easy theme switching
- ✅ Better maintainability
- ✅ Consistent visual language

### Before vs After

**Before:**
```tsx
// Button.tsx - Mixed approach (BAD)
className="bg-red-500 dark:bg-red-600 hover:bg-red-400"
```

**After:**
```tsx
// Button.tsx - CSS variables (GOOD)
className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
```

---

## Examples Gallery

### Example 1: Brand Color Change

**Goal**: Change from blue to purple branding.

```css
/* globals.css */
:root {
  --primary: var(--color-purple-600);
  --accent: var(--color-purple-500);
}

:root.dark {
  --primary: var(--color-purple-500);
  --accent: var(--color-purple-400);
}
```

**Result**: All buttons, links, focus rings, and primary elements are now purple.

### Example 2: High Contrast Mode

**Goal**: Increase contrast for accessibility.

```css
:root.high-contrast {
  --background: var(--color-white);
  --foreground: var(--color-black);
  --border: var(--color-black);
  --primary: var(--color-blue-700);
  --muted-foreground: var(--color-gray-800);
}
```

### Example 3: Minimal/Flat Design

**Goal**: Remove shadows, reduce border radius.

```css
:root {
  --radius: 0.25rem; /* Less rounded */
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-xl: none;
  --border: var(--color-gray-300); /* More visible borders */
}
```

---

## Additional Resources

- **Shadcn Theming Docs**: https://ui.shadcn.com/docs/theming
- **Tailwind CSS Variables**: https://tailwindcss.com/docs/customizing-colors#using-css-variables
- **OKLCH Color Picker**: https://oklch.com
- **Color Contrast Checker**: https://webaim.org/resources/contrastchecker/

---

## Support

Need help with theming? Check:
1. This documentation first
2. Component examples in `apps/web/src/components/`
3. Original shadcn/ui component docs
4. Create an issue in the project repository

Happy theming! 🎨
