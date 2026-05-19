export class User {
  id!: string;
  email!: string;
  email_verified!: boolean;
  avatar_url?: string;
  is_admin!: boolean;
  stripe_customer_id?: string;
  accepted_terms_of_service!: boolean;
  accepted_terms_at?: string | Date;
  blocked_at?: string | Date;
  access_status!: 'pending' | 'approved' | 'denied';
  access_status_updated_at?: string | Date | null;
  beta_application?: Record<string, unknown> | null;
  meta!: Record<string, any>;
  onboarding_step!: string;
  onboarding_answers!: Record<string, unknown>;
  created_at!: string | Date;
  updated_at!: string | Date;
  deleted_at?: string | Date | null;
}
