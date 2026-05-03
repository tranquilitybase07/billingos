/**
 * Shared boilerplate for real-Stripe spec files. Each spec calls
 * `useRealStripeSuite()` in `describe` to get the same module + per-test
 * org reseeding + per-test scenario teardown. Cuts ~30 LOC per spec file.
 */
import type { TestingModule } from '@nestjs/testing';
import {
  cleanBetweenRealStripeTests,
  createRealStripeTestModule,
} from './setup';
import { createTestRunOrg, type TestRunOrg } from './lifecycle';
import type { RealScenarioContext } from './scenario';

export interface RealStripeSuiteHandle {
  getModule: () => TestingModule;
  getOrg: () => TestRunOrg;
  /** Track a scenario so afterEach tears it down (Stripe-side cleanup). */
  track: (scenario: RealScenarioContext) => void;
}

export function useRealStripeSuite(): RealStripeSuiteHandle {
  let module: TestingModule;
  let cleanup: () => Promise<void>;
  let org: TestRunOrg;
  const scenarios: RealScenarioContext[] = [];

  beforeAll(async () => {
    const ctx = await createRealStripeTestModule();
    module = ctx.module;
    cleanup = ctx.cleanup;
    org = await createTestRunOrg(module, {
      stripeAccountId: process.env.STRIPE_TEST_CONNECT_ACCOUNT!,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  // Per-test cleanup wipes scenario data only. The run-scoped org +
  // accounts row from beforeAll survives, so subsequent inserts of
  // customers/products/subs against the same Connect account are clean.
  beforeEach(async () => {
    await cleanBetweenRealStripeTests(module);
  });

  afterEach(async () => {
    while (scenarios.length > 0) {
      const s = scenarios.pop()!;
      try {
        await s.cleanup();
      } catch {
        // Sweep at end of run will catch leftovers.
      }
    }
  });

  return {
    getModule: () => module,
    getOrg: () => org,
    track: (s) => {
      scenarios.push(s);
    },
  };
}
