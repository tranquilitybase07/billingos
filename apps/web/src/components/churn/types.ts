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
  subheading?: string;
  reasons: SurveyReason[];
}

export interface LossAversionStep {
  id: string;
  type: "lossAversion";
  enabled?: boolean;
  title?: string;
  features: string[];
}

export interface FeedbackStep {
  id: string;
  type: "feedback";
  enabled?: boolean;
  title?: string;
  placeholder?: string;
  required?: boolean;
  minChars?: number;
}

export interface ConfirmStep {
  id: string;
  type: "confirm";
  title?: string;
  allowImmediate?: boolean;
  /** Legacy: features shown on the confirm screen. Superseded by LossAversionStep. */
  losses?: string[];
  savedHeading?: string;
  savedMessage?: string;
  cancelledHeading?: string;
  cancelledMessage?: string;
}

export type ChurnStep =
  | SurveyStep
  | LossAversionStep
  | FeedbackStep
  | ConfirmStep;

export interface ChurnFlowSettings {
  allowRepeatDiscount?: boolean;
  allowRepeatPause?: boolean;
  allowRepeatDowngrade?: boolean;
  /** Master toggle for the per-reason offer step; defaults to on when unset. */
  offerEnabled?: boolean;
}

export interface ChurnFlowConfig {
  id: string;
  name: string;
  enabled: boolean;
  steps: ChurnStep[];
  settings?: ChurnFlowSettings;
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
