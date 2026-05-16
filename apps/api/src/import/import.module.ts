import { Module, forwardRef } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { StripeModule } from '../stripe/stripe.module';
import { BillingModule } from '../billing/billing.module';
import { QueueModule } from '../queue/queue.module';
import { CustomersModule } from '../customers/customers.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportWorkerService } from './import-worker.service';

@Module({
  imports: [
    SupabaseModule,
    QueueModule,
    CustomersModule,
    forwardRef(() => StripeModule),
    forwardRef(() => BillingModule),
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportWorkerService],
  exports: [ImportService],
})
export class ImportModule {}
