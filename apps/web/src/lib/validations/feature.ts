import { z } from 'zod'

/**
 * Feature types matching backend enum
 */
export const featureTypeEnum = z.enum([
  'boolean_flag',
  'usage_quota',
  'numeric_limit',
])

export type FeatureType = z.infer<typeof featureTypeEnum>

/**
 * Reset period options for usage_quota features
 */
export const RESET_PERIOD_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
  { value: 'yearly', label: 'Yearly' },
] as const

export type ResetPeriod = 'monthly' | 'weekly' | 'daily' | 'yearly'

/**
 * Category options for metadata
 */
export const CATEGORY_OPTIONS = [
  { value: 'usage', label: 'Usage' },
  { value: 'resources', label: 'Resources' },
  { value: 'features', label: 'Features' },
  { value: 'support', label: 'Support' },
  { value: 'customization', label: 'Customization' },
  { value: 'collaboration', label: 'Collaboration' },
] as const

const advancedMetadataItem = z.object({
  key: z.string(),
  value: z.string(),
})

/**
 * Internal form schema for feature creation/editing (UI state).
 * Structured fields are assembled into properties/metadata on submit.
 */
export const createFeatureFormSchema = z.object({
  organization_id: z.string().min(1, 'Organization ID is required'),

  name: z
    .string()
    .min(1, 'Feature identifier is required')
    .max(100, 'Must be 100 characters or less')
    .regex(
      /^[a-z0-9_]+$/,
      'Lowercase letters, numbers, and underscores only'
    ),

  title: z
    .string()
    .min(1, 'Feature title is required')
    .max(255, 'Must be 255 characters or less'),

  description: z.string().optional(),

  type: featureTypeEnum,

  // Structured properties (replaces raw Properties JSON)
  unit: z.string().optional(),
  reset_period: z
    .enum(['monthly', 'weekly', 'daily', 'yearly'])
    .optional(),

  // Structured metadata (replaces raw Metadata JSON)
  category: z.string().optional(),
  premium: z.boolean().optional(),

  // Advanced custom metadata key-value pairs
  advanced_metadata: z.array(advancedMetadataItem).optional(),
})

export type CreateFeatureFormValues = z.infer<typeof createFeatureFormSchema>

/**
 * Form schema for updating a feature (subset of create, no name/org/type)
 */
export const updateFeatureFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Feature title is required')
    .max(255, 'Must be 255 characters or less')
    .optional(),

  description: z.string().optional(),

  // Structured properties
  unit: z.string().optional(),
  reset_period: z
    .enum(['monthly', 'weekly', 'daily', 'yearly'])
    .optional(),

  // Structured metadata
  category: z.string().optional(),
  premium: z.boolean().optional(),

  advanced_metadata: z.array(advancedMetadataItem).optional(),
})

export type UpdateFeatureFormValues = z.infer<typeof updateFeatureFormSchema>

/**
 * Assemble API payload from structured form values.
 * Converts unit, reset_period, category, premium, advanced_metadata
 * into the properties and metadata objects the backend expects.
 */
export function assembleFeaturePayload(
  values: CreateFeatureFormValues | (UpdateFeatureFormValues & { organization_id?: string; name?: string; title?: string; type?: FeatureType })
) {
  const { unit, reset_period, category, premium, advanced_metadata, ...rest } =
    values as any

  const properties: Record<string, any> = {}
  if (unit) properties.unit = unit
  if (reset_period) properties.reset_period = reset_period

  const metadata: Record<string, any> = {}
  if (category) metadata.category = category
  if (premium) metadata.premium = true
  if (advanced_metadata) {
    for (const pair of advanced_metadata) {
      if (pair.key.trim()) metadata[pair.key.trim()] = pair.value
    }
  }

  return {
    ...rest,
    properties: Object.keys(properties).length > 0 ? properties : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  }
}

/**
 * Parse API feature properties/metadata back into structured form fields.
 * Used when editing an existing feature.
 */
export function parseFeatureToFormValues(feature: {
  properties?: Record<string, any> | null
  metadata?: Record<string, any> | null
}) {
  const properties = feature.properties || {}
  const metadata = feature.metadata || {}

  const { category, premium, ...restMetadata } = metadata

  const advancedMetadata = Object.entries(restMetadata).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }))

  return {
    unit: (properties.unit as string) || '',
    reset_period: (properties.reset_period as ResetPeriod) || undefined,
    category: (category as string) || '',
    premium: premium === true,
    advanced_metadata: advancedMetadata,
  }
}

/**
 * Helper function to generate a feature name slug from a title.
 * Converts "API Calls per Month" to "api_calls_per_month"
 */
export function generateFeatureNameSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

/**
 * Helper function to validate JSON string.
 * Returns parsed object if valid, null if invalid.
 */
export function parseJsonSafely(
  jsonString: string
): Record<string, any> | null {
  if (!jsonString || jsonString.trim() === '') {
    return null
  }
  try {
    return JSON.parse(jsonString)
  } catch {
    return null
  }
}

// Legacy aliases for backward compatibility
export const createFeatureSchema = createFeatureFormSchema
export type CreateFeatureFormData = CreateFeatureFormValues
export const updateFeatureSchema = updateFeatureFormSchema
export type UpdateFeatureFormData = UpdateFeatureFormValues
