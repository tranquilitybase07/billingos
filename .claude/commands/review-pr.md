Review the current PR or recent changes against BillingOS coding standards. Run through the full 10-point checklist below and report findings.

## Instructions

1. Get the diff to review. If a PR number is provided as an argument, fetch its diff. Otherwise, diff the current branch against main: `git diff main...HEAD`
2. Read every changed file in full (not just the diff) to understand context
3. Run every checklist item against every changed file
4. Report findings in the format specified below

## 10-Point Review Checklist

### 1. Multi-Tenant Scoping
Every database query on tenant data MUST include `organization_id` in the WHERE clause. Check for:
- SELECT/UPDATE/DELETE queries missing `organization_id` filter
- Supabase `.from()` calls without `.eq('organization_id', ...)`
- Any path where a user could access another org's data

### 2. Stripe Sync Correctness
Stripe is authoritative for shared entities (products, prices, subscriptions, invoices, payment state). Check for:
- BOS record updated without first confirming Stripe operation succeeded
- Missing `stripeAccount` param on Connect calls (resolution: `org → account → stripe_id`)
- Direct Stripe SDK usage outside `StripeService`
- BOS proceeding as if Stripe write succeeded when it failed
- Missing `stripe_sync_events` logging for sync operations
- Usage/metering or feature access checks incorrectly calling Stripe (these are BOS-only)

### 3. Auth Guard Usage
Every endpoint must use the correct guard. Check for:
- Dashboard endpoints missing `@UseGuards(JwtAuthGuard)`
- SDK/embed endpoints (`/v1/*`) missing `@UseGuards(SessionTokenAuthGuard)`
- Server-to-server endpoints missing `@UseGuards(ApiKeyAuthGuard)`
- Endpoints with no auth guard at all

### 4. Input Validation
All inputs must be validated. Check for:
- Controller methods accepting raw `@Body()` without a DTO class
- DTO classes missing `class-validator` decorators
- Frontend forms missing Zod validation
- Missing `@IsString()`, `@IsUUID()`, `@IsEnum()`, etc. on DTO fields

### 5. Error Handling
Errors must be safe and informative. Check for:
- Raw error messages or stack traces exposed to clients
- Missing try/catch around Stripe API calls
- Generic `catch(e) { throw e }` without proper NestJS exception wrapping
- Stripe errors not re-thrown as appropriate HTTP exceptions (BadRequest, NotFound, etc.)

### 6. Webhook Safety
Webhook handling has strict requirements. Check for:
- Any middleware that could parse the request body before `/stripe/webhooks`
- Missing idempotency checks (Redis + DB dual-layer)
- Webhook handlers that don't store events in `webhook_events` table
- Handlers that swallow errors instead of throwing (Stripe needs 500 to retry)

### 7. Type Safety
TypeScript strict mode is enforced. Check for:
- Unnecessary `any` types (especially in new code)
- Missing imports from `@shared/types` when using database types
- Type assertions (`as`) that could mask bugs
- Untyped function parameters or return values

### 8. Dark Theme CSS Sync
Two CSS blocks must stay in sync. Check for:
- Changes to `:root.dark` block without matching changes in `.dark` block (or vice versa)
- New CSS variables added to one block but not the other
- `--sidebar` vs `--sidebar-background` confusion (these are separate vars, set both)

### 9. Sandbox Awareness
Sandbox/production separation must be maintained. Check for:
- Hardcoded API URLs instead of using `getApiUrl()` or token prefix routing
- Missing environment checks where sandbox behavior differs
- Session token handling that doesn't account for `test_`/`live_` prefixes
- Stripe test mode vs live mode assumptions

### 10. Product Versioning
Product mutations must handle active subscriptions. Check for:
- Product updates that don't check for active subscriptions
- Direct price/feature modifications that bypass versioning logic
- Missing `version_status` handling when creating/updating products
- Queries that don't filter by `version_status: 'current'` when listing products

## Output Format

For each finding, output:

```
[SEVERITY] Category: description
  File: path/to/file.ts:line_number
  Fix: what to change
```

Severity levels:
- **CRITICAL**: Will cause bugs, security issues, or data corruption in production. Must fix before merge.
- **WARNING**: Could cause issues in edge cases or violates conventions. Should fix.
- **INFO**: Style, best practice, or minor improvement. Nice to fix.

Group findings by file. If a checklist item has no findings, skip it (don't list "no issues found").

End with a summary: total findings by severity, and an overall verdict (APPROVE, REQUEST_CHANGES, or COMMENT).
