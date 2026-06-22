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

export type Offer = DiscountOffer | ContactOffer;

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
}

export interface ChurnFlowConfig {
  id: string;
  name: string;
  enabled: boolean;
  steps: ChurnStep[];
  settings?: ChurnFlowSettings;
}
