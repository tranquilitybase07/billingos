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
 * Validation schema for creating a feature
 * Matches backend CreateFeatureDto requirements
 */
export const createFeatureSchema = z.object({
  organization_id: z.string().min(1, 'Organization ID is required'),

  name: z
    .string()
    .min(1, 'Feature name is required')
    .max(100, 'Feature name must be 100 characters or less')
    .regex(
      /^[a-z0-9_]+$/,
      'Feature name must contain only lowercase letters, numbers, and underscores'
    ),

  title: z
    .string()
    .min(1, 'Feature title is required')
    .max(255, 'Feature title must be 255 characters or less'),

  description: z.string().optional(),

  type: featureTypeEnum,

  properties: z.any().optional(),

  metadata: z.any().optional(),
})

export type CreateFeatureFormData = z.infer<typeof createFeatureSchema>

/**
 * Validation schema for updating a feature
 * Matches backend UpdateFeatureDto requirements
 */
export const updateFeatureSchema = z.object({
  title: z
    .string()
    .min(1, 'Feature title is required')
    .max(255, 'Feature title must be 255 characters or less')
    .optional(),

  description: z.string().optional(),

  type: featureTypeEnum.optional(),

  properties: z.any().optional(),

  metadata: z.any().optional(),
})

export type UpdateFeatureFormData = z.infer<typeof updateFeatureSchema>

/**
 * Helper function to generate a feature name slug from a title
 * Converts "API Calls per Month" to "api_calls_per_month"
 */
export function generateFeatureNameSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .trim()
    .replace(/\s+/g, '_') // Replace spaces with underscores
}

/**
 * Helper function to validate JSON string
 * Returns parsed object if valid, null if invalid
 */
export function parseJsonSafely(jsonString: string): Record<string, any> | null {
  if (!jsonString || jsonString.trim() === '') {
    return null
  }

  try {
    return JSON.parse(jsonString)
  } catch {
    return null
  }
}
