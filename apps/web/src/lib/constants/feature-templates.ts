import { type FeatureType } from '@/lib/validations/feature'
import {
  Activity,
  Hash,
  Flag,
  Zap,
  Users,
  Database,
  BarChart3,
  Headphones,
  Palette,
  type LucideIcon,
} from 'lucide-react'

export interface FeatureTemplate {
  id: string
  name: string
  title: string
  description: string
  type: FeatureType
  icon: LucideIcon
  iconColor: string
  properties?: Record<string, any>
  metadata?: Record<string, any>
  suggestedLimit?: number
}

/**
 * Pre-configured feature templates for quick setup
 * Users can select these to auto-fill the feature creation form
 */
export const FEATURE_TEMPLATES: FeatureTemplate[] = [
  {
    id: 'api_calls',
    name: 'api_calls',
    title: 'API Calls',
    description: 'Limit the number of API requests per billing period',
    type: 'usage_quota',
    icon: Zap,
    iconColor: 'text-green-500',
    suggestedLimit: 10000,
    properties: {
      unit: 'requests',
      reset_period: 'monthly',
    },
    metadata: {
      category: 'usage',
      common: true,
    },
  },
  {
    id: 'storage_limit',
    name: 'storage_limit',
    title: 'Storage Limit',
    description: 'Set a maximum storage capacity in GB',
    type: 'numeric_limit',
    icon: Database,
    iconColor: 'text-purple-500',
    suggestedLimit: 100,
    properties: {
      unit: 'GB',
    },
    metadata: {
      category: 'resources',
      common: true,
    },
  },
  {
    id: 'team_members',
    name: 'team_members',
    title: 'Team Members',
    description: 'Maximum number of team members allowed',
    type: 'numeric_limit',
    icon: Users,
    iconColor: 'text-blue-500',
    suggestedLimit: 10,
    properties: {
      unit: 'members',
    },
    metadata: {
      category: 'collaboration',
      common: true,
    },
  },
  {
    id: 'advanced_analytics',
    name: 'advanced_analytics',
    title: 'Advanced Analytics',
    description: 'Access to detailed analytics and reporting',
    type: 'boolean_flag',
    icon: BarChart3,
    iconColor: 'text-indigo-500',
    metadata: {
      category: 'features',
      premium: true,
    },
  },
  {
    id: 'priority_support',
    name: 'priority_support',
    title: 'Priority Support',
    description: '24/7 priority customer support',
    type: 'boolean_flag',
    icon: Headphones,
    iconColor: 'text-orange-500',
    metadata: {
      category: 'support',
      premium: true,
    },
  },
  {
    id: 'custom_branding',
    name: 'custom_branding',
    title: 'Custom Branding',
    description: 'Remove branding and add your own',
    type: 'boolean_flag',
    icon: Palette,
    iconColor: 'text-pink-500',
    metadata: {
      category: 'customization',
      premium: true,
    },
  },
]

/**
 * Feature type display information
 */
export const FEATURE_TYPE_INFO: Record<
  FeatureType,
  {
    label: string
    description: string
    icon: LucideIcon
    color: string
    example: string
  }
> = {
  boolean_flag: {
    label: 'Boolean Flag',
    description: 'Simple on/off feature flag',
    icon: Flag,
    color: 'text-blue-500',
    example: 'Priority Support, Custom Branding',
  },
  usage_quota: {
    label: 'Usage Quota',
    description: 'Limit that resets each billing period',
    icon: Activity,
    color: 'text-green-500',
    example: 'API Calls per month, Email sends',
  },
  numeric_limit: {
    label: 'Numeric Limit',
    description: 'Maximum total limit',
    icon: Hash,
    color: 'text-purple-500',
    example: 'Team members, Storage capacity',
  },
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): FeatureTemplate | undefined {
  return FEATURE_TEMPLATES.find((template) => template.id === id)
}

/**
 * Get templates by type
 */
export function getTemplatesByType(type: FeatureType): FeatureTemplate[] {
  return FEATURE_TEMPLATES.filter((template) => template.type === type)
}
