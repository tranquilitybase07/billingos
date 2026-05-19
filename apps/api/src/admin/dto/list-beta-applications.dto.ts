import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListBetaApplicationsDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'denied'])
  status?: 'pending' | 'approved' | 'denied';

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
