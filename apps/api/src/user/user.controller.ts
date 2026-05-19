import { Controller, Get, Put, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BetaExempt } from '../auth/decorators/beta-exempt.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UpdateOnboardingDto, UpdateUserDto } from './dto/user.dto';
import { SubmitBetaApplicationDto } from './dto/beta-application.dto';
import { User } from './entities/user.entity';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  @BetaExempt()
  async getCurrentUser(@CurrentUser() user: User): Promise<User> {
    return this.userService.findById(user.id);
  }

  @Post('me/beta-application')
  @BetaExempt()
  async submitBetaApplication(
    @CurrentUser() user: User,
    @Body() dto: SubmitBetaApplicationDto,
  ): Promise<User> {
    return this.userService.submitBetaApplication(user.id, dto);
  }

  @Put('me')
  async updateCurrentUser(
    @CurrentUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.update(user.id, updateUserDto);
  }

  @Put('me/accept-terms')
  async acceptTerms(@CurrentUser() user: User): Promise<User> {
    return this.userService.acceptTerms(user.id);
  }

  @Get('me/onboarding')
  async getOnboarding(@CurrentUser() user: User) {
    return this.userService.getOnboarding(user.id);
  }

  @Patch('me/onboarding')
  async updateOnboarding(
    @CurrentUser() user: User,
    @Body() dto: UpdateOnboardingDto,
  ) {
    return this.userService.updateOnboarding(user.id, dto);
  }
}
