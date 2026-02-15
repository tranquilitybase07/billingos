# BillingOS Project Context

## Project Overview

**Name**: BillingOS
**Type**: Billing and Subscription Management Platform
**Stage**: MVP Development (68% Complete)
**Repository**: /Users/ankushkumar/Code/billingos

## Mission Statement

Build a comprehensive billing infrastructure for small SaaS startups that provides a fully embedded, no-redirect payment experience with usage-based pricing and feature gating capabilities.

## Business Model

### Pricing Structure
- **Initial Phase**: Transaction-based (0.5% + $0.30 per transaction)
- **Transition Point**: $50/month in fees (~$5,000 monthly volume)
- **Subscription Tiers**:
  - Starter: $29/month
  - Growth: $99/month
  - Scale: $299/month
  - Enterprise: Custom pricing

### Target Market
- **Primary**: Small SaaS startups (<$10K MRR)
- **Secondary**: Growing SaaS companies needing advanced billing
- **Launch Strategy**: Soft launch with 1-3 beta customers

## Technical Architecture

### Tech Stack
- **Frontend**: Next.js 16, React 19, TypeScript, TailwindCSS 4
- **Backend**: NestJS with TypeScript
- **Database**: PostgreSQL via Supabase
- **Authentication**: Supabase Auth
- **Payments**: Stripe & Stripe Connect
- **Infrastructure**: pnpm monorepo

### Repository Structure
```
/Users/ankushkumar/Code/billingos/
├── apps/
│   ├── web/     # Next.js frontend
│   └── api/     # NestJS backend
├── packages/
│   └── shared/  # Shared types
└── docs/        # Documentation
```

### Related Projects
- **SDK**: /Users/ankushkumar/Code/billingos-sdk/
- **Test App**: /Users/ankushkumar/Code/billingos-testprojects/my-app/
- **Reference**: /Users/ankushkumar/Code/payment/billingos (Polar.sh)

## Core Features

### Platform (MVP)
1. **Merchant Dashboard**
   - Product & pricing management
   - Customer management
   - Subscription management
   - Analytics dashboard
   - Team management

2. **Billing Engine**
   - Payment processing via Stripe
   - Subscription lifecycle
   - Usage metering & limits
   - Invoice generation
   - Transaction fee calculation

3. **Integrations**
   - Stripe Connect for payouts
   - Webhook handling
   - API for SDK

### SDK (MVP)
1. **UI Components**
   - Checkout Modal (embedded)
   - Pricing Table
   - Customer Portal Widget
   - Usage Display

2. **Hooks & APIs**
   - React hooks for all operations
   - TypeScript support
   - Session-based auth
   - Error handling

## Key Differentiators

1. **No-Redirect Experience**: Everything happens in modal/iframe
2. **Usage-Based Transition**: Start with transactions, graduate to subscriptions
3. **Developer-First**: Comprehensive SDK with great DX
4. **Small Business Focus**: Designed for startups, not enterprise
5. **Transparent Pricing**: Simple 0.5% + $0.30 transaction fee

## Success Metrics

### MVP Launch (Feb 19, 2026)
- 1-3 beta customers
- 100+ transactions processed
- <1% payment failure rate
- Zero security incidents

### 30 Days Post-Launch
- 10 active customers
- $10K payment volume
- 50% transition to subscriptions
- NPS > 50

### 6 Months
- 100 active customers
- $100K monthly volume
- 70% on subscription plans
- Break-even on operations

## Development Principles

1. **Reference Polar.sh**: Always check Polar implementation first
2. **Document Everything**: plan.md → progress.md → final.md
3. **Production-Grade**: This handles payments, no shortcuts
4. **MVP Focus**: Ship essential features, iterate later
5. **No Redirects**: Maintain embedded experience throughout

## Current Challenges

1. **Frontend Gap**: Missing critical UI pages (customers, subscriptions, analytics)
2. **SDK Components**: Core modal components not built
3. **Production Setup**: Deployment configuration incomplete
4. **Time Constraint**: 2 weeks to MVP launch

## Competitive Landscape

- **Stripe Billing**: Complex, expensive, requires integration
- **Paddle**: Good but redirect-heavy
- **Chargebee**: Enterprise-focused, complex
- **LemonSqueezy**: Simple but limited features
- **BillingOS**: Simple, embedded, startup-friendly

---

*Last Updated: February 9, 2026*
*Next Review: February 12, 2026 (Sprint Start)*