# BillingOS — Progress Tracker

> Living "what's actually built" log across features. Per-feature phase checklists live in each feature's `docs/<feature>/progress.md`; this doc is the high-level shipped-state dashboard. Update when a slice lands and builds green.

**Status legend:** ✅ done & build-verified · 🟡 in progress · ⏳ planned · ⚠️ caveat/follow-up

_Last updated: 2026-06-22._

---

## Churn Flow

Churnkey-style cancellation/save flow. One engine + renderer above a `SubscriptionResolver` seam; merchant-built flows; portal mount (Phase 1) and SDK embed (Phase 3). Full design: [docs/churn-flow/plan.md](./churn-flow/plan.md).

| Phase | Scope | Status |
|---|---|---|
| 1 | Framework + survey + discount + cancel (portal mount) | ✅ implemented, builds green; manual e2e by user |
| 1.5 | Discount re-redemption guard (BOS-cached) + merchant toggle | ✅ implemented, builds green; manual e2e pending |
| 2a | Pause offer + save-rate analytics | ✅ implemented, builds green; manual e2e pending |
| 2b | Downgrade offer (smart target) | ⏳ planned — spike first |
| 3 | Churn-only via SDK embed (`StripeSubscriptionResolver`) | ⏳ planned |

### Phase 1 — shipped ✅ (2026-06-19)

**Database** (applied locally; types regenerated)
- `supabase/migrations/20260619200315_create_churn_flows_table.sql` — flow config (`steps`/`targeting` JSONB, `enabled`, RLS, updated_at trigger)
- `supabase/migrations/20260619200316_create_churn_events_table.sql` — append-only action-time analytics log

**Backend** — `apps/api/src/v1/churn/`
- Resolver seam: `resolvers/subscription-resolver.interface.ts` (`SubscriptionView`, `ChurnContext`, `SUBSCRIPTION_RESOLVER`) + `resolvers/bos-subscription.resolver.ts` (getSubscription / applyDiscount / cancel)
- `churn-context.service.ts` — resolves context from a portal session id (no token guard, mirrors existing cancel endpoint)
- `churn.service.ts` + `churn.controller.ts` — `GET :sessionId/config`, `POST :sessionId/events|apply-offer|cancel`. **Offers resolved server-side from stored config** (client sends only `{subscriptionId, reason}`)
- `churn-flows.service.ts` + `churn-flows.controller.ts` — dashboard CRUD (JwtAuthGuard, org-scoped, single-enabled-flow invariant)
- `StripeService.applyDiscountToSubscription()` (new) — coupon on a live sub
- `portal.service.ts` ships `churnFlow` in `PortalData`

**Frontend** — `apps/web/src/components/churn/`
- `machine.ts` — pure state machine (cancel is the terminal step) · `ChurnFlow.tsx` (+ exported `ChurnFlowBody`) — renderer reused inline by the builder preview
- `SubscriptionTab.tsx` mounts `<ChurnFlow>` when a flow is enabled; old modal is the no-flow fallback
- Builder: `app/dashboard/[organization]/(header)/churn/` (page + `ChurnBuilderPage.tsx`) with live preview; **Churn** sidebar entry (RETENTION group)
- `hooks/queries/churn-flows.ts` — TanStack Query CRUD

**Verification:** `pnpm build:api` ✅ · `pnpm build:web` ✅. Manual e2e per [phase-1.md §6](./churn-flow/phase-1.md). Discount-applies-to-live-sub path **confirmed in Stripe by user**.

**Fixes after first manual test**
- Builder **Live toggle now persists immediately** (PATCH existing flow / create+enable new), optimistic revert — previously local-only, which is why an enabled flow never reached the portal.

### Phase 1.5 — shipped ✅ (2026-06-22)

Stops customers re-triggering the flow to reset/extend a save discount; eligibility reads from BOS, never Stripe (rate-limit safe). Spec: [phase-1.5.md](./churn-flow/phase-1.5.md).

**Database** (applied via `supabase migration up`; types regenerated)
- `20260622030745_add_active_discount_to_subscriptions.sql` — `subscriptions.active_discount` JSONB (BOS discount cache)
- `20260622030746_add_settings_to_churn_flows.sql` — `churn_flows.settings` JSONB (policy bag)

**Backend**
- `bos-subscription.resolver.ts` — deterministic reusable coupon per offer (`churn_<flowId>_<reasonKey>_<terms>`, create-or-reuse); write-through `active_discount` on apply; `hasActiveDiscount` on `getSubscription`
- `churn.service.ts` — BOS-only eligibility guard (`active_discount` + `churn_events`), outcomes `saved`/`already_discounted`/`not_eligible`; `offerEligible` on `getConfig`
- `billing/webhooks/handlers/discount.handler.ts` — `customer.discount.created|updated|deleted` → refresh/clear `active_discount` (registered in `billing.module.ts`)
- `portal.service.ts` ships `hasActiveDiscount` per subscription; `churn-flows` CRUD carries `settings.allowRepeatDiscount`

**Frontend**
- `machine.ts` — proactive offer-skip when `hasActiveDiscount`; reactive handling of `already_discounted`/`not_eligible` → confirm with a notice; **fixed double-logging** (client no longer emits `offer_accepted`/`canceled`)
- `ChurnBuilderPage.tsx` — **Discount policy** card with the repeat-discount toggle

**Verification:** `pnpm build:api` ✅ · `pnpm build:web` ✅. Manual e2e pending.

**Note:** a discount applied under Phase 1 (before write-through existed) leaves `active_discount` null until a `customer.discount.*` webhook fires — test the guard with a **freshly applied** discount.

### Phase 2a — shipped ✅ (2026-06-22)

Pause save-offer + save-rate analytics. Pause reuses the Phase 1.5 BOS-cache + guard pattern. Decisions baked in: **pause keeps feature access until the period end** (no immediate entitlement revoke); re-pause governed by a per-flow `allowRepeatPause` toggle. Spec: [phase-2.md](./churn-flow/phase-2.md).

**Database** (applied via `supabase migration up`; types regenerated)
- `20260622040000_add_pause_state_to_subscriptions.sql` — `paused_at`, `resumes_at`, `pause_behavior` (BOS pause cache; dedicated columns, queryable)

**Backend**
- `stripe.service.ts` — `pauseSubscription` / `resumeSubscription` (`pause_collection` via `subscriptions.update`)
- `bos-subscription.resolver.ts` — `pause(ctx, offer)` write-through; `isPaused` on `getSubscription`
- `churn.service.ts` — `applyOffer` routes by offer type (`discount` | `pause`); per-offer-type redemption guard (`offer->>type` scoped); outcomes add `already_paused`
- `billing/webhooks/tasks/sync-status.task.ts` — reconciles `pause_collection` into the BOS pause cache on `customer.subscription.updated` (handles pause **and** resume)
- `analytics.service.ts` — `getChurnSaveAnalytics` from `churn_events` (counts, save rate, by-reason + by-offer-type breakdown, 15-min cache); `GET /analytics/churn-saves`
- `portal.service.ts` ships `isPaused`/`pause.resumesAt` per subscription
- `PauseOffer` config type + `ChurnFlowSettings.allowRepeatPause`

**Frontend**
- `machine.ts` / `ChurnFlow.tsx` — pause offer rendered + accepted via the existing `applyOffer(reason)` (server resolves type); proactive skip when `isPaused`; reactive `already_paused` → confirm with notice
- `ChurnBuilderPage.tsx` — per-reason offer-type selector (Discount | Pause) with resume-after picker; **Save offer policy** card adds the repeat-pause toggle
- `cancellations/CancellationsPage.tsx` — **Save performance** section: save-rate stat cards + by-reason save-rate and by-offer-type acceptance breakdowns (new `useChurnSaveAnalytics` hook)

**Verification:** `pnpm build:api` ✅ · `pnpm build:web` ✅ · `eligibility.spec` 4/4 ✅ · lint added 0 new errors (6 pre-existing at HEAD). Manual e2e pending.

**Phase 2b (downgrade) — not started.** Decision: **smart target** — merchant may pin a target price; if unset, auto-pick the next-cheaper active plan. Spike the `SubscriptionTransitionService.handleDowngrade()` path before building UI.

---

## Cross-cutting notes & follow-ups

- ⚠️ **Local migration history drift** — `supabase migration up` was blocked by a pre-existing mismatch (remote `20260516001312` had no local file; recent migrations unapplied locally). Resolved by the user updating migrations; a clean `supabase gen types` now works. Three **orphan tables** (`migration_jobs`, `organization_invitations`, `stripe_product_mappings`) exist in remote/committed types but have **no migration file** and aren't referenced in source — omitted by the migration-driven regen. Add migrations if prod relies on them.
- ⚠️ **Stale rule doc** — `.claude/rules/backend.md` still says "Connect uses Express"; reality is OAuth Standard Connect. Flagged, not yet fixed (awaiting go-ahead).
- ✅ **Coupon proliferation** — resolved in Phase 1.5 (deterministic reusable coupon per offer; create-or-reuse).
- ⏳ **Portal cancel shared method** — `BosSubscriptionResolver.cancel` owns the canonical cancel; `portal.service.ts` cancel left intact as fallback (avoids portal→churn coupling). Optional future extraction.
- ⏳ **Tests** — churn unit specs deferred per user; pre-existing API suite failures (`stripe-webhook`/`analytics`/`checkout` specs) are unrelated stale specs.

## Next up
- **Manual e2e for Phase 1.5** (re-redeem blocked, toggle on→re-eligible after expiry, webhook clears cache).
- **Manual e2e for Phase 2a** (accept pause → Stripe `pause_collection` set + BOS `paused_at` written; resume webhook clears cache; re-pause blocked unless `allowRepeatPause`; `/analytics/churn-saves` numbers reconcile with `churn_events`; Save performance section renders).
- **Phase 2b** — downgrade offer (smart target). Spike `SubscriptionTransitionService.handleDowngrade()` first. → [phase-2.md](./churn-flow/phase-2.md) §2
