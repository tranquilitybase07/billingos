import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';
import { WebhookContext, WebhookHandler } from '../webhook.types';
import { WebhookRouter } from '../webhook.router';

/**
 * Handles identity.verification_session.* events.
 * Updates user identity verification status based on Stripe Identity results.
 */
@Injectable()
export class IdentityVerificationHandler
  implements WebhookHandler, OnModuleInit
{
  private readonly logger = new Logger(IdentityVerificationHandler.name);

  constructor(private readonly router: WebhookRouter) {}

  onModuleInit(): void {
    this.router.registerHandler(
      [
        'identity.verification_session.verified',
        'identity.verification_session.requires_input',
        'identity.verification_session.canceled',
        'identity.verification_session.processing',
      ],
      this,
    );
  }

  async handle(ctx: WebhookContext): Promise<void> {
    try {
      const session = ctx.event.data
        .object as Stripe.Identity.VerificationSession;
      await this.handleIdentityVerificationUpdated(ctx, session);
    } catch (error) {
      this.logger.error(
        'Error in IdentityVerificationHandler:',
        error,
      );
    }
  }

  private async handleIdentityVerificationUpdated(
    ctx: WebhookContext,
    session: Stripe.Identity.VerificationSession,
  ): Promise<void> {
    try {
      this.logger.log(
        `Identity verification updated: ${session.id} - ${session.status}`,
      );

      const supabase = ctx.supabase;

      // Map Stripe status to our status
      let verificationStatus: string;
      switch (session.status) {
        case 'verified':
          verificationStatus = 'verified';
          break;
        case 'requires_input':
          verificationStatus = 'failed';
          break;
        case 'canceled':
          verificationStatus = 'failed';
          break;
        case 'processing':
          verificationStatus = 'pending';
          break;
        default:
          verificationStatus = 'pending';
      }

      // Update user verification status
      const { error } = await supabase
        .from('users')
        .update({
          identity_verification_status: verificationStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('identity_verification_id', session.id);

      if (error) {
        this.logger.error(
          `Failed to update identity verification for session ${session.id}:`,
          error,
        );
        return;
      }

      this.logger.log(
        `Identity verification ${session.id} updated to ${verificationStatus}`,
      );
    } catch (error) {
      this.logger.error('Error handling identity verification:', error);
    }
  }
}
