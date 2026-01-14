// Benefit types and utilities adapted from Polar

export type BenefitType =
  | 'custom'
  | 'discord'
  | 'github_repository'
  | 'downloadables'
  | 'license_keys'
  | 'meter_credit'

export interface BenefitBase {
  id: string
  type: BenefitType
  description: string
  selectable: boolean
  deletable: boolean
  organization_id: string
  created_at: string
  modified_at?: string
}

export interface CustomBenefitProperties {
  note?: string
}

export interface DiscordBenefitProperties {
  guild_token?: string
  role_id?: string
  kick_member?: boolean
}

export interface GitHubRepositoryBenefitProperties {
  repository_owner: string
  repository_name: string
  permission: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
}

export interface DownloadablesBenefitProperties {
  files: string[]
  archived: Record<string, boolean>
}

export interface LicenseKeysBenefitProperties {
  prefix?: string
  expires?: {
    ttl: number
    timeframe: 'day' | 'month' | 'year'
  }
  activations?: {
    limit: number
    enable_customer_admin: boolean
  }
  limit_usage?: number
}

export interface MeterCreditBenefitProperties {
  meter_id: string
  units: number
  rollover: boolean
}

export type BenefitProperties =
  | CustomBenefitProperties
  | DiscordBenefitProperties
  | GitHubRepositoryBenefitProperties
  | DownloadablesBenefitProperties
  | LicenseKeysBenefitProperties
  | MeterCreditBenefitProperties

export interface Benefit extends BenefitBase {
  properties: BenefitProperties
}

// Display names for benefit types
export const benefitTypeDisplayNames: Record<BenefitType, string> = {
  custom: 'Custom',
  discord: 'Discord',
  github_repository: 'GitHub Repository',
  downloadables: 'Downloadables',
  license_keys: 'License Keys',
  meter_credit: 'Meter Credit',
}

// Get display name for a benefit type
export const getBenefitTypeDisplayName = (type: BenefitType): string => {
  return benefitTypeDisplayNames[type]
}
