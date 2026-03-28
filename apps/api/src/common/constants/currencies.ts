export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  zero_decimal: boolean;
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
];

const SUPPORTED_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

/**
 * Map from ISO country code to default currency code.
 * Covers all Stripe-supported countries.
 */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: 'usd',
  PR: 'usd',
  GU: 'usd',
  VI: 'usd',
  GB: 'gbp',
  DE: 'eur',
  FR: 'eur',
  IT: 'eur',
  ES: 'eur',
  NL: 'eur',
  BE: 'eur',
  AT: 'eur',
  IE: 'eur',
  PT: 'eur',
  FI: 'eur',
  LU: 'eur',
  GR: 'eur',
  SK: 'eur',
  SI: 'eur',
  EE: 'eur',
  LV: 'eur',
  LT: 'eur',
  MT: 'eur',
  CY: 'eur',
  CA: 'cad',
  AU: 'aud',
  JP: 'jpy',
  IN: 'inr',
  BR: 'brl',
  MX: 'mxn',
  SG: 'sgd',
  HK: 'hkd',
  NZ: 'nzd',
  SE: 'sek',
  NO: 'nok',
  DK: 'dkk',
  CH: 'chf',
  LI: 'chf',
  PL: 'pln',
  KR: 'krw',
  ZA: 'zar',
  AE: 'aed',
  // Countries that use USD or other supported currencies
  TH: 'usd',
  MY: 'usd',
  PH: 'usd',
  ID: 'usd',
  RO: 'eur',
  BG: 'eur',
  HR: 'eur',
  CZ: 'eur',
  HU: 'eur',
};

/**
 * Get the default currency for a Stripe account country.
 * Falls back to 'usd' for unknown countries.
 */
export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRY_TO_CURRENCY[countryCode?.toUpperCase()] || 'usd';
}

/**
 * Check if a currency code is in our supported list.
 */
export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CODES.has(code?.toLowerCase());
}
