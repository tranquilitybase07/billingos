export interface PortalSubscription {
  id: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  trialEnd?: string;
  product: {
    id: string;
    name: string;
    description?: string;
  };
  price: {
    id: string;
    amount: number;
    currency: string;
    interval: string;
    intervalCount: number;
  };
  features: Array<{
    id: string;
    name: string;
    description?: string;
    limit?: number;
    used?: number;
  }>;
}

export interface PortalInvoice {
  id: string;
  number?: string;
  status: string;
  amount: number;
  currency: string;
  dueDate?: string;
  paidAt?: string;
  invoiceUrl?: string;
  invoicePdf?: string;
  createdAt: string;
}

export interface PortalPaymentMethod {
  id: string;
  type: string;
  last4: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface PortalCustomer {
  id: string;
  email?: string;
  name?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface UsageMetric {
  featureId: string;
  featureName: string;
  used: number;
  limit: number | null;
  percentage: number;
  unit: string;
}

export interface PortalData {
  sessionId: string;
  customer: PortalCustomer;
  subscriptions: PortalSubscription[];
  invoices: PortalInvoice[];
  paymentMethods: PortalPaymentMethod[];
  usageMetrics: UsageMetric[];
  organizationName?: string;
}
