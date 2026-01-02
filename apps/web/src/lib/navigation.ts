/**
 * Helper function to generate organization-scoped paths
 * Client-safe utility - can be used in both server and client components
 */
export const orgPath = (slug: string, path: string = ''): string => {
  const basePath = `/dashboard/${slug}`
  if (!path) return basePath
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${basePath}${normalizedPath}`
}
