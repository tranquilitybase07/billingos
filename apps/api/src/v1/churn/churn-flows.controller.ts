import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChurnFlowsService } from './churn-flows.service';
import { CreateChurnFlowDto, UpdateChurnFlowDto } from './dto/churn-flows.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/entities/user.entity';

@ApiTags('Churn Flows')
@Controller('churn-flows')
@UseGuards(JwtAuthGuard)
export class ChurnFlowsController {
  constructor(private readonly churnFlowsService: ChurnFlowsService) {}

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('organization_id') organizationId: string,
  ) {
    return this.churnFlowsService.list(organizationId, user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.churnFlowsService.get(id, user.id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateChurnFlowDto) {
    return this.churnFlowsService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateChurnFlowDto,
  ) {
    return this.churnFlowsService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.churnFlowsService.remove(id, user.id);
  }
}
