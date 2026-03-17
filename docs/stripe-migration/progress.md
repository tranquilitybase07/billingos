# Stripe Migration — Progress Tracker

## Status: Design Phase

### Phase 1: Backend Foundation
- [ ] Database migration: `stripe_migrations` table + `accounts.connect_type` column
- [ ] Add `STRIPE_CLIENT_ID` to env config
- [ ] Create `migration` NestJS module with OAuth endpoints
- [ ] Implement OAuth flow (generate URL, handle callback, exchange code)

### Phase 2: Import Pipeline
- [ ] Product importer
- [ ] Price importer
- [ ] Customer importer
- [ ] Subscription importer
- [ ] Migration orchestrator

### Phase 3: Frontend
- [ ] Onboarding fork UI (new vs. connect existing)
- [ ] OAuth redirect handling
- [ ] Settings page migration option
- [ ] Migration status/progress display

### Phase 4: Polish
- [ ] Error handling & retry logic
- [ ] Idempotency verification
- [ ] Webhook handling for Standard accounts verification
