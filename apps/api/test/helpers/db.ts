import { INestApplication } from '@nestjs/common';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { StripeService } from '../../src/stripe/stripe.service';
import { randomUUID } from 'crypto';

export interface TestOrgContext {
  orgId: string;
  userId: string;
  accountId: string;
  stripeAccountId: string;
  email: string;
  cleanup: () => Promise<void>;
}

export async function createTestOrg(
  app: INestApplication,
): Promise<TestOrgContext> {
  const supabase = app.get(SupabaseService).getClient();
  const stripeService = app.get(StripeService);
  const stripe = stripeService.getClient();

  const tag = `bos-it-${randomUUID().slice(0, 8)}`;
  const email = `${tag}@integration-test.local`;

  // 1. Auth user → trigger creates public.users row
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: `pw-${randomUUID()}`,
    email_confirm: true,
  });
  if (authErr || !authUser?.user) {
    throw new Error(`auth user create failed: ${authErr?.message}`);
  }
  const userId = authUser.user.id;

  // 2. Stripe Connect account via sandbox auto-verify bypass
  const stripeAccount = await stripeService.createTestAccountWithBypass({
    email,
    country: 'US',
    organizationName: tag,
  });
  const stripeAccountId = stripeAccount.id;

  // 3. accounts row
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .insert({
      admin_id: userId,
      stripe_id: stripeAccountId,
      email,
      country: 'US',
      currency: 'usd',
      is_details_submitted: true,
      is_charges_enabled: true,
      is_payouts_enabled: true,
      status: 'active',
    })
    .select('id')
    .single();
  if (accErr || !account) {
    throw new Error(`accounts insert failed: ${accErr?.message}`);
  }
  const accountId = account.id;

  // 4. organization row
  // checkout_mode: 'embedded' — uses the deferred PaymentIntent flow that returns
  // clientSecret/paymentIntentId in the API response. 'hosted' (default) returns
  // a Stripe Checkout Session which can't be confirmed with paymentIntents.confirm().
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: tag,
      slug: tag,
      email,
      account_id: accountId,
      status: 'active',
      default_currency: 'usd',
      checkout_mode: 'embedded',
    })
    .select('id')
    .single();
  if (orgErr || !org) {
    throw new Error(`organizations insert failed: ${orgErr?.message}`);
  }
  const orgId = org.id;

  // 5. user_organizations join
  const { error: joinErr } = await supabase
    .from('user_organizations')
    .insert({ user_id: userId, organization_id: orgId });
  if (joinErr) {
    throw new Error(`user_organizations insert failed: ${joinErr.message}`);
  }

  const cleanup = async () => {
    // Order matters: org → account → user → stripe account.
    await supabase.from('organizations').delete().eq('id', orgId);
    await supabase.from('accounts').delete().eq('id', accountId);
    await supabase.auth.admin.deleteUser(userId);
    try {
      await stripe.accounts.del(stripeAccountId);
    } catch {
      // best-effort
    }
  };

  return { orgId, userId, accountId, stripeAccountId, email, cleanup };
}

export interface TestProductOptions {
  amountCents?: number;
  currency?: string;
  interval?: 'day' | 'week' | 'month' | 'year';
  trialDays?: number;
  featureName?: string;
}

export interface TestProductContext {
  productId: string;
  priceId: string;
  featureId: string;
  stripeProductId: string;
  stripePriceId: string;
}

export async function createTestProduct(
  app: INestApplication,
  orgCtx: Pick<TestOrgContext, 'orgId' | 'stripeAccountId'>,
  opts: TestProductOptions = {},
): Promise<TestProductContext> {
  const supabase = app.get(SupabaseService).getClient();
  const stripe = app.get(StripeService).getClient();

  const amountCents = opts.amountCents ?? 1000;
  const currency = opts.currency ?? 'usd';
  const interval = opts.interval ?? 'month';
  const featureName = opts.featureName ?? `feat_${randomUUID().slice(0, 6)}`;

  // 1. Stripe Product on the Connect account
  const stripeProduct = await stripe.products.create(
    { name: `it-product-${randomUUID().slice(0, 6)}` },
    { stripeAccount: orgCtx.stripeAccountId },
  );

  // 2. Stripe Price on the Connect account
  const stripePrice = await stripe.prices.create(
    {
      product: stripeProduct.id,
      unit_amount: amountCents,
      currency,
      recurring: { interval },
    },
    { stripeAccount: orgCtx.stripeAccountId },
  );

  // 3. products row
  const { data: product, error: prodErr } = await supabase
    .from('products')
    .insert({
      organization_id: orgCtx.orgId,
      name: stripeProduct.name,
      recurring_interval: interval,
      recurring_interval_count: 1,
      stripe_product_id: stripeProduct.id,
      trial_days: opts.trialDays ?? 0,
      version_status: 'current',
    })
    .select('id')
    .single();
  if (prodErr || !product) {
    throw new Error(`products insert failed: ${prodErr?.message}`);
  }

  // 4. product_prices row
  const { data: price, error: priceErr } = await supabase
    .from('product_prices')
    .insert({
      product_id: product.id,
      amount_type: 'fixed',
      price_amount: amountCents,
      price_currency: currency,
      recurring_interval: interval,
      stripe_price_id: stripePrice.id,
    })
    .select('id')
    .single();
  if (priceErr || !price) {
    throw new Error(`product_prices insert failed: ${priceErr?.message}`);
  }

  // 5. features row
  const { data: feature, error: featErr } = await supabase
    .from('features')
    .insert({
      organization_id: orgCtx.orgId,
      name: featureName,
      title: featureName,
      type: 'boolean_flag',
    })
    .select('id')
    .single();
  if (featErr || !feature) {
    throw new Error(`features insert failed: ${featErr?.message}`);
  }

  // 6. product_features junction
  const { error: pfErr } = await supabase.from('product_features').insert({
    product_id: product.id,
    feature_id: feature.id,
    display_order: 1,
  });
  if (pfErr) {
    throw new Error(`product_features insert failed: ${pfErr.message}`);
  }

  return {
    productId: product.id,
    priceId: price.id,
    featureId: feature.id,
    stripeProductId: stripeProduct.id,
    stripePriceId: stripePrice.id,
  };
}
