export interface CancellationRow {
  id: string
  customerName: string
  customerEmail: string
  customerDbId?: string
  plan: string
  reason: string | null
  notes: string | null
  amount: number
  currency: string
  cancelDate: string | null
  tenure: string
  isManual?: boolean
}

export interface FilterState {
  search: string
  reasons: string[]
  plans: string[]
  mrrMin: number | ''
  mrrMax: number | ''
  cancelDateFrom: string
  cancelDateTo: string
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  reasons: [],
  plans: [],
  mrrMin: '',
  mrrMax: '',
  cancelDateFrom: '',
  cancelDateTo: '',
}
