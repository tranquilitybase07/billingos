import { SUPPORTED_CURRENCIES } from '@/lib/constants/currencies'

/**
 * Get the narrow currency symbol for a currency code using Intl.
 * Falls back to the uppercase code if Intl can't resolve it.
 */
export function getCurrencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code.toUpperCase(),
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/**
 * Get the display name for a currency code.
 */
export function getCurrencyName(code: string): string {
  const info = SUPPORTED_CURRENCIES.find((c) => c.code === code.toLowerCase())
  return info?.name ?? code.toUpperCase()
}
