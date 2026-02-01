# Ramesh - SDK Integration + Customer Portal Tasks

**Role:** Frontend Developer (SDK & Customer Portal)
**Sprint Duration:** 2-3 weeks
**Total Tasks:** 7

## Week 1: SDK Repository Setup (Days 1-5)

### Task 1: Merge SDK Components to Main Branch ⭐ CRITICAL - DAY 1
**Estimated Time:** 2-4 hours (Day 1 - MUST COMPLETE)
**Dependencies:** None
**Blocks:** All other tasks
**Priority:** HIGHEST

#### Description
Bring all SDK components from the separate branch/repo into the main BillingOS monorepo.

#### Current Situation
- SDK components (checkout page, pricing table, payment page) are in a separate branch/repo
- Need to integrate into main codebase for testing and deployment

#### Implementation Steps

##### Step 1: Identify SDK Components Location
- Confirm current location of SDK components
- List all files that need to be merged
- Document component dependencies

##### Step 2: Choose Integration Strategy

**Option A: Create SDK Package in Monorepo**
```bash
cd /Users/ankushkumar/Code/billingos
mkdir -p packages/sdk
```

**Option B: Add to Web App**
```bash
cd /Users/ankushkumar/Code/billingos/apps/web
mkdir -p src/components/SDK
```

**Recommendation:** Option A (separate package) for better separation and reusability

##### Step 3: Copy Components
```bash
# Example structure for packages/sdk
packages/sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Main exports
│   ├── components/
│   │   ├── Checkout/
│   │   │   ├── index.tsx           # Checkout component
│   │   │   └── checkout.module.css
│   │   ├── PricingTable/
│   │   │   ├── index.tsx
│   │   │   └── pricing-table.module.css
│   │   └── CustomerPortal/
│   │       ├── index.tsx
│   │       └── portal.module.css
│   ├── types/
│   │   └── index.ts                # TypeScript types
│   └── utils/
│       └── api.ts                  # API helper functions
└── README.md
```

##### Step 4: Create Package Configuration
```json
// packages/sdk/package.json
{
  "name": "@billingos/sdk",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "dev": "tsup src/index.ts --format esm,cjs --dts --watch"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

##### Step 5: Update Root pnpm-workspace.yaml
```yaml
# /Users/ankushkumar/Code/billingos/pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'  # Make sure this line exists
```

##### Step 6: Install Dependencies
```bash
cd /Users/ankushkumar/Code/billingos
pnpm install
```

##### Step 7: Test Import in Web App
```typescript
// apps/web/src/app/test-sdk/page.tsx (temporary test page)
import { Checkout, PricingTable } from '@billingos/sdk';

export default function TestSDKPage() {
  return (
    <div>
      <PricingTable />
      <Checkout />
    </div>
  );
}
```

##### Step 8: Create Pull Request
- Create PR with title: "feat: Add SDK package to monorepo"
- Document all components added
- Include screenshots of components
- Get team review

#### Files to Create
- `packages/sdk/package.json`
- `packages/sdk/tsconfig.json`
- `packages/sdk/src/index.ts`
- `packages/sdk/src/components/Checkout/index.tsx`
- `packages/sdk/src/components/PricingTable/index.tsx`
- `packages/sdk/src/components/CustomerPortal/index.tsx`
- `packages/sdk/README.md`

#### Testing Checklist
- [ ] SDK package builds successfully
- [ ] Components can be imported in web app
- [ ] TypeScript types work
- [ ] No build errors
- [ ] Hot reload works in dev mode

---

### Task 2: Study Polar's Checkout & Portal ⭐ RESEARCH
**Estimated Time:** 6-8 hours (Days 2-3)
**Dependencies:** Task 1 complete
**Deliverable:** Documentation of Polar's SDK patterns

#### Description
Analyze how Polar implements embedded checkout and customer portal.

#### Research Steps

##### 1. Navigate to Polar Repository
```bash
cd /Users/ankushkumar/Code/payment/billingos
```

##### 2. Find Checkout Implementation
```bash
# Search for checkout-related files
find . -name "*checkout*" -type f | grep -E "\.(tsx|ts)$"
find . -name "*pricing*" -type f | grep -E "\.(tsx|ts)$"
```

##### 3. Document Key Findings (`docs/sprint-beta-launch/polar-sdk-analysis.md`)

**Checkout Flow:**
- [ ] How is the checkout modal/page triggered?
- [ ] What props does the Checkout component accept?
- [ ] How are products/prices passed to checkout?
- [ ] How is payment processed (Stripe Elements, Payment Links)?
- [ ] Success/failure handling
- [ ] Redirect URLs after payment

**Pricing Table:**
- [ ] Layout structure (grid, list, cards)
- [ ] How are features displayed per plan?
- [ ] CTA buttons for each plan
- [ ] Plan comparison toggle (monthly/annual)
- [ ] Highlighted "Popular" plan
- [ ] Custom pricing options

**Customer Portal:**
- [ ] Authentication method (session token, magic link)
- [ ] Portal sections (subscription, invoices, payment method, usage)
- [ ] Upgrade/downgrade flow
- [ ] Cancellation flow with retention offers
- [ ] Invoice download functionality

##### 4. Identify Components to Copy
```markdown
## SDK Components to Build (Based on Polar)

### Checkout
- CheckoutModal.tsx - Main checkout container
- CheckoutForm.tsx - Payment form with Stripe Elements
- ProductSelection.tsx - Product/plan selector
- PaymentMethodInput.tsx - Card input component
- CheckoutSummary.tsx - Order summary sidebar

### Pricing Table
- PricingTable.tsx - Main wrapper
- PricingCard.tsx - Individual plan card
- PricingToggle.tsx - Monthly/Annual switch
- FeatureList.tsx - Feature comparison list

### Customer Portal
- PortalLayout.tsx - Portal shell with navigation
- SubscriptionSection.tsx - Current plan & usage
- BillingSection.tsx - Invoices & payment method
- UsageSection.tsx - Feature usage metrics
- CancelFlow.tsx - Multi-step cancellation
```

##### 5. Document Integration Patterns
- [ ] How to embed in iframe vs React component
- [ ] API authentication for portal sessions
- [ ] Webhook handling for checkout completion
- [ ] Error handling and retry logic

##### 6. Take Screenshots
- Capture all major SDK UIs from Polar
- Document responsive layouts
- Note animations and transitions

#### Deliverables
- `docs/sprint-beta-launch/polar-sdk-analysis.md` (comprehensive research doc)
- Component architecture diagram
- Integration examples (iframe + React)
- UI screenshots from Polar

---

### Task 3: Refactor SDK Components for Integration ⭐ HIGH PRIORITY
**Estimated Time:** 10-14 hours (Days 3-5)
**Dependencies:** Tasks 1 & 2 complete

#### Description
Refactor existing SDK components to match Polar's patterns and work with BillingOS backend.

#### Implementation Steps

##### Step 1: Create TypeScript Types
```typescript
// packages/sdk/src/types/index.ts

export type Product = {
  id: string;
  name: string;
  description: string;
  prices: Price[];
};

export type Price = {
  id: string;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  productId: string;
};

export type CheckoutConfig = {
  organizationId: string;
  priceId: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  allowPromoCodes?: boolean;
};

export type PricingTableConfig = {
  organizationId: string;
  products: Product[];
  onSelectPlan?: (priceId: string) => void;
  highlightedPriceId?: string;
  billingPeriod?: 'month' | 'year';
};

export type PortalConfig = {
  customerId: string;
  sessionToken: string;
};
```

##### Step 2: Build Checkout Component
```typescript
// packages/sdk/src/components/Checkout/index.tsx
'use client';

import { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { CheckoutConfig } from '../../types';

// Initialize Stripe (passed as prop or environment variable)
let stripePromise: Promise<Stripe | null>;

interface CheckoutProps {
  config: CheckoutConfig;
  stripePublishableKey: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function Checkout({ config, stripePublishableKey, onSuccess, onCancel }: CheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Stripe
    if (!stripePromise) {
      stripePromise = loadStripe(stripePublishableKey);
    }

    // Create PaymentIntent on mount
    fetch('/api/checkout/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.clientSecret));
  }, [config, stripePublishableKey]);

  if (!clientSecret) {
    return <div>Loading checkout...</div>;
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm config={config} onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
}

function CheckoutForm({ config, onSuccess, onCancel }: {
  config: CheckoutConfig;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: config.successUrl,
      },
    });

    if (error) {
      setErrorMessage(error.message || 'Payment failed');
      setIsProcessing(false);
    } else {
      onSuccess?.();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      <div className="checkout-header">
        <h2>Complete your purchase</h2>
      </div>

      <div className="payment-element-container">
        <PaymentElement />
      </div>

      {errorMessage && (
        <div className="error-message" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="checkout-actions">
        <button type="button" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </button>
        <button type="submit" disabled={!stripe || isProcessing}>
          {isProcessing ? 'Processing...' : 'Pay now'}
        </button>
      </div>
    </form>
  );
}
```

##### Step 3: Build Pricing Table Component
```typescript
// packages/sdk/src/components/PricingTable/index.tsx
'use client';

import { useState } from 'react';
import type { PricingTableConfig, Product, Price } from '../../types';

export function PricingTable({ config }: { config: PricingTableConfig }) {
  const [billingPeriod, setBillingPeriod] = useState<'month' | 'year'>(
    config.billingPeriod || 'month'
  );

  const handleSelectPlan = (priceId: string) => {
    config.onSelectPlan?.(priceId);
  };

  return (
    <div className="pricing-table">
      {/* Billing Period Toggle */}
      <div className="billing-toggle">
        <button
          className={billingPeriod === 'month' ? 'active' : ''}
          onClick={() => setBillingPeriod('month')}
        >
          Monthly
        </button>
        <button
          className={billingPeriod === 'year' ? 'active' : ''}
          onClick={() => setBillingPeriod('year')}
        >
          Annual
          <span className="badge">Save 20%</span>
        </button>
      </div>

      {/* Pricing Cards */}
      <div className="pricing-grid">
        {config.products.map((product) => {
          const price = product.prices.find((p) => p.interval === billingPeriod);
          if (!price) return null;

          const isHighlighted = price.id === config.highlightedPriceId;

          return (
            <div
              key={product.id}
              className={`pricing-card ${isHighlighted ? 'highlighted' : ''}`}
            >
              {isHighlighted && <div className="popular-badge">Most Popular</div>}

              <div className="pricing-header">
                <h3>{product.name}</h3>
                <p className="description">{product.description}</p>
              </div>

              <div className="pricing-amount">
                <span className="currency">$</span>
                <span className="amount">{(price.amount / 100).toFixed(0)}</span>
                <span className="interval">/{billingPeriod}</span>
              </div>

              <button
                className="select-plan-button"
                onClick={() => handleSelectPlan(price.id)}
              >
                Get Started
              </button>

              {/* Features list would go here */}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

##### Step 4: Add Styling (CSS Modules or Tailwind)
```css
/* packages/sdk/src/components/Checkout/checkout.module.css */
.checkout-form {
  max-width: 500px;
  margin: 0 auto;
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.checkout-header {
  margin-bottom: 2rem;
}

.payment-element-container {
  margin-bottom: 1.5rem;
}

.error-message {
  color: #dc2626;
  padding: 0.75rem;
  background: #fee2e2;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.checkout-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.checkout-actions button {
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
}

.checkout-actions button[type='submit'] {
  background: #2563eb;
  color: white;
  border: none;
}

.checkout-actions button[type='button'] {
  background: white;
  border: 1px solid #d1d5db;
}
```

##### Step 5: Create Package Exports
```typescript
// packages/sdk/src/index.ts
export { Checkout } from './components/Checkout';
export { PricingTable } from './components/PricingTable';
export { CustomerPortal } from './components/CustomerPortal';

export type {
  Product,
  Price,
  CheckoutConfig,
  PricingTableConfig,
  PortalConfig,
} from './types';
```

##### Step 6: Build the Package
```bash
cd packages/sdk
pnpm build
```

#### Files to Create
- `packages/sdk/src/components/Checkout/index.tsx`
- `packages/sdk/src/components/Checkout/checkout.module.css`
- `packages/sdk/src/components/PricingTable/index.tsx`
- `packages/sdk/src/components/PricingTable/pricing.module.css`
- `packages/sdk/src/types/index.ts`
- `packages/sdk/src/index.ts`

#### Testing Checklist
- [ ] Checkout component renders
- [ ] Stripe Elements load correctly
- [ ] Payment submission works
- [ ] Error handling displays properly
- [ ] PricingTable displays all plans
- [ ] Billing toggle works (monthly/annual)
- [ ] Plan selection triggers callback
- [ ] Components are typed correctly

---

## Week 2: Customer Portal (Days 6-10)

### Task 4: Build Customer Portal Page ⭐ HIGH PRIORITY
**Estimated Time:** 12-16 hours (Days 6-9)
**Dependencies:** Task 3 complete, Ankush's APIs ready

#### Description
Build self-service customer portal for end-users to manage their subscriptions.

#### Portal Features
1. View current subscription and plan details
2. View usage metrics (feature usage)
3. View billing history and download invoices
4. Update payment method
5. Upgrade/downgrade subscription
6. Cancel subscription

#### Implementation Steps

##### Step 1: Create Portal Route (Public - No Org Scope)
```typescript
// apps/web/src/app/portal/[customerId]/page.tsx
import { CustomerPortal } from '@/components/Portal/CustomerPortal';
import { redirect } from 'next/navigation';

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: { customerId: string };
  searchParams: { token?: string };
}) {
  // Verify token (server-side)
  if (!searchParams.token) {
    redirect('/portal/login');
  }

  // Validate token against backend
  const isValid = await validatePortalToken(params.customerId, searchParams.token);
  if (!isValid) {
    redirect('/portal/login');
  }

  return <CustomerPortal customerId={params.customerId} token={searchParams.token} />;
}
```

##### Step 2: Create Portal Layout
```typescript
// apps/web/src/components/Portal/CustomerPortal.tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubscriptionSection } from './SubscriptionSection';
import { BillingSection } from './BillingSection';
import { UsageSection } from './UsageSection';
import { useCustomerPortal } from '@/hooks/queries/portal';

export function CustomerPortal({ customerId, token }: { customerId: string; token: string }) {
  const { data, isLoading } = useCustomerPortal(customerId, token);

  if (isLoading) return <PortalSkeleton />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">Customer Portal</h1>
          <p className="text-muted-foreground">Manage your subscription and billing</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="subscription" className="space-y-6">
          <TabsList>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
          </TabsList>

          <TabsContent value="subscription">
            <SubscriptionSection data={data?.subscription} customerId={customerId} />
          </TabsContent>

          <TabsContent value="billing">
            <BillingSection data={data?.billing} />
          </TabsContent>

          <TabsContent value="usage">
            <UsageSection data={data?.usage} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
```

##### Step 3: Create Subscription Section
```typescript
// apps/web/src/components/Portal/SubscriptionSection.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { CancelSubscriptionDialog } from './CancelSubscriptionDialog';
import { ChangePlanDialog } from './ChangePlanDialog';
import { format } from 'date-fns';

export function SubscriptionSection({ data, customerId }: { data: any; customerId: string }) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No active subscription
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">{data.product.name}</h3>
              <p className="text-muted-foreground">{data.product.description}</p>
            </div>
            <Badge>{data.status}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Price</div>
              <div className="text-lg font-semibold">
                ${(data.price.amount / 100).toFixed(2)}/{data.price.interval}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Next Billing Date</div>
              <div className="text-lg font-semibold">
                {format(new Date(data.currentPeriodEnd), 'MMM d, yyyy')}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setChangePlanOpen(true)}>
              Change Plan
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setCancelDialogOpen(true)}
            >
              Cancel Subscription
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Features Included */}
      <Card>
        <CardHeader>
          <CardTitle>Features Included</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.features?.map((feature: any) => (
              <li key={feature.id} className="flex items-center gap-2">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{feature.name}</span>
                {feature.type === 'usage_quota' && (
                  <span className="text-sm text-muted-foreground">
                    ({feature.quotaLimit} per month)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CancelSubscriptionDialog
        subscription={data}
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
      />
      <ChangePlanDialog
        currentSubscription={data}
        customerId={customerId}
        open={changePlanOpen}
        onOpenChange={setChangePlanOpen}
      />
    </div>
  );
}
```

##### Step 4: Create Billing Section
```typescript
// apps/web/src/components/Portal/BillingSection.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { format } from 'date-fns';

export function BillingSection({ data }: { data: any }) {
  const handleDownloadInvoice = (invoiceId: string) => {
    // Trigger invoice download from Stripe
    window.open(`/api/portal/invoices/${invoiceId}/download`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Payment Method */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Payment Method</CardTitle>
            <Button variant="outline" size="sm">
              Update
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data?.paymentMethod ? (
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
                {/* Card brand icon */}
                <span className="font-semibold">{data.paymentMethod.brand.toUpperCase()}</span>
              </div>
              <div>
                <div className="font-medium">•••• •••• •••• {data.paymentMethod.last4}</div>
                <div className="text-sm text-muted-foreground">
                  Expires {data.paymentMethod.expMonth}/{data.paymentMethod.expYear}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">No payment method on file</div>
          )}
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.invoices && data.invoices.length > 0 ? (
            <div className="space-y-3">
              {data.invoices.map((invoice: any) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">
                      ${(invoice.amount / 100).toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(invoice.date), 'MMM d, yyyy')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={invoice.status === 'paid' ? 'default' : 'destructive'}>
                      {invoice.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadInvoice(invoice.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No invoices yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

##### Step 5: Create Usage Section
```typescript
// apps/web/src/components/Portal/UsageSection.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export function UsageSection({ data }: { data: any }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No usage data available
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((usage: any) => {
        const percentage = (usage.used / usage.limit) * 100;
        const isNearLimit = percentage >= 80;

        return (
          <Card key={usage.featureKey}>
            <CardHeader>
              <CardTitle className="text-base">{usage.featureName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Usage</span>
                <span className={isNearLimit ? 'text-destructive font-medium' : 'font-medium'}>
                  {usage.used.toLocaleString()} / {usage.limit.toLocaleString()}
                </span>
              </div>
              <Progress value={percentage} className={isNearLimit ? 'bg-destructive/20' : ''} />
              {isNearLimit && (
                <p className="text-xs text-destructive">
                  You're approaching your limit. Consider upgrading your plan.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

#### Files to Create
- `apps/web/src/app/portal/[customerId]/page.tsx`
- `apps/web/src/components/Portal/CustomerPortal.tsx`
- `apps/web/src/components/Portal/SubscriptionSection.tsx`
- `apps/web/src/components/Portal/BillingSection.tsx`
- `apps/web/src/components/Portal/UsageSection.tsx`
- `apps/web/src/components/Portal/CancelSubscriptionDialog.tsx`
- `apps/web/src/components/Portal/ChangePlanDialog.tsx`

#### Testing Checklist
- [ ] Portal loads with valid token
- [ ] Subscription details display correctly
- [ ] Features list shows correctly
- [ ] Payment method displays
- [ ] Invoice list works
- [ ] Invoice download works
- [ ] Usage metrics display
- [ ] Progress bars accurate
- [ ] Change plan dialog opens
- [ ] Cancel dialog works
- [ ] Mobile responsive

---

### Task 5: Create Portal Query Hooks
**Estimated Time:** 3-4 hours (Day 7)
**Dependencies:** Ankush's portal APIs ready

#### Implementation
```typescript
// apps/web/src/hooks/queries/portal.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// Types
export type PortalData = {
  subscription: {
    id: string;
    status: string;
    product: { name: string; description: string };
    price: { amount: number; interval: string };
    currentPeriodEnd: string;
    features: Array<{ id: string; name: string; type: string; quotaLimit: number | null }>;
  } | null;
  billing: {
    paymentMethod: {
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    } | null;
    invoices: Array<{
      id: string;
      amount: number;
      date: string;
      status: string;
    }>;
  };
  usage: Array<{
    featureKey: string;
    featureName: string;
    used: number;
    limit: number;
  }>;
};

// Query Keys
export const portalKeys = {
  all: ['portal'] as const,
  customer: (customerId: string, token: string) => [...portalKeys.all, customerId, token] as const,
};

// Hooks
export function useCustomerPortal(customerId: string, token: string) {
  return useQuery({
    queryKey: portalKeys.customer(customerId, token),
    queryFn: async () => {
      // Set token in header
      const response = await apiClient.get<PortalData>(`/portal/${customerId}`, {
        headers: { 'X-Portal-Token': token },
      });
      return response;
    },
    staleTime: 60000, // 1 minute
  });
}

export function useUpdatePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerId, token }: { customerId: string; token: string }) => {
      // Redirect to Stripe Checkout for payment method update
      const response = await apiClient.post<{ url: string }>(`/portal/${customerId}/update-payment`, {}, {
        headers: { 'X-Portal-Token': token },
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.all });
    },
  });
}

export function useCancelPortalSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerId, token }: { customerId: string; token: string }) => {
      return apiClient.post(`/portal/${customerId}/cancel-subscription`, {}, {
        headers: { 'X-Portal-Token': token },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalKeys.all });
    },
  });
}
```

#### Files to Create
- `apps/web/src/hooks/queries/portal.ts`

#### Update Export
```typescript
// apps/web/src/hooks/queries/index.ts
export * from './portal';
```

---

## Week 3: Documentation & Testing (Days 11-15)

### Task 6: SDK Documentation Website
**Estimated Time:** 8-12 hours (Days 11-13)
**Dependencies:** All SDK components complete

#### Description
Create comprehensive documentation for SDK usage.

#### Implementation Steps

##### Step 1: Setup Nextra or Docusaurus
```bash
# Option A: Nextra (simpler, Next.js-based)
cd apps
npx create-nextra-app@latest docs

# Option B: Docusaurus (more features)
cd apps
npx create-docusaurus@latest docs classic
```

##### Step 2: Create Documentation Structure
```
apps/docs/
├── pages/
│   ├── index.mdx                  # Home page
│   ├── getting-started.mdx        # Quick start guide
│   ├── installation.mdx           # Installation instructions
│   ├── components/
│   │   ├── checkout.mdx           # Checkout component docs
│   │   ├── pricing-table.mdx      # PricingTable docs
│   │   └── customer-portal.mdx    # Portal docs
│   ├── guides/
│   │   ├── react-integration.mdx  # Using with React
│   │   ├── iframe-embed.mdx       # Embedding via iframe
│   │   └── styling.mdx            # Customization guide
│   └── api-reference.mdx          # API types reference
```

##### Step 3: Write Documentation Content

**Example: Checkout Component Docs**
```mdx
# Checkout Component

The `Checkout` component provides a secure payment form for your customers to complete their purchase.

## Installation

\`\`\`bash
npm install @billingos/sdk @stripe/stripe-js @stripe/react-stripe-js
\`\`\`

## Basic Usage

\`\`\`tsx
import { Checkout } from '@billingos/sdk';

function App() {
  const config = {
    organizationId: 'your-org-id',
    priceId: 'price_xxx',
    successUrl: 'https://yourapp.com/success',
    cancelUrl: 'https://yourapp.com/cancel',
  };

  return (
    <Checkout
      config={config}
      stripePublishableKey="pk_test_xxx"
      onSuccess={() => console.log('Payment successful')}
      onCancel={() => console.log('Payment cancelled')}
    />
  );
}
\`\`\`

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| config | CheckoutConfig | Yes | Checkout configuration |
| stripePublishableKey | string | Yes | Your Stripe publishable key |
| onSuccess | () => void | No | Callback after successful payment |
| onCancel | () => void | No | Callback when payment is cancelled |

## Configuration Object

\`\`\`typescript
type CheckoutConfig = {
  organizationId: string;  // Your BillingOS organization ID
  priceId: string;         // The Stripe price ID to charge
  customerId?: string;     // Optional: Existing customer ID
  successUrl: string;      // Redirect URL after payment success
  cancelUrl: string;       // Redirect URL if payment is cancelled
  allowPromoCodes?: boolean; // Allow promo code input (default: false)
};
\`\`\`

## Styling

The Checkout component uses CSS modules. You can override styles by targeting class names:

\`\`\`css
.checkout-form {
  --primary-color: #your-brand-color;
}
\`\`\`

## Examples

### With Custom Styling
[Code example]

### With Promo Codes
[Code example]

### Embedded in Modal
[Code example]
```

##### Step 4: Add Live Code Examples (Using Sandpack or CodeSandbox)
```mdx
import { Sandpack } from '@codesandbox/sandpack-react';

<Sandpack
  template="react"
  files={{
    '/App.js': `import { Checkout } from '@billingos/sdk';

export default function App() {
  return <Checkout config={{...}} />;
}`,
  }}
/>
```

##### Step 5: Deploy Documentation
```bash
# Build docs
cd apps/docs
pnpm build

# Deploy to Vercel/Netlify
vercel deploy
```

#### Files to Create
- `apps/docs/pages/index.mdx`
- `apps/docs/pages/getting-started.mdx`
- `apps/docs/pages/installation.mdx`
- `apps/docs/pages/components/checkout.mdx`
- `apps/docs/pages/components/pricing-table.mdx`
- `apps/docs/pages/components/customer-portal.mdx`
- `apps/docs/pages/guides/react-integration.mdx`
- `apps/docs/pages/guides/iframe-embed.mdx`
- `apps/docs/pages/api-reference.mdx`

#### Testing Checklist
- [ ] All pages render correctly
- [ ] Code examples work
- [ ] Search functionality works
- [ ] Navigation works
- [ ] Mobile responsive
- [ ] Deployed and accessible

---

### Task 7: End-to-End Testing
**Estimated Time:** 6-8 hours (Days 14-15)
**Dependencies:** All features complete

#### Test Scenarios

##### 1. Checkout Flow
- [ ] Pricing table displays correctly
- [ ] Clicking "Get Started" opens checkout
- [ ] Card input validates properly
- [ ] Payment submits successfully
- [ ] Success page redirects correctly
- [ ] Subscription created in database
- [ ] Customer receives confirmation email

##### 2. Customer Portal
- [ ] Portal login works with token
- [ ] Subscription details display
- [ ] Usage metrics accurate
- [ ] Invoice download works
- [ ] Update payment method redirects to Stripe
- [ ] Plan change updates subscription
- [ ] Cancellation flow works
- [ ] Retention offers display (if implemented)

##### 3. SDK Integration
- [ ] React component imports work
- [ ] TypeScript types are correct
- [ ] Props validation works
- [ ] Error handling works
- [ ] Loading states display
- [ ] Mobile responsive

##### 4. Browser Compatibility
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

#### Files to Create
- `docs/sprint-beta-launch/ramesh-testing.md` - Test results log
- `apps/sdk/tests/checkout.test.tsx` - Component tests
- `apps/sdk/tests/pricing-table.test.tsx`

---

## Daily Checklist

### Every Morning
- [ ] Pull latest changes
- [ ] Check team dependencies (Ankush's APIs)
- [ ] Update progress in `docs/sprint-beta-launch/ramesh-progress.md`

### Every Evening
- [ ] Commit and push work
- [ ] Update progress document
- [ ] Take screenshots/recordings of components
- [ ] Note blockers for standup

### Handoff Points
- **Day 1:** SDK merged → Notify team
- **Week 2:** Portal complete → Notify team for testing
- **Week 3:** Documentation live → Share link with team

---

**Created:** January 22, 2026
**Assigned To:** Ramesh
**Estimated Total Hours:** 47-62 hours
**Status:** Ready to Start
