# BillingOS Architecture Plan - Executive Summary

**Date:** January 3, 2026
**Status:** Approved
**Team Size:** 4 developers
**Timeline:** 3 weeks to MVP

---

## The Decision: Hybrid Architecture

**Approach:** Stripe Connect + PostgreSQL Cache + AI Intelligence Layer

**NOT:** Building a Stripe competitor (like Polar did)
**YES:** Building intelligence ON TOP of Stripe

---

## Why Hybrid?

### The Problem We Solved
After deep research into Polar's architecture, we discovered they spent months building their own billing engine from scratch. While this gives them ultimate control, it's not our core value proposition.

**Our Insight:** BillingOS's value isn't in managing subscriptions - it's in the **intelligence layer** that helps merchants grow revenue through:
- AI-powered churn prediction
- Smart upgrade recommendations
- Automated retention workflows
- Revenue analytics & insights

### The Solution
**Use Stripe for what it's good at:**
- Payment processing ✅
- Subscription management ✅
- Compliance & security ✅
- Global payment methods ✅

**Build our differentiation:**
- AI/ML insights 🤖
- Advanced analytics 📊
- Retention automation 🎯
- Developer experience 💻

---

## Architecture at a Glance

```
Merchant App → BillingOS SDK → BillingOS API → PostgreSQL (cache)
                                               → Stripe API (source of truth)
                                               ↑
                                    Webhooks (sync cache)
```

**Key Pattern:** Dual-write (Stripe first, then cache in DB)

**Read Path:** PostgreSQL/Redis cache (2-5ms)
**Write Path:** Stripe API + PostgreSQL (50-200ms, reliable)
**Sync:** Webhooks (real-time) + Reconciliation job (hourly)

---

## What We Already Have ✅

1. **Stripe Connect Integration**
   - Create Connect accounts for organizations
   - Onboarding flow
   - Dashboard links
   - File: `apps/api/src/account/account.service.ts`

2. **Webhook Infrastructure**
   - Webhook endpoint with signature verification
   - Event storage in `webhook_events` table
   - Idempotency handling
   - File: `apps/api/src/stripe/stripe-webhook.service.ts`

3. **Organization Management**
   - User authentication (Supabase)
   - Organization creation
   - Member management
   - Database schema

**Completion:** ~30% of infrastructure already built!

---

## What We Need to Build

### Week 1: Foundation (Database + Core APIs)
- Customers table (merchant's end users)
- Subscriptions table (cache from Stripe)
- Entitlements table (feature access)
- Usage records table (metering)
- Core API endpoints (create subscription, check entitlements, track usage)
- SDK package (@billingos/sdk)

### Week 2: Intelligence Layer (Our Differentiation)
- AI churn prediction engine
- Smart upgrade nudge system
- Revenue analytics dashboard
- Dunning & retention workflows

### Week 3: Polish & Launch
- Customer portal (subscription management)
- Merchant dashboard (insights & alerts)
- Documentation & examples
- Production deployment

---

## The Merchant Experience

### What Merchants See:
```
1. Sign up to BillingOS (not Stripe!)
2. Complete onboarding
3. Get API keys
4. Integrate SDK in their app
5. Start tracking subscriptions & usage
6. See AI-powered insights in dashboard
```

**Key:** Merchants never know Stripe exists - it's pure BillingOS branding.

### What Happens Behind the Scenes:
```
1. We create Stripe Connect account for merchant ✅ (already working)
2. We create customers in their Connect account (new)
3. We create subscriptions in Stripe (new)
4. We cache data in PostgreSQL for fast reads (new)
5. We run AI analysis on cached data (new)
6. We show insights in BillingOS dashboard (new)
```

---

## Migration Path (Future)

**Trigger:** 100+ paying merchants (product-market fit validated)

**Strategy:** Gradual migration from Stripe APIs to full DB ownership
- Start: Stripe subscriptions + DB cache (Week 1)
- Middle: Dual-mode support (both Stripe & DB subscriptions)
- End: DB-owned subscriptions, Stripe only for payments (like Polar)

**Timeline:** 6-12 months after hitting 100 merchants

**Why wait?** Validate business model first, then optimize architecture.

---

## Team Allocation (4 Developers)

**Week 1-3: Parallel Development**

**Ankush (Full Stack Lead):** Backend & Infrastructure
- PostgreSQL schema
- Core APIs (customers, subscriptions, entitlements)
- Webhook handlers
- Reconciliation job
- AI/Intelligence layer

**Aakash (FE1):** Merchant Dashboard Lead
- Dashboard UI pages
- Revenue analytics components
- React Query integration
- Simple analytics APIs

**Rames (FE2):** SDK & Customer Portal
- TypeScript SDK package
- OpenAPI spec
- Customer portal UI
- SDK documentation

**Abdul (FE3):** Dashboard Components & Testing
- Reusable UI components
- Dashboard features (alerts, insights)
- Integration testing
- QA & documentation

**Weeks 2-3: Collaboration**
- Customer portal (Ankush + Rames)
- Merchant dashboard (Aakash + Abdul)

---

## Success Metrics

### Technical Milestones
- [ ] API response time: <10ms for entitlement checks
- [ ] Webhook processing: <1s end-to-end
- [ ] Reconciliation: 99.9% consistency
- [ ] SDK bundle size: <50KB

### Business Milestones
- [ ] First merchant integrated (Week 3)
- [ ] 10 merchants (Month 1)
- [ ] First AI-driven upgrade (Month 2)
- [ ] 100 merchants → trigger migration planning (Month 6-12)

---

## Key Decisions

### ✅ Approved Decisions

1. **Hybrid Architecture:** Stripe APIs + PostgreSQL cache
2. **Stripe Connect:** Create Express accounts for merchants (white-label experience)
3. **Dual-Write Pattern:** Write to Stripe first, cache in DB immediately
4. **Reconciliation:** Hourly job to catch missed webhooks
5. **Migration Trigger:** 100+ paying merchants
6. **Team Structure:** 4 devs in parallel for 3 weeks

### ❌ Rejected Approaches

1. **Pure Stripe APIs:** Too slow for analytics, no intelligence layer
2. **Pure DB (Polar's approach):** Too complex, not our differentiation
3. **OAuth to merchant Stripe accounts:** Less white-label, more complex onboarding

---

## Risk Mitigation

### Technical Risks
| Risk | Mitigation |
|------|------------|
| Webhook failures | Hourly reconciliation job + retry logic |
| Cache inconsistency | Write to Stripe first (source of truth) |
| Stripe API rate limits | Cache 99% of reads in PostgreSQL |
| Migration complexity | Build migration-ready schema from day 1 |

### Business Risks
| Risk | Mitigation |
|------|------------|
| Stripe dependency | Plan migration at 100 merchants |
| Competition (Baremetrics, etc.) | Focus on AI differentiation |
| Slow merchant adoption | Exceptional SDK developer experience |

---

## Cost Estimate (Monthly)

**Until 100 merchants:**
- Supabase: $25 (Pro plan)
- Railway/Render: $20 (API hosting)
- Stripe fees: Pay-as-you-go
- Redis: $10 (Upstash)
- **Total:** ~$55/month + Stripe fees

**At 100 merchants:**
- Infrastructure: ~$500/month
- Stripe fees: Variable (pass-through to merchants)

---

## Next Steps

**Immediate (Today):**
1. Ankush reviews architecture docs
2. Share docs/plan/ with Aakash, Rames, Abdul
3. Set up project board (Week 1-3 tasks)

**Week 1 Kickoff (Monday):**
1. Ankush creates database migrations
2. Team sets up development branches
3. Start parallel development tracks

**Week 2 Check-in:**
1. Ankush demos core APIs
2. Rames tests SDK integration
3. Begin AI model development

**Week 3 Launch:**
1. Production deployment
2. First merchant onboarding
3. Public launch

---

## Documentation Roadmap

**This Week (Planning Phase):**
- [x] Executive Summary (this doc)
- [x] Hybrid Architecture (detailed)
- [x] Implementation Roadmap (3 weeks)
- [x] Migration Strategy (future)
- [x] Next Steps (immediate actions)

**Next Week (Implementation Phase):**
- [ ] Database Schema Specification
- [ ] API Endpoint Specifications
- [ ] SDK Usage Guide
- [ ] Webhook Event Handlers
- [ ] Reconciliation Job Design

**Week 3 (Launch Phase):**
- [ ] Merchant Onboarding Guide
- [ ] Developer SDK Documentation
- [ ] Dashboard User Guide
- [ ] Operations Runbook

---

## Conclusion

**The Hybrid Architecture gives us:**
- ✅ Fast time to market (3 weeks vs 8 weeks)
- ✅ Lower risk (Stripe handles billing complexity)
- ✅ Focus on differentiation (AI, analytics, retention)
- ✅ Natural migration path (when we hit scale)
- ✅ White-label experience (merchants never see Stripe)

**This is the pragmatic path to building a successful billing platform.**

Start with the hybrid approach, validate product-market fit, then evolve architecture as you scale.

---

**Read Next:**
- `01-hybrid-architecture.md` - Detailed architecture & data flow
- `02-implementation-roadmap.md` - Week-by-week tasks
- `03-migration-strategy.md` - Future migration to full DB ownership
- `04-next-steps.md` - Immediate actions to take today
