export interface DiscountOffer {
  type: 'discount';
  percentOff?: number;
  amountOff?: number;
  durationInMonths?: number;
  headline?: string;
  description?: string;
}

export interface ContactOffer {
  type: 'contact' | 'redirect';
  url: string;
  headline?: string;
  description?: string;
}

export interface PauseOffer {
  type: 'pause';
  /** Resume billing after N months; omit for an indefinite pause. */
  durationInMonths?: number;
  /** Stripe pause_collection behavior; defaults to 'void' (no invoices while paused). */
  behavior?: 'keep_as_draft' | 'mark_uncollectible' | 'void';
  headline?: string;
  description?: string;
}

export type Offer = DiscountOffer | ContactOffer | PauseOffer;

export interface SurveyReason {
  key: string;
  label: string;
  offer?: Offer;
}

export interface SurveyStep {
  id: string;
  type: 'survey';
  title?: string;
  reasons: SurveyReason[];
}

export interface ConfirmStep {
  id: string;
  type: 'confirm';
  title?: string;
  allowImmediate?: boolean;
  losses?: string[];
}

export type ChurnStep = SurveyStep | ConfirmStep;

export interface ChurnFlowSettings {
  allowRepeatDiscount?: boolean;
  allowRepeatPause?: boolean;
}

export interface ChurnFlowConfig {
  id: string;
  name: string;
  enabled: boolean;
  steps: ChurnStep[];
  settings?: ChurnFlowSettings;
}
