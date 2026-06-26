export interface ChurnSaveByReason {
  reason: string;
  offerShown: number;
  offerAccepted: number;
  offerDeclined: number;
  canceled: number;
  saveRate: number;
}

export interface ChurnSaveByOfferType {
  offerType: string;
  offerShown: number;
  offerAccepted: number;
  offerDeclined: number;
  acceptRate: number;
}

export class ChurnSaveAnalyticsResponseDto {
  flowStarted: number;
  surveySubmitted: number;
  offerShown: number;
  offerAccepted: number;
  offerDeclined: number;
  canceled: number;
  /** offerAccepted / (offerAccepted + canceled) */
  saveRate: number;
  byReason: ChurnSaveByReason[];
  byOfferType: ChurnSaveByOfferType[];
  startDate: string;
  endDate: string;
}
