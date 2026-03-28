# Checkout & Portal Skill

This skill covers the iframe-based checkout and customer portal architecture: SDK integration, session token auth, iframe lifecycle, postMessage protocol, and common bugs.

## Architecture Overview

```
Merchant App → BillingOS SDK → API (session token auth) → iframe embed → postMessage back to SDK
```

The flow for both checkout and portal:
1. Merchant's server creates a session token using their API key (`sk_test_*`/`sk_live_*`)
2. Merchant's frontend passes the session token to the BillingOS SDK
3. SDK calls BOS API to create a checkout/portal session
4. SDK creates an iframe pointing to the BOS web app embed page
5. Iframe fetches data from BOS API using the session ID
6. Iframe communicates state changes back to the SDK via `postMessage`
7. SDK surfaces events to the merchant's app via callbacks

## Session Token Flow

### Token Format
```
bos_session_{environment}_{base64url_payload}.{hmac_sha256_signature}
```

### Token Payload
```typescript
{
  jti: string        // Unique ID: "tok_" + 16 random hex bytes
  iat: number        // Issued at (Unix timestamp)
  exp: number        // Expiry (Unix timestamp), default 1 hour, max 24 hours
  merchant_id: string        // Organization ID
  external_user_id: string   // Customer's ID in merchant's system
  external_organization_id?: string  // For B2B use cases
  allowed_operations?: string[]      // Scoped permissions
  metadata?: Record<string, any>     // Custom data (IP, user agent, etc.)
}
```

### Token Validation (SessionTokenAuthGuard)
1. Extract Bearer token from `Authorization` header
2. Verify HMAC-SHA256 signature using API key's signing secret
3. Check token not revoked (database lookup)
4. Validate expiry
5. Update `last_used_at` timestamp (fire-and-forget)
6. Attach to request: `request.sessionToken` (raw payload) + `request.customer` (convenience object)

### Token Prefix Routing
| Prefix | Environment | API Target |
|--------|-------------|------------|
| `bos_session_test_` | Sandbox | `sandbox-api.billingos.dev` |
| `bos_session_live_` | Production | `api.billingos.dev` |
| `bos_session_` (legacy) | Production | `api.billingos.dev` (backward compat) |

The SDK auto-detects the API URL from the token prefix — no URL config needed.

## Checkout Iframe Flow

### Session Creation
```
POST /v1/checkout/create  [SessionTokenAuthGuard]
Body: { priceId, customer details, metadata, mode, couponCode }
Returns: { id, clientSecret, paymentIntentId, amount, currency, totalAmount, status }
```

### Checkout Modes
| Mode | Description |
|------|-------------|
| `standard` | Simple payment form (Stripe Payment Element) |
| `adaptive` | Adaptive pricing with currency selector |
| `free` | Free product, no payment required |
| `trial` | Trial period with payment method capture |

### Iframe URL
```
{appUrl}/embed/checkout/{sessionId}?theme=dark&primary=ff0000&bg=000000&text=ffffff&radius=8px&font=Arial
```

### Iframe Lifecycle
1. SDK creates iframe → loads embed URL
2. `useCheckoutSession` hook fetches `GET /v1/checkout/:sessionId/status`
3. Renders two-panel layout: left (order summary), right (Stripe Payment Element)
4. Sends `CHECKOUT_READY` to parent when loaded
5. User submits payment → Stripe processes → webhook confirms
6. `POST /v1/checkout/:sessionId/confirm` (or `confirm-free`) creates subscription
7. Sends `CHECKOUT_SUCCESS` to parent with subscription details
8. SSE stream (`GET /v1/checkout/:sessionId/stream`) provides real-time status updates

### Checkout Endpoints (no auth after session creation)
```
GET  /v1/checkout/:sessionId/status         # Session details + validation
POST /v1/checkout/:sessionId/confirm        # Confirm paid checkout
POST /v1/checkout/:sessionId/confirm-free   # Confirm free checkout
POST /v1/checkout/:sessionId/apply-discount # Apply coupon code
DELETE /v1/checkout/:sessionId/discount     # Remove discount
GET  /v1/checkout/:sessionId/stream         # SSE status stream (polls every 2s)
```

### PostMessage Protocol — Checkout

**Incoming (parent → iframe):**
| Type | Payload | Purpose |
|------|---------|---------|
| `INIT_CHECKOUT` | `{ config }` | Initialize with theme/locale/variables |
| `UPDATE_CONFIG` | `{ config }` | Update theme/styling at runtime |
| `CLOSE_CHECKOUT` | — | Request iframe close |

**Outgoing (iframe → parent):**
| Type | Payload | Purpose |
|------|---------|---------|
| `CHECKOUT_READY` | — | Iframe loaded and data fetched |
| `CHECKOUT_SUCCESS` | `{ subscription: { id, customerId, productId, priceId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } }` | Payment confirmed, subscription created |
| `CHECKOUT_ERROR` | `{ error }` | Error occurred |
| `CHECKOUT_CLOSE` | — | User clicked close |
| `HEIGHT_CHANGED` | `{ height }` | Iframe content height changed |
| `PROCESSING` | — | Payment is processing |
| `3DS_REQUIRED` | — | 3D Secure authentication needed |

## Portal Iframe Flow

### Session Creation
```
POST /v1/portal/create  [SessionTokenAuthGuard]
Body: { customerId? }  // Optional; defaults to external_user_id from token
Returns: { id, customerId, organizationId, expiresAt }  // 24-hour session
```

### Iframe URL
```
{appUrl}/embed/portal/{portalSessionId}?tab=plan&theme=dark&accent=ff0000
```

### Iframe Lifecycle
1. SDK creates iframe → loads embed URL
2. `usePortalData` hook fetches `GET /v1/portal/:sessionId/data`
3. Renders tabbed interface: Plan, Invoices, Payment Methods, Settings
4. Sends `PORTAL_READY` to parent when data loaded
5. User actions (cancel, update payment, etc.) call portal endpoints
6. Sends event messages to parent on state changes
7. `HEIGHT_CHANGED` sent on tab switches, data loads, window resize

### Portal Data Endpoint
`GET /v1/portal/:sessionId/data` aggregates:
- Customer profile (BOS + Stripe)
- Subscriptions with product/price/feature details (BOS)
- Invoices (Stripe — fetched live via customer's `stripe_customer_id`)
- Payment methods (Stripe — fetched live)
- Usage metrics (BOS `usage_records`)
- Organization name

### Portal Action Endpoints
```
POST   /v1/portal/:sessionId/cancel-subscription        # Cancel sub (end_of_period | immediate)
PATCH  /v1/portal/:sessionId/customer                    # Update name/email/address → syncs to Stripe
POST   /v1/portal/:sessionId/setup-intent                # Create SetupIntent for new payment method
DELETE /v1/portal/:sessionId/payment-methods/:pmId        # Detach payment method
PATCH  /v1/portal/:sessionId/default-payment-method       # Set default PM
GET    /v1/portal/:sessionId/subscriptions/:subId/available-plans  # Plans for upgrade/downgrade
POST   /v1/portal/:sessionId/subscriptions/:subId/preview-change   # Preview plan change
POST   /v1/portal/:sessionId/subscriptions/:subId/change-plan      # Execute plan change
```

### PostMessage Protocol — Portal

**Incoming (parent → iframe):**
| Type | Payload | Purpose |
|------|---------|---------|
| `INIT_PORTAL` | `{ config }` | Initialize with theme/locale/defaultTab/variables |
| `UPDATE_CONFIG` | `{ config }` | Update theme/styling at runtime |
| `CLOSE_PORTAL` | — | Request iframe close |

**Config variables:**
```typescript
{
  theme?: 'light' | 'dark' | 'auto'
  locale?: string
  defaultTab?: string
  variables?: {
    colorPrimary?: string
    colorBackground?: string
    colorText?: string
    borderRadius?: string
    fontFamily?: string
  }
}
```

**Outgoing (iframe → parent):**
| Type | Payload | Purpose |
|------|---------|---------|
| `PORTAL_READY` | — | Iframe loaded and data fetched |
| `PORTAL_CLOSE` | — | User requested close |
| `SUBSCRIPTION_UPDATED` | `{ subscription }` | Plan changed |
| `SUBSCRIPTION_CANCELLED` | `{ subscriptionId, timing }` | Subscription cancelled |
| `PAYMENT_METHOD_ADDED` | `{ paymentMethod }` | New payment method added |
| `PAYMENT_METHOD_UPDATED` | `{ paymentMethod }` | Default PM changed |
| `HEIGHT_CHANGED` | `{ height }` | Content height changed |
| `OPEN_PRICING_TABLE` | — | User wants to see pricing table |
| `CLOSE_PRICING_TABLE` | — | Pricing table dismissed |
| `ERROR` | `{ error }` | Error occurred |

## Common Bugs & Pitfalls

### useEffect Dependency Bug (CRITICAL)
The `useEffect` in `useCheckoutSession` and `usePortalSession` hooks must depend on `[enabled, client]`, NOT just `[enabled]`.

**Why**: When `sessionTokenUrl` is used, `client` is `null` on mount. The effect runs but exits early (no client). When the token arrives and `client` is created, the effect must re-run. Without `client` in the dependency array, it never re-runs → checkout/portal never loads.

**Files**:
- `src/components/CustomerPortal/hooks/usePortalSession.ts`
- `src/components/CheckoutModal/hooks/useCheckoutSession.ts`

### NEXT_PUBLIC_API_URL Required for Embeds
The embed pages (`/embed/portal/*`, `/embed/checkout/*`) fetch data from the BOS API. They need `NEXT_PUBLIC_API_URL` to be set in the web app's environment. Without it, fetches go to the wrong URL.

### Never Convert Iframe to Inline Rendering
The portal and checkout are designed as iframe embeds. The SDK creates iframes that load from the BOS web app. Do NOT attempt to convert these to inline React components — the iframe boundary provides:
- Security isolation (merchant can't access BOS internals)
- Session scoping (session ID in URL, not in merchant's DOM)
- Independent styling (CSS vars set via query params)
- Cross-origin communication via structured postMessage protocol

### Theme/Color Validation
Query params for theme/colors are validated server-side with regex before being set as CSS variables. This prevents XSS via injected CSS. An inline script sets CSS vars before React hydration to prevent FOUC (flash of unstyled content).

### Outgoing postMessage Uses `'*'` Origin
`postMessage(msg, '*')` is safe because messages contain no secrets — only status events and UI state. The session tokens and API keys never reach the iframe's frontend.

### Discount Application May Return New clientSecret
When `POST /v1/checkout/:sessionId/apply-discount` recalculates the total, Stripe may update the PaymentIntent. The response may include a new `clientSecret` that the frontend must use to update the Stripe Payment Element.

## Key File Paths

### Backend (apps/api/src/)
| File | Purpose |
|------|---------|
| `session-tokens/session-tokens.service.ts` | Token generation (HMAC-SHA256), validation, revocation |
| `session-tokens/session-tokens.controller.ts` | `POST /v1/session-tokens` |
| `auth/guards/session-token-auth.guard.ts` | `SessionTokenAuthGuard` — validates tokens, attaches customer context |
| `v1/portal/portal.controller.ts` | Portal endpoints |
| `v1/portal/portal.service.ts` | Portal session creation, data aggregation, actions |
| `v1/checkout/checkout.controller.ts` | Checkout endpoints |
| `v1/checkout/checkout.service.ts` | Checkout session creation, payment flow, discount handling |

### Frontend (apps/web/src/app/embed/)
| File | Purpose |
|------|---------|
| `portal/[portalSessionId]/page.tsx` | Portal embed page, query param parsing |
| `portal/[portalSessionId]/components/PortalContent.tsx` | Main portal component, tab management, parent messaging |
| `portal/[portalSessionId]/hooks/usePortalData.ts` | Fetches portal data from API |
| `portal/[portalSessionId]/hooks/useParentMessaging.ts` | iframe ↔ parent postMessage |
| `checkout/[sessionId]/page.tsx` | Checkout embed page |
| `checkout/[sessionId]/components/CheckoutContent.tsx` | Main checkout layout (two-panel) |
| `checkout/[sessionId]/components/CheckoutForm.tsx` | Stripe Payment Element wrapper |
| `checkout/[sessionId]/hooks/useCheckoutSession.ts` | Fetches checkout session status |
| `checkout/[sessionId]/hooks/useParentMessaging.ts` | iframe ↔ parent postMessage |
