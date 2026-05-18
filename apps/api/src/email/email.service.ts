import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface InvitationEmailPayload {
  to: string;
  organizationName: string;
  inviterEmail: string;
  inviteUrl: string;
  expiresAt: Date;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendInvitationEmail(payload: InvitationEmailPayload): Promise<void> {
    // TODO(zoho): swap this stub for the Zoho SMTP / API client once creds are in env.
    // Expected env vars: ZOHO_SMTP_HOST, ZOHO_SMTP_PORT, ZOHO_SMTP_USER, ZOHO_SMTP_PASS, ZOHO_FROM_ADDRESS.
    this.logger.log(
      [
        '────────────── INVITATION EMAIL (stub) ──────────────',
        `To:        ${payload.to}`,
        `From:      ${payload.inviterEmail}`,
        `Org:       ${payload.organizationName}`,
        `Expires:   ${payload.expiresAt.toISOString()}`,
        `Accept:    ${payload.inviteUrl}`,
        '─────────────────────────────────────────────────────',
      ].join('\n'),
    );
  }
}
