/**
 * Temporary type extensions for customers table
 * TODO: Remove this file after running migration and regenerating types
 */

export interface CustomerRow {
  id: string;
  organization_id: string;
  external_id: string | null;
  email: string;
  email_verified: boolean;
  name: string | null;
  billing_address: {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  } | null;
  stripe_customer_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
