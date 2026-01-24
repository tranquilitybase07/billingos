import { z } from 'zod'

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')

/**
 * Password validation schema
 */
export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters long')
  .max(128, 'Password must be less than 128 characters')

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

/**
 * Signup form validation schema
 */
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

/**
 * Type exports
 */
export type LoginFormData = z.infer<typeof loginSchema>
export type SignupFormData = z.infer<typeof signupSchema>

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): boolean {
  return passwordSchema.safeParse(password).success
}

/**
 * Get password strength indicator
 * Returns: weak, medium, strong
 */
export function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  if (password.length < 6) return 'weak'

  let strength = 0

  // Check length
  if (password.length >= 8) strength++
  if (password.length >= 12) strength++

  // Check for lowercase
  if (/[a-z]/.test(password)) strength++

  // Check for uppercase
  if (/[A-Z]/.test(password)) strength++

  // Check for numbers
  if (/[0-9]/.test(password)) strength++

  // Check for special characters
  if (/[^a-zA-Z0-9]/.test(password)) strength++

  if (strength <= 2) return 'weak'
  if (strength <= 4) return 'medium'
  return 'strong'
}
