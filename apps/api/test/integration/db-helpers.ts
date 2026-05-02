/**
 * Database seed & cleanup utilities for integration tests.
 * Operates against real local Supabase (Postgres with all migrations applied).
 */
import { TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { createClient as createRedisClient } from 'redis';
import { randomUUID } from 'crypto';

// ---------- Types ----------

export interface SeedOrg {
  id: string;
  name: string;
  slug: string;
  account_id: string;
  stripe_account_id: string;
}

export interface SeedProduct {
  id: string;
  organization_id: string;
  name: string;
  stripe_product_id: string;
  trial_days?: number;
}

export interface SeedPrice {
  id: string;
  product_id: string;
  amount_type: 'fixed' | 'free';
  price_amount: number;
  price_currency: string;
  recurring_interval: string;
  recurring_interval_count: number;
  stripe_price_id: string;
}

export interface SeedCustomer {
  id: string;
  organization_id: string;
  external_id: string;
  email: string;
  name: string;
  stripe_customer_id: string;
}

export interface SeedFeature {
  id: string;
  organization_id: string;
  name: string;
  title: string;
  type: string;
}

// ---------- ID Generation ----------

function genId(): string {
  return randomUUID();
}

// ---------- Seed Helpers ----------

/**
 * Seed a complete organization with a Stripe Connect account.
 * Creates an auth user first (required by public.users FK to auth.users),
 * then account, organization, and user_organizations.
 */
export async function seedOrganization(
  module: TestingModule,
  overrides: Partial<{
    orgName: string;
    stripeAccountId: string;
  }> = {},
): Promise<SeedOrg> {
  const supabase = module.get(SupabaseService).getClient();
  const orgId = genId();
  const accountId = genId();
  const stripeAccountId =
    overrides.stripeAccountId || `acct_test_${orgId.substring(0, 8)}`;
  const email = `admin-${orgId.substring(0, 8)}@test.billingos.dev`;

  // Create auth user first (public.users.id references auth.users.id)
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password: 'test-password-integration-123',
      email_confirm: true,
    });

  if (authError || !authData?.user) {
    throw new Error(
      `Failed to create auth user: ${authError?.message || 'no user returned'}`,
    );
  }

  const adminId = authData.user.id;

  // The on_auth_user_created trigger already inserts a public.users row when
  // auth.admin.createUser succeeds; upsert layers in the test-only fields.
  const { error: userError } = await supabase.from('users').upsert(
    {
      id: adminId,
      email,
      email_verified: true,
      accepted_terms_of_service: true,
      meta: {},
    },
    { onConflict: 'id' },
  );

  if (userError) {
    throw new Error(`Failed to seed user: ${userError.message}`);
  }

  // Create account (Stripe Connect)
  const { error: accountError } = await supabase.from('accounts').insert({
    id: accountId,
    admin_id: adminId,
    stripe_id: stripeAccountId,
    status: 'active',
    is_charges_enabled: true,
    is_payouts_enabled: true,
    is_details_submitted: true,
    country: 'US',
    data: {},
  });

  if (accountError) {
    throw new Error(`Failed to seed account: ${accountError.message}`);
  }

  // Create organization (no non-existent columns)
  const orgName = overrides.orgName || `Test Org ${orgId.substring(0, 6)}`;
  const { error: orgError } = await supabase.from('organizations').insert({
    id: orgId,
    name: orgName,
    slug: orgName.toLowerCase().replace(/\s+/g, '-'),
    account_id: accountId,
  });

  if (orgError) {
    throw new Error(`Failed to seed organization: ${orgError.message}`);
  }

  // Link admin to org
  const { error: linkError } = await supabase
    .from('user_organizations')
    .insert({
      user_id: adminId,
      organization_id: orgId,
    });

  if (linkError) {
    throw new Error(`Failed to seed user_organizations: ${linkError.message}`);
  }

  return {
    id: orgId,
    name: orgName,
    slug: orgName.toLowerCase().replace(/\s+/g, '-'),
    account_id: accountId,
    stripe_account_id: stripeAccountId,
  };
}

/**
 * Seed a product (optionally with trial days).
 */
export async function seedProduct(
  module: TestingModule,
  organizationId: string,
  overrides: Partial<{
    name: string;
    trialDays: number;
    stripeProductId: string;
  }> = {},
): Promise<SeedProduct> {
  const supabase = module.get(SupabaseService).getClient();
  const id = genId();
  const stripeProductId =
    overrides.stripeProductId || `prod_test_${id.substring(0, 8)}`;

  const { error } = await supabase.from('products').insert({
    id,
    organization_id: organizationId,
    name: overrides.name || `Test Product ${id.substring(0, 6)}`,
    description: 'Integration test product',
    recurring_interval: 'month',
    recurring_interval_count: 1,
    stripe_product_id: stripeProductId,
    trial_days: overrides.trialDays || 0,
    is_archived: false,
    version: 1,
    version_status: 'current',
  });

  if (error) {
    throw new Error(`Failed to seed product: ${error.message}`);
  }

  return {
    id,
    organization_id: organizationId,
    name: overrides.name || `Test Product ${id.substring(0, 6)}`,
    stripe_product_id: stripeProductId,
    trial_days: overrides.trialDays || 0,
  };
}

/**
 * Seed a price for a product.
 */
export async function seedPrice(
  module: TestingModule,
  productId: string,
  overrides: Partial<{
    amount: number;
    currency: string;
    amountType: 'fixed' | 'free';
    interval: string;
    intervalCount: number;
    stripePriceId: string;
  }> = {},
): Promise<SeedPrice> {
  const supabase = module.get(SupabaseService).getClient();
  const id = genId();
  const isFree = overrides.amountType === 'free' || overrides.amount === 0;
  const stripePriceId =
    overrides.stripePriceId || `price_test_${id.substring(0, 8)}`;

  const { error } = await supabase.from('product_prices').insert({
    id,
    product_id: productId,
    amount_type: isFree ? 'free' : overrides.amountType || 'fixed',
    // Table-level CHECK requires NULL when amount_type='free'.
    price_amount: isFree ? null : (overrides.amount ?? 2999),
    price_currency: overrides.currency || 'usd',
    recurring_interval: overrides.interval || 'month',
    recurring_interval_count: overrides.intervalCount || 1,
    stripe_price_id: stripePriceId,
    is_archived: false,
  });

  if (error) {
    throw new Error(`Failed to seed price: ${error.message}`);
  }

  return {
    id,
    product_id: productId,
    amount_type: isFree ? 'free' : overrides.amountType || 'fixed',
    price_amount: isFree ? 0 : (overrides.amount ?? 2999),
    price_currency: overrides.currency || 'usd',
    recurring_interval: overrides.interval || 'month',
    recurring_interval_count: overrides.intervalCount || 1,
    stripe_price_id: stripePriceId,
  };
}

/**
 * Seed a customer.
 */
export async function seedCustomer(
  module: TestingModule,
  organizationId: string,
  overrides: Partial<{
    externalId: string;
    email: string;
    name: string;
    stripeCustomerId: string;
  }> = {},
): Promise<SeedCustomer> {
  const supabase = module.get(SupabaseService).getClient();
  const id = genId();
  const externalId = overrides.externalId || `ext_${id.substring(0, 8)}`;
  const stripeCustomerId =
    overrides.stripeCustomerId || `cus_test_${id.substring(0, 8)}`;

  const { error } = await supabase.from('customers').insert({
    id,
    organization_id: organizationId,
    external_id: externalId,
    email: overrides.email || `customer-${id.substring(0, 8)}@test.com`,
    name: overrides.name || `Test Customer ${id.substring(0, 6)}`,
    stripe_customer_id: stripeCustomerId,
  });

  if (error) {
    throw new Error(`Failed to seed customer: ${error.message}`);
  }

  return {
    id,
    organization_id: organizationId,
    external_id: externalId,
    email: overrides.email || `customer-${id.substring(0, 8)}@test.com`,
    name: overrides.name || `Test Customer ${id.substring(0, 6)}`,
    stripe_customer_id: stripeCustomerId,
  };
}

/**
 * Seed a feature and attach it to a product.
 * Uses the actual DB schema: features has `name`, `title`, `type`, `properties`.
 * product_features has `feature_id`, `product_id`, `display_order`.
 */
export async function seedFeature(
  module: TestingModule,
  organizationId: string,
  productId: string,
  overrides: Partial<{
    name: string;
    title: string;
    type: string;
    properties: Record<string, unknown>;
    displayOrder: number;
  }> = {},
): Promise<SeedFeature> {
  const supabase = module.get(SupabaseService).getClient();
  const generatedId = genId();
  const type = overrides.type || 'boolean_flag';
  const name = overrides.name || `feature-${generatedId.substring(0, 8)}`;
  const title =
    overrides.title || overrides.name || `Feature ${generatedId.substring(0, 6)}`;

  // Features are scoped (org, name) by unique constraint. When two products
  // in the same org share a feature (e.g. "dashboard"), reuse the existing
  // row instead of inserting; product_features handles the per-product link.
  let featureId: string;
  let featureTitle: string;
  let featureType: string;
  const { data: existing } = await supabase
    .from('features')
    .select('id, title, type')
    .eq('organization_id', organizationId)
    .eq('name', name)
    .maybeSingle();

  if (existing) {
    featureId = existing.id;
    featureTitle = existing.title;
    featureType = existing.type;
  } else {
    featureId = generatedId;
    featureTitle = title;
    featureType = type;
    const { error: featureError } = await supabase.from('features').insert({
      id: featureId,
      organization_id: organizationId,
      name,
      title: featureTitle,
      type: featureType,
      properties: (overrides.properties || null) as any,
    });
    if (featureError) {
      throw new Error(`Failed to seed feature: ${featureError.message}`);
    }
  }

  // (product_id, display_order) is unique. Auto-pick the next free slot when
  // the caller doesn't pass one, so multi-feature loops don't collide.
  let displayOrder = overrides.displayOrder;
  if (displayOrder == null) {
    const { data: rows } = await supabase
      .from('product_features')
      .select('display_order')
      .eq('product_id', productId);
    const used = new Set<number>(
      (rows ?? []).map((r: { display_order: number }) => r.display_order),
    );
    displayOrder = 0;
    while (used.has(displayOrder)) displayOrder++;
  }

  const { error: pfError } = await supabase.from('product_features').insert({
    product_id: productId,
    feature_id: featureId,
    display_order: displayOrder,
  });

  if (pfError) {
    throw new Error(`Failed to seed product_feature: ${pfError.message}`);
  }

  return {
    id: featureId,
    organization_id: organizationId,
    name,
    title: featureTitle,
    type: featureType,
  };
}

/**
 * Seed a subscription directly in the database.
 * Schema requires `amount` and `currency`.
 */
export async function seedSubscription(
  module: TestingModule,
  opts: {
    organizationId: string;
    productId: string;
    priceId: string;
    customerId: string;
    status?: string;
    stripeSubscriptionId?: string;
    amount?: number;
    currency?: string;
  },
): Promise<string> {
  const supabase = module.get(SupabaseService).getClient();
  const id = genId();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase.from('subscriptions').insert({
    id,
    organization_id: opts.organizationId,
    product_id: opts.productId,
    price_id: opts.priceId,
    customer_id: opts.customerId,
    status: opts.status || 'active',
    stripe_subscription_id:
      opts.stripeSubscriptionId || `sub_test_${id.substring(0, 8)}`,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
    amount: opts.amount ?? 2999,
    currency: opts.currency || 'usd',
  });

  if (error) {
    throw new Error(`Failed to seed subscription: ${error.message}`);
  }

  return id;
}

// ---------- Cleanup ----------

/**
 * Truncate all application tables (preserves schema).
 * Uses direct delete operations since Supabase doesn't expose raw SQL via RPC by default.
 */
export async function cleanupDatabase(module: TestingModule): Promise<void> {
  const supabase = module.get(SupabaseService).getClient();

  // Tables in deletion order (children first to avoid FK violations)
  const tables = [
    'webhook_events',
    'refunds',
    'payment_intents',
    'feature_grants',
    'usage_records',
    'subscription_changes',
    'subscriptions',
    'checkout_metadata',
    'checkout_sessions',
    'portal_sessions',
    'session_tokens',
    'api_keys',
    'idempotency_keys',
    'product_features',
    'product_prices',
    'discount_products',
    'discounts',
    'features',
    'products',
    'customers',
    'stripe_sync_events',
    'trial_history',
    'user_organizations',
    'organizations',
    'accounts',
    'users',
  ];

  // Try TRUNCATE via exec_sql RPC first (fastest if available)
  let truncated = false;
  try {
    await (supabase.rpc as (...args: any[]) => any)('exec_sql', {
      query: `TRUNCATE TABLE ${tables.map((t) => `public.${t}`).join(', ')} CASCADE`,
    });
    truncated = true;
  } catch {
    // exec_sql RPC not available — fall through to manual deletes
  }

  if (!truncated) {
    // Fallback: delete from each table in order
    for (const table of tables) {
      try {
        // Use gt filter on created_at to delete all rows (workaround for requiring a filter)
        await (supabase as any)
          .from(table)
          .delete()
          .gte('created_at', '1970-01-01T00:00:00.000Z');
      } catch {
        // Ignore errors — some tables may have different schemas
      }
    }
  }

  // Clean up auth users created during tests (always, even after TRUNCATE
  // since TRUNCATE only affects public.users, not auth.users)
  try {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    if (authUsers?.users) {
      for (const user of authUsers.users) {
        if (user.email?.endsWith('@test.billingos.dev')) {
          await supabase.auth.admin.deleteUser(user.id);
        }
      }
    }
  } catch {
    // Auth cleanup is best-effort
  }

  // Purge PGMQ queues
  try {
    await (supabase.rpc as (...args: any[]) => any)('pgmq_purge', {
      queue_name: 'billing_reconciliation',
    });
  } catch {
    // Queue may not exist
  }
  try {
    await (supabase.rpc as (...args: any[]) => any)('pgmq_purge', {
      queue_name: 'billing_alerts',
    });
  } catch {
    // Queue may not exist
  }
}

/**
 * Flush Redis test database.
 */
export async function flushRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = createRedisClient({ url: redisUrl });
  try {
    await client.connect();
    await client.flushDb();
    await client.disconnect();
  } catch {
    // Redis may not be available — non-fatal
  }
}

// ---------- Query Helpers ----------

/**
 * Count rows in a table matching a filter.
 */
export async function countRows(
  module: TestingModule,
  table: string,
  filter?: Record<string, string | number | boolean>,
): Promise<number> {
  const supabase = module.get(SupabaseService).getClient();
  let query = (supabase as any)
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      query = query.eq(key, value);
    }
  }

  const { count } = await query;
  return count || 0;
}

/**
 * Fetch a single row by ID.
 */
export async function fetchRow(
  module: TestingModule,
  table: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const supabase = module.get(SupabaseService).getClient();
  const { data } = await (supabase as any)
    .from(table)
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

/**
 * Fetch rows matching a filter.
 */
export async function fetchRows(
  module: TestingModule,
  table: string,
  filter: Record<string, string | number | boolean>,
): Promise<Record<string, unknown>[]> {
  const supabase = module.get(SupabaseService).getClient();
  let query = (supabase as any).from(table).select('*');

  for (const [key, value] of Object.entries(filter)) {
    query = query.eq(key, value);
  }

  const { data } = await query;
  return data || [];
}
