---
description: "BillingOS PR review — agentic blast-radius analysis + parallel multi-pass review against project rules"
argument-hint: "[pr-number]"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Agent"]
---

Review the current PR (or recent changes if no PR number given) against BillingOS coding standards. Uses agentic exploration (read diff → find blast radius → parallel multi-pass review) instead of a single linear scan, so the reviewer answers *"who else breaks?"* not just *"is each file internally OK?"*.

## Phase 1 — Scope & Context

1. **Get the diff.**
   - If `$ARGUMENTS` is a PR number: `gh pr view $ARGUMENTS --json title,body,additions,deletions` (intent), then `gh pr diff $ARGUMENTS`.
   - Else: `git diff main...HEAD` and `git log main..HEAD --oneline` for commit-level context.

2. **Read PR description / commits** to extract stated intent. Note promised changes — you'll cross-check completeness in Phase 4.

3. **Categorize changed files** into buckets. Only spawn sub-agents (Phase 3) for buckets that have matches.

   | Bucket | Paths |
   |---|---|
   | `backend-controller` | `apps/api/**/*.controller.ts` |
   | `backend-service` | `apps/api/**/*.service.ts` |
   | `backend-webhook` | `apps/api/src/billing/webhooks/**`, `apps/api/src/stripe/**` |
   | `backend-dto` | `apps/api/**/dto/*.ts`, `apps/api/**/*.dto.ts` |
   | `frontend-component` | `apps/web/src/**/*.tsx` |
   | `frontend-route` | `apps/web/src/app/**/route.ts` |
   | `css` | `**/*.css` |
   | `migration` | `supabase/migrations/*.sql` |
   | `shared-types` | `packages/shared/**` |

## Phase 2 — Blast Radius (single pass, before fan-out)

For each changed file in `backend-service`, `backend-controller`, or `shared-types`:

1. List exported symbols whose **signature, return type, or observable behavior** changed. Skip pure rename/whitespace/formatting.
2. For each such symbol: `grep -rn "<symbolName>" apps/ packages/` to find callers.
3. Read each caller in full (not just the matched line). Decide: does the change break it?
4. Read the corresponding test file if it exists. Does it cover the new behavior?

Record a **Blast Radius Map** to pass to sub-agents:

```
ChangedSymbol: <name> (<file:line>)
  ChangeType: signature | behavior | return-type
  Callers: [<file:line>, ...]
  CallersAffected: [<file:line>: <reason>, ...]
  TestCoverage: covered | partial | none
```

Skip this phase if the diff has no public-API changes (pure internal refactor or CSS-only).

## Phase 3 — Parallel Review (fan-out via `Agent` tool)

Spawn the sub-agents below **in parallel** — single message, multiple Agent tool calls. Each gets: the diff for its assigned files, the Blast Radius Map from Phase 2, its checklist, and the rule *"read each assigned file in full before commenting; verify findings with grep/read before emitting."*

Only spawn a sub-agent if its file bucket has at least one match.

### Sub-agent A — Security & Multi-tenancy
**Buckets:** `backend-controller`, `backend-service`, `backend-dto`, `frontend-route`

- **Scoping**: every Supabase query on tenant data must include `.eq('organization_id', ...)`. Flag missing filters. Before flagging, grep for the same `.from('<table>')` elsewhere — if other call sites filter and this one doesn't, it's a real bug; if no call site filters, the table may not be tenant-scoped.
- **Auth guards**: dashboard endpoints → `JwtAuthGuard`; `/v1/*` SDK endpoints → `SessionTokenAuthGuard`; server-to-server → `ApiKeyAuthGuard`. Flag any endpoint with no guard. Check for class-level `@UseGuards` before flagging method-level absence.
- **Input validation**: controller methods must accept a typed DTO with `class-validator` decorators. Flag raw `@Body()`. Flag DTO fields missing `@IsString()` / `@IsUUID()` / `@IsEnum()` / etc.
- **Sandbox token routing**: flag hardcoded API URLs; require `getApiUrl()` or token-prefix routing for env-dependent branching.

### Sub-agent B — Stripe, Webhooks, Versioning
**Buckets:** `backend-service` (Stripe-touching), `backend-webhook`

- **Stripe authority**: BOS records updated without confirming Stripe write succeeded. Direct Stripe SDK use outside `StripeService`. Missing `stripeAccount` param on Connect calls (resolution: `organization_id → accounts.stripe_id`). Missing `stripe_sync_events` logging.
- **Wrong source of truth**: feature gating querying Stripe instead of `feature_grants`; usage metering calling Stripe (it's BOS-only).
- **Webhook safety**: any body-parsing middleware added before `/stripe/webhooks`. Missing dual-layer idempotency (Redis 5-min TTL + `webhook_events` table). Handlers swallowing errors instead of throwing (Stripe needs 500 to retry).
- **Product versioning**: product mutations that don't account for active subscriptions; reads that don't filter `version_status: 'current'`.

### Sub-agent C — Code Quality & Type Safety
**Buckets:** all `backend-*`, all `frontend-*`, `shared-types`

- **Type safety**: new `any`, suspicious `as` assertions that mask bugs, untyped params/returns, missing imports from `@shared/types`.
- **Error handling**: raw errors / stack traces exposed to clients; generic `catch(e) { throw e }`; Stripe errors not wrapped in NestJS exceptions (`BadRequest`, `NotFound`, etc.).
- **Blast-radius regressions**: cross-reference the Blast Radius Map — emit a CRITICAL finding for every `CallersAffected` entry.
- **Test coverage gaps**: emit a WARNING for every Map entry with `TestCoverage: none | partial` where behavior changed.

### Sub-agent D — Frontend & CSS
**Buckets:** `frontend-component`, `frontend-route`, `css`

- **Dark theme sync**: changes to `:root.dark` without matching `.dark` (or vice versa). `--sidebar` and `--sidebar-background` are separate — flag if only one is set when both should be.
- **API client choice**: Server Components / route handlers must use `apiServer`; Client Components must use `apiClient`. Flag mismatches.
- **Frontend validation**: forms missing Zod schemas.
- **Sandbox awareness**: hardcoded API URLs instead of `getApiUrl()`; missing `bos_session_test_` / `bos_session_live_` handling.

### Sub-agent E — Migrations (only if `migration` bucket has files)
**Buckets:** `migration`, `shared-types`

- Migration adds/changes columns but `packages/shared/types/database.ts` not regenerated in the same PR.
- Destructive ops (DROP, ALTER without backfill) lacking obvious safety steps.
- RLS policy changes on tenant tables — flag for human review even if they look correct.

## Phase 4 — Aggregation & Grouping

After all sub-agents return:

1. **Group repeats**: if the same finding appears in 3+ locations, collapse into one entry with a location list. Example: *"Missing `organization_id` filter (12 locations)"* with bullets, not 12 separate entries.
2. **Verify CRITICALs**: for each CRITICAL finding, do one sanity check before emitting — re-grep, re-read the line, or check `git blame` if the "missing" thing may have been deliberately removed. Drop findings that don't survive verification.
3. **Intent check**: cross-reference Phase 1 promised changes against what's actually in the diff. Note anything promised but missing.

## Phase 5 — Output

Group by **severity first, then category**. Skip empty severities and empty categories.

```
## CRITICAL (n)

### <Category>
- <description>
  Location(s): `path/to/file.ts:42`, `path/to/other.ts:88`
  Fix: <what to change>
  Why: <one line — what breaks if not fixed>

## WARNING (n)
...

## INFO (n)
...

## Blast Radius Notes
- <symbol> changed in <file:line>; <n> callers checked, all compatible.
- <symbol> changed; <n> callers affected — see CRITICAL above.

## Intent Check
- PR promised: <X> — found: ✓
- PR promised: <Y> — found: ✗ (no matching change in diff)

## Verdict
APPROVE | REQUEST_CHANGES | COMMENT
Summary: <2 sentences>
```

Severity levels:
- **CRITICAL**: production bug, security issue, data corruption, or breaks an identified caller. Must fix before merge.
- **WARNING**: edge-case risk or violates project conventions. Should fix.
- **INFO**: style or minor improvement. Nice to fix.
