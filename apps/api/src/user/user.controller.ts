import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/user.dto';
import { User } from './entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  async getCurrentUser(@CurrentUser() user: User): Promise<User> {
    return this.userService.findById(user.id);
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
}
