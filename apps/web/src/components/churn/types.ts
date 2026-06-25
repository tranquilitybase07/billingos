export interface DiscountOffer {
  type: "discount";
  percentOff?: number;
  amountOff?: number;
  durationInMonths?: number;
  headline?: string;
  description?: string;
}

export interface ContactOffer {
  type: "contact" | "redirect";
  url: string;
  headline?: string;
  description?: string;
}

export interface PauseOffer {
  type: "pause";
  durationInMonths?: number;
  behavior?: "keep_as_draft" | "mark_uncollectible" | "void";
  headline?: string;
  description?: string;
}

export interface DowngradeOffer {
  type: "downgrade";
  targetPriceId?: string;
  headline?: string;
  description?: string;
  /** Server-resolved preview of the effective target (populated when serving config). */
  targetPreview?: {
    planName: string;
    amount: number;
    currency: string;
    interval: string;
  };
}

export type Offer = DiscountOffer | ContactOffer | PauseOffer | DowngradeOffer;

export interface SurveyReason {
  key: string;
  label: string;
  offer?: Offer;
}

export interface SurveyStep {
  id: string;
  type: "survey";
  title?: string;
  reasons: SurveyReason[];
}

export interface ConfirmStep {
  id: string;
  type: "confirm";
  title?: string;
  allowImmediate?: boolean;
  losses?: string[];
}

export type ChurnStep = SurveyStep | ConfirmStep;

export interface ChurnFlowConfig {
  id: string;
  name: string;
  enabled: boolean;
  steps: ChurnStep[];
}

export interface ChurnSubscriptionView {
  planName: string;
  amount: number;
  currency: string;
  interval: string;
  renewalDate: string;
  hasActiveDiscount?: boolean;
  isPaused?: boolean;
}
