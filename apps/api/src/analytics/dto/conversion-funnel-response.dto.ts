export class ConversionFunnelStageDto {
  label: string;
  value: number;
  description: string;
}

export class ConversionFunnelResponseDto {
  stages: ConversionFunnelStageDto[];
  overall_conversion_rate: number;
  as_of: string;
}
