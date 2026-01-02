'use client'

import React, { createContext, useContext } from 'react'
import type { Organization } from '@/lib/api/types'

interface OrganizationContextType {
  organization: Organization
  organizations: Organization[]
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(
  undefined,
)

export const OrganizationProvider = ({
  organization,
  organizations,
  children,
}: {
  organization: Organization
  organizations: Organization[]
  children: React.ReactNode
}) => {
  return (
    <OrganizationContext.Provider value={{ organization, organizations }}>
      {children}
    </OrganizationContext.Provider>
  )
}

/**
 * Hook to access the current organization context
 * Must be used within an OrganizationProvider
 */
export const useOrganization = (): OrganizationContextType => {
  const context = useContext(OrganizationContext)

  if (context === undefined) {
    throw new Error(
      'useOrganization must be used within an OrganizationProvider',
    )
  }

  return context
}
