# Theme Customization - Quick Reference

**Single file to edit:** `apps/web/src/app/globals.css`

---

## Common Tasks (Copy & Paste)

### Change Primary Color
```css
/* Line 169 & 212 in globals.css */
:root {
  --primary: var(--color-purple);  /* Blue → Purple */
}
:root.dark {
  --primary: var(--color-purple);
}
```

### Change Border Radius
```css
/* Line 187 */
:root {
  --radius: 0.3rem;  /* 0.6rem → 0.3rem (less round) */
  /* OR */
  --radius: 0rem;    /* Completely sharp */
}
```

### Change Background
```css
/* Lines 154 & 197 */
:root {
  --background: var(--color-white);
}
:root.dark {
  --background: var(--color-polar-950);  /* Darker */
}
```

### Change Destructive Color
```css
/* Lines 181-182 & 224-226 */
:root {
  --destructive: var(--color-orange-500);  /* Red → Orange */
  --destructive-foreground: var(--color-orange-600);
}
```

---

## All Semantic Tokens

**Edit between lines 153-261 in `globals.css`**

### Background & Text
- `--background` - Main background
- `--foreground` - Main text color

### Components
- `--card` / `--card-foreground` - Cards
- `--popover` / `--popover-foreground` - Popovers/dropdowns
- `--primary` / `--primary-foreground` - Primary buttons/links
- `--secondary` / `--secondary-foreground` - Secondary buttons
- `--muted` / `--muted-foreground` - Disabled/muted elements
- `--accent` / `--accent-foreground` - Accents/highlights
- `--destructive` / `--destructive-foreground` - Delete/error buttons

### Borders & Focus
- `--border` - Default borders
- `--input` - Input field borders
- `--ring` - Focus rings
- `--hover` / `--hover-foreground` - Hover states

### Alerts
- `--info` / `--info-foreground` / `--info-border` - Info alerts (blue)
- `--success` / `--success-foreground` / `--success-border` - Success (green)
- `--warning` / `--warning-foreground` / `--warning-border` - Warnings (gray)
- `--destructive-light` / `--destructive-border` - Error alerts (red)

### Sidebar
- `--sidebar-background` / `--sidebar-foreground`
- `--sidebar-primary` / `--sidebar-primary-foreground`
- `--sidebar-border`

---

## Available Colors

### OKLCH Palettes (50-950 shades)
- `--color-blue-*`
- `--color-green-*`
- `--color-red-*`
- `--color-gray-*`

### Dark Mode Palette
- `--color-polar-*` (50-950 shades)

### Basics
- `--color-white`
- `--color-black`

---

## Testing Checklist

After changes, test:
- [ ] Light mode
- [ ] Dark mode toggle
- [ ] All button variants
- [ ] Input fields
- [ ] Cards & containers
- [ ] Alerts (all colors)
- [ ] Hover states

---

## File Locations

**Edit this:** `apps/web/src/app/globals.css`
- Lines 153-215: Light mode (`:root`)
- Lines 217-261: Dark mode (`:root.dark`)

**Read these:**
- `docs/theming/customization.md` - Full guide
- `docs/theming/IMPLEMENTATION_SUMMARY.md` - What was changed

**Don't edit:** `apps/web/src/components/**/*.tsx` (components now use CSS vars)

---

## Troubleshooting

**Colors not changing?**
```bash
# Hard refresh browser
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

# Clear build cache
rm -rf .next && pnpm dev
```

**Dark mode broken?**
- Check `<html>` has `class="dark"` in DevTools
- Verify tokens in `:root.dark` block (line 217+)

---

## Need Help?

1. Read: `docs/theming/customization.md`
2. Check: This quick reference
3. Search: Component examples in `/components/atoms/`

**Pro tip:** All components now use semantic tokens. Change `globals.css`, never touch component files! 🎨
