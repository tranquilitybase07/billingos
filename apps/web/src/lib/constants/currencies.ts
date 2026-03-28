export interface CurrencyInfo {
  code: string
  name: string
  symbol: string
  zero_decimal: boolean
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'usd', name: 'US Dollar', symbol: '$', zero_decimal: false },
  { code: 'eur', name: 'Euro', symbol: '€', zero_decimal: false },
  { code: 'gbp', name: 'British Pound', symbol: '£', zero_decimal: false },
  { code: 'cad', name: 'Canadian Dollar', symbol: 'CA$', zero_decimal: false },
  { code: 'aud', name: 'Australian Dollar', symbol: 'A$', zero_decimal: false },
  { code: 'jpy', name: 'Japanese Yen', symbol: '¥', zero_decimal: true },
  { code: 'inr', name: 'Indian Rupee', symbol: '₹', zero_decimal: false },
  { code: 'brl', name: 'Brazilian Real', symbol: 'R$', zero_decimal: false },
  { code: 'mxn', name: 'Mexican Peso', symbol: 'MX$', zero_decimal: false },
  { code: 'sgd', name: 'Singapore Dollar', symbol: 'S$', zero_decimal: false },
  { code: 'hkd', name: 'Hong Kong Dollar', symbol: 'HK$', zero_decimal: false },
  { code: 'nzd', name: 'New Zealand Dollar', symbol: 'NZ$', zero_decimal: false },
  { code: 'sek', name: 'Swedish Krona', symbol: 'kr', zero_decimal: false },
  { code: 'nok', name: 'Norwegian Krone', symbol: 'kr', zero_decimal: false },
  { code: 'dkk', name: 'Danish Krone', symbol: 'kr', zero_decimal: false },
  { code: 'chf', name: 'Swiss Franc', symbol: 'CHF', zero_decimal: false },
  { code: 'pln', name: 'Polish Zloty', symbol: 'zł', zero_decimal: false },
  { code: 'krw', name: 'South Korean Won', symbol: '₩', zero_decimal: true },
  { code: 'zar', name: 'South African Rand', symbol: 'R', zero_decimal: false },
  { code: 'aed', name: 'UAE Dirham', symbol: 'د.إ', zero_decimal: false },
]

/**
 * Stripe-supported countries with ISO 3166-1 alpha-2 codes.
 * Sorted alphabetically by name.
 */
export const STRIPE_SUPPORTED_COUNTRIES = [
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'AT', name: 'Austria' },
  { code: 'AU', name: 'Australia' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DE', name: 'Germany' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'ES', name: 'Spain' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HR', name: 'Croatia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'LV', name: 'Latvia' },
  { code: 'MT', name: 'Malta' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'US', name: 'United States' },
  { code: 'ZA', name: 'South Africa' },
].sort((a, b) => a.name.localeCompare(b.name))
