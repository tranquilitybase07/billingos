import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminTokenGuard } from './guards/admin-token.guard';
import { ReplayWebhookDto } from './dto/replay-webhook.dto';
import { ReconcileDto } from './dto/reconcile.dto';

/**
 * Admin operations called from the billingos-admin dashboard. Every endpoint
 * is gated by `AdminTokenGuard` (shared service token in `x-admin-token`).
 *
 * The dashboard handles per-operator authentication and maintains its own
 * audit log; this controller just needs to know the request came from the
 * admin app and not the public surface.
 */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Replay a stored webhook event through the full processing pipeline.
   * Useful when a handler bug was fixed and we want to re-process events
   * that previously failed, or when state drifted because of a retry-storm.
   */
  @Post('webhooks/:id/replay')
  async replayWebhook(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() _dto: ReplayWebhookDto,
  ) {
    return this.adminService.replayWebhook(id);
  }

  /**
   * Force-reconcile a subscription's BOS state from Stripe (Stripe wins).
   * Accepts either the BOS UUID or the Stripe `sub_...` id.
   */
  @Post('subscriptions/:id/reconcile')
  async reconcileSubscription(
    @Param('id') id: string,
    @Body() _dto: ReconcileDto,
  ) {
    return this.adminService.reconcileSubscription(id);
  }

  /**
   * Force-reconcile a customer's BOS state from Stripe.
   */
  @Post('customers/:id/reconcile')
  async reconcileCustomer(@Param('id') id: string, @Body() _dto: ReconcileDto) {
    return this.adminService.reconcileCustomer(id);
  }

  /**
   * Read-only Stripe snapshot for a customer (customer object + active
   * subscriptions + recent invoices). For inspection in the dashboard.
   */
  @Get('customers/:id/stripe-snapshot')
  async getCustomerSnapshot(@Param('id') id: string) {
    return this.adminService.getCustomerSnapshot(id);
  }
}
