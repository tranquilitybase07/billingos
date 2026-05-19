import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminTokenGuard } from './guards/admin-token.guard';
import { ReplayWebhookDto } from './dto/replay-webhook.dto';
import { ReconcileDto } from './dto/reconcile.dto';
import { CopyProductsDto } from './dto/copy-products.dto';
import { ListBetaApplicationsDto } from './dto/list-beta-applications.dto';

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

  /**
   * Clone non-archived current-version products (with their prices, features,
   * and product_feature links) from a source org into a target org. Real
   * Stripe products and prices are created in the target's connected Stripe
   * account. Used for seeding test orgs from an existing setup.
   *
   * Partial-success semantics: copies proceed product-by-product. If one
   * product fails mid-batch (e.g., Stripe error on its prices), earlier
   * successful copies remain in both Stripe and BOS. The failing product's
   * Stripe product is rolled back. Callers receive `{ copied, skipped,
   * errors }` and may need to re-run / clean up manually if errors list is
   * non-empty.
   */
  @Post('orgs/copy-products')
  async copyProducts(@Body() dto: CopyProductsDto) {
    return this.adminService.copyProducts({
      sourceOrgId: dto.source_org_id,
      targetOrgId: dto.target_org_id,
    });
  }

  /**
   * List users awaiting private-beta approval. Defaults to status=pending.
   * Used by ops to triage the waitlist.
   */
  @Get('beta-applications')
  async listBetaApplications(@Query() query: ListBetaApplicationsDto) {
    return this.adminService.listBetaApplications({
      status: query.status ?? 'pending',
      limit: query.limit ?? 50,
    });
  }

  /**
   * Approve a user for the private beta. Idempotent. The admin dashboard
   * records the operator + reason in `admin_audit_log` before calling this,
   * so no body is needed here.
   */
  @Post('users/:id/approve')
  async approveUser(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.setAccessStatus(id, 'approved');
  }

  /**
   * Deny a user. Idempotent.
   */
  @Post('users/:id/deny')
  async denyUser(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.setAccessStatus(id, 'denied');
  }
}
