/**
 * Integration tests for the unified EntitlementService.
 *
 * The single grant/revoke/swap path that all checkout modes and webhook
 * handlers route through. Backed by the partial unique index on
 * (subscription_id, feature_id) WHERE revoked_at IS NULL — the hard-delete
 * hack from the pre-refactor codebase is gone.
 *
 * Coverage:
 * - Grant happy path with mixed feature types     E1
 * - Coexistence of revoked + active grants        E2 (partial unique index)
 * - Soft-revoke (no hard delete)                  E3
 * - Atomic swap on upgrade                        E4
 * - ensureGrantsForSubscription un-revoke         E5
 * - Bulk insert rollback on conflict              E6
 * - Concurrent grant + revoke determinism         E7
 * - Customer-id scoping at the table level        E8
 */
import { TestingModule } from '@nestjs/testing';
import {
  createIntegrationTestModule,
  cleanBetweenTests,
} from '../../../../test/integration/setup';
import {
  fetchRows,
  seedOrganization,
  seedProduct,
  seedPrice,
  seedCustomer,
  seedFeature,
  seedSubscription,
} from '../../../../test/integration/db-helpers';
import { EntitlementService } from '../entitlement.service';
import { SupabaseService } from '../../../supabase/supabase.service';

describe('EntitlementService Integration', () => {
  let module: TestingModule;
  let cleanup: () => Promise<void>;
  let entitlements: EntitlementService;

  beforeAll(async () => {
    const ctx = await createIntegrationTestModule();
    module = ctx.module;
    cleanup = ctx.cleanup;
    entitlements = module.get(EntitlementService);
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanBetweenTests(module);
  });

  /**
   * Helper: stand up org + product + price + customer + subscription with
   * the requested feature mix attached to the product. Returns the IDs the
   * tests need to drive grant/revoke/swap calls.
   */
  async function setupBasicState(opts: {
    features: Array<{
      key: string;
      type?: 'boolean_flag' | 'usage_quota';
      limit?: number;
    }>;
  }): Promise<{
    orgId: string;
    customerId: string;
    productId: string;
    subscriptionId: string;
    featureIds: Record<string, string>;
  }> {
    const org = await seedOrganization(module);
    const product = await seedProduct(module, org.id);
    const price = await seedPrice(module, product.id, { amount: 1000 });
    const customer = await seedCustomer(module, org.id);
    const subscriptionId = await seedSubscription(module, {
      organizationId: org.id,
      productId: product.id,
      priceId: price.id,
      customerId: customer.id,
      status: 'active',
      amount: 1000,
      currency: 'usd',
    });

    const featureIds: Record<string, string> = {};
    for (const f of opts.features) {
      const feature = await seedFeature(module, org.id, product.id, {
        name: f.key,
        title: f.key,
        type: f.type ?? 'boolean_flag',
        properties: f.limit !== undefined ? { limit: f.limit } : undefined,
      });
      featureIds[f.key] = feature.id;
    }

    return {
      orgId: org.id,
      customerId: customer.id,
      productId: product.id,
      subscriptionId,
      featureIds,
    };
  }

  // ── E1: grant happy path ──

  it('E1: grants all product features and creates usage_records for USAGE_QUOTA', async () => {
    const state = await setupBasicState({
      features: [
        { key: 'dashboard' },
        { key: 'api_calls', type: 'usage_quota', limit: 10000 },
        { key: 'exports', type: 'usage_quota', limit: 100 },
      ],
    });

    const result = await entitlements.grantForSubscription({
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      productId: state.productId,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });

    expect(result.granted).toHaveLength(3);
    expect(result.usageRecordsCreated).toBe(2);

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: state.subscriptionId,
    });
    expect(grants).toHaveLength(3);
    expect(grants.every((g) => g.revoked_at === null)).toBe(true);

    const usage = await fetchRows(module, 'usage_records', {
      subscription_id: state.subscriptionId,
    });
    expect(usage).toHaveLength(2);
  });

  // ── E2: revoked + active rows for same (subscription_id, feature_id) coexist ──

  it('E2: partial unique index allows a revoked + active row for the same (sub, feature)', async () => {
    const state = await setupBasicState({
      features: [{ key: 'dashboard' }],
    });

    // Grant → revoke → grant again. The first grant becomes a revoked
    // historical row; the second is a fresh active row.
    await entitlements.grantForSubscription({
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      productId: state.productId,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });
    await entitlements.revokeForSubscription({
      subscriptionId: state.subscriptionId,
    });
    await entitlements.grantForSubscription({
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      productId: state.productId,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: state.subscriptionId,
      feature_id: state.featureIds.dashboard,
    });
    // Two rows: 1 revoked, 1 active. Hard-delete would have only 1 row.
    expect(grants).toHaveLength(2);
    expect(grants.filter((g) => g.revoked_at === null)).toHaveLength(1);
    expect(grants.filter((g) => g.revoked_at !== null)).toHaveLength(1);
  });

  // ── E3: revoke is soft (no hard delete) ──

  it('E3: revokeForSubscription sets revoked_at without deleting rows', async () => {
    const state = await setupBasicState({
      features: [{ key: 'dashboard' }, { key: 'analytics' }],
    });

    await entitlements.grantForSubscription({
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      productId: state.productId,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });

    const beforeCount = (
      await fetchRows(module, 'feature_grants', {
        subscription_id: state.subscriptionId,
      })
    ).length;
    expect(beforeCount).toBe(2);

    const result = await entitlements.revokeForSubscription({
      subscriptionId: state.subscriptionId,
    });
    expect(result.revokedCount).toBe(2);

    const after = await fetchRows(module, 'feature_grants', {
      subscription_id: state.subscriptionId,
    });
    expect(after).toHaveLength(2); // not hard-deleted
    expect(after.every((g) => g.revoked_at !== null)).toBe(true);
  });

  // ── E4: swap is atomic (revoke old + grant new) ──

  it('E4: swapForSubscription revokes old grants and grants the new product features', async () => {
    const org = await seedOrganization(module);
    const productA = await seedProduct(module, org.id, { name: 'A' });
    const productB = await seedProduct(module, org.id, { name: 'B' });
    const priceA = await seedPrice(module, productA.id, { amount: 1000 });
    const customer = await seedCustomer(module, org.id);
    const subscriptionId = await seedSubscription(module, {
      organizationId: org.id,
      productId: productA.id,
      priceId: priceA.id,
      customerId: customer.id,
      status: 'active',
      amount: 1000,
      currency: 'usd',
    });

    const featureA = await seedFeature(module, org.id, productA.id, {
      name: 'a_only',
      title: 'A Only',
      type: 'boolean_flag',
    });
    const featureB = await seedFeature(module, org.id, productB.id, {
      name: 'b_only',
      title: 'B Only',
      type: 'boolean_flag',
    });

    // Grant A's features
    await entitlements.grantForSubscription({
      customerId: customer.id,
      subscriptionId,
      productId: productA.id,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });

    await entitlements.swapForSubscription({
      subscriptionId,
      customerId: customer.id,
      newProductId: productB.id,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: subscriptionId,
    });
    const active = grants.filter((g) => g.revoked_at === null);
    const revoked = grants.filter((g) => g.revoked_at !== null);

    // Active set is exactly product B's feature. Old A feature is revoked.
    expect(active).toHaveLength(1);
    expect(active[0].feature_id).toBe(featureB.id);
    expect(revoked).toHaveLength(1);
    expect(revoked[0].feature_id).toBe(featureA.id);
  });

  // ── E5: ensureGrants un-revokes existing revoked grants ──

  it('E5: ensureGrantsForSubscription un-revokes prior revoked grants and inserts missing ones', async () => {
    const state = await setupBasicState({
      features: [{ key: 'dashboard' }, { key: 'analytics' }],
    });

    // Initial grant + revoke leaves two revoked rows.
    await entitlements.grantForSubscription({
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      productId: state.productId,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });
    await entitlements.revokeForSubscription({
      subscriptionId: state.subscriptionId,
    });

    await entitlements.ensureGrantsForSubscription(
      state.customerId,
      state.subscriptionId,
      state.productId,
    );

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: state.subscriptionId,
    });
    const active = grants.filter((g) => g.revoked_at === null);
    expect(active).toHaveLength(2);
  });

  // ── E6: bulk insert is atomic — pre-existing active grant blocks the whole batch ──

  it('E6: a pre-existing active grant on one feature blocks the whole bulk grant (rollback)', async () => {
    const state = await setupBasicState({
      features: [
        { key: 'a' },
        { key: 'b' },
        { key: 'c' },
        { key: 'd' },
        { key: 'e' },
      ],
    });

    // Manually pre-insert an active grant for feature 'a' so the bulk insert
    // collides on the partial unique index.
    const supabase = module.get(SupabaseService).getClient();
    await supabase.from('feature_grants').insert({
      customer_id: state.customerId,
      subscription_id: state.subscriptionId,
      feature_id: state.featureIds.a,
      granted_at: new Date().toISOString(),
      revoked_at: null,
      properties: {},
    });

    const result = await entitlements.grantForSubscription({
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      productId: state.productId,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });

    // The service swallows the conflict and returns an empty granted set.
    // Critically, the bulk insert is a single statement → either all rows
    // land or none do, so b/c/d/e do NOT get partial grants.
    expect(result.granted).toHaveLength(0);

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: state.subscriptionId,
    });
    // Only the manually-inserted row for 'a' should exist.
    expect(grants).toHaveLength(1);
    expect(grants[0].feature_id).toBe(state.featureIds.a);
  });

  // ── E7: concurrent grant + revoke deterministic ──

  it('E7: grant + revoke fired concurrently leaves a coherent final state (no half-grants)', async () => {
    const state = await setupBasicState({
      features: [{ key: 'dashboard' }, { key: 'analytics' }],
    });

    await Promise.all([
      entitlements.grantForSubscription({
        customerId: state.customerId,
        subscriptionId: state.subscriptionId,
        productId: state.productId,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86400e3),
      }),
      entitlements.revokeForSubscription({
        subscriptionId: state.subscriptionId,
      }),
    ]);

    const grants = await fetchRows(module, 'feature_grants', {
      subscription_id: state.subscriptionId,
    });
    const active = grants.filter((g) => g.revoked_at === null).length;

    // Either revoke ran after grant (active === 0) or before (active === 2).
    // What must NEVER happen: a partial state (active === 1).
    expect([0, 2]).toContain(active);
  });

  // ── E8: customer-id scoping at the table level ──

  it('E8: grants for one org/customer are not visible under another org/customer with the same external_id', async () => {
    const orgA = await seedOrganization(module);
    const orgB = await seedOrganization(module);

    // Same external_id in both orgs to mimic the realistic SaaS pattern.
    const customerA = await seedCustomer(module, orgA.id, {
      externalId: 'shared-user-id',
    });
    const customerB = await seedCustomer(module, orgB.id, {
      externalId: 'shared-user-id',
    });

    const productA = await seedProduct(module, orgA.id);
    const priceA = await seedPrice(module, productA.id, { amount: 1000 });
    await seedFeature(module, orgA.id, productA.id, {
      name: 'a_secret',
      title: 'A Secret',
      type: 'boolean_flag',
    });
    const subA = await seedSubscription(module, {
      organizationId: orgA.id,
      productId: productA.id,
      priceId: priceA.id,
      customerId: customerA.id,
      status: 'active',
      amount: 1000,
      currency: 'usd',
    });

    await entitlements.grantForSubscription({
      customerId: customerA.id,
      subscriptionId: subA,
      productId: productA.id,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86400e3),
    });

    const grantsA = await fetchRows(module, 'feature_grants', {
      customer_id: customerA.id,
    });
    const grantsB = await fetchRows(module, 'feature_grants', {
      customer_id: customerB.id,
    });

    expect(grantsA.length).toBeGreaterThanOrEqual(1);
    expect(grantsB).toHaveLength(0);
  });
});
