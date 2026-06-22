import { Module, forwardRef } from '@nestjs/common';
import { ChurnController } from './churn.controller';
import { ChurnService } from './churn.service';
import { ChurnFlowsController } from './churn-flows.controller';
import { ChurnFlowsService } from './churn-flows.service';
import { ChurnContextService } from './churn-context.service';
import { BosSubscriptionResolver } from './resolvers/bos-subscription.resolver';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AuthModule } from '../../auth/auth.module';
import { SessionTokensModule } from '../../session-tokens/session-tokens.module';
import { StripeModule } from '../../stripe/stripe.module';

@Module({
  imports: [
    SupabaseModule,
    AuthModule,
    SessionTokensModule,
    forwardRef(() => StripeModule),
  ],
  controllers: [ChurnController, ChurnFlowsController],
  providers: [
    ChurnService,
    ChurnFlowsService,
    ChurnContextService,
    BosSubscriptionResolver,
  ],
  exports: [ChurnService, BosSubscriptionResolver],
})
export class ChurnModule {}
