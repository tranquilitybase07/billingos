export interface Migration {
  id: string;
  organization_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial';
  stripe_account_id: string;
  include_archived: boolean;
  products_imported: number;
  prices_imported: number;
  customers_imported: number;
  subscriptions_imported: number;
  products_total: number | null;
  prices_total: number | null;
  customers_total: number | null;
  subscriptions_total: number | null;
  errors: Array<{ entity: string; stripe_id: string; error: string }>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
