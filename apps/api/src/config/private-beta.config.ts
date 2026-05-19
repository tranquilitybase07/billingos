import { ConfigService } from '@nestjs/config';

export const PRIVATE_BETA_ENABLED_ENV = 'PRIVATE_BETA_ENABLED';

export function isPrivateBetaEnabled(configService: ConfigService): boolean {
  const raw = configService.get<string | boolean>(PRIVATE_BETA_ENABLED_ENV);
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return false;
  return raw.trim().toLowerCase() === 'true';
}
