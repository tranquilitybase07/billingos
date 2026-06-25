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

export interface DowngradeOffer {
  type: 'downgrade';
  /**
   * Pinned target price to downgrade to. If omitted, the engine auto-picks the
   * next-cheaper active paid price in the org ("smart" target).
   */
  targetPriceId?: string;
  headline?: string;
  description?: string;
  /**
   * Server-resolved preview of the effective target, populated when serving the
   * flow config so the renderer can show the real plan name + price. Never set by
   * the builder; not persisted.
   */
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
  allowRepeatDowngrade?: boolean;
}

export interface ChurnFlowConfig {
  id: string;
  name: string;
  enabled: boolean;
  steps: ChurnStep[];
  settings?: ChurnFlowSettings;
}
