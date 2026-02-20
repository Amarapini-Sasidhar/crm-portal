import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuthService } from '../auth/auth.service';
import { CreateManagedUserDto } from '../users/dto/create-managed-user.dto';
import { UpdateUserStatusDto } from '../users/dto/update-user-status.dto';
import { UsersService } from '../users/users.service';

@Roles(Role.SUPER_ADMIN)
@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  @Get('admins')
  async listAdmins() {
    const admins = await this.usersService.listByRole(Role.ADMIN);
    return admins.map((admin) => this.usersService.toPublicUser(admin));
  }

  @Post('admins')
  createAdmin(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() payload: CreateManagedUserDto
  ) {
    return this.authService.createManagedUser(Role.ADMIN, payload, currentUser.role);
  }

  @Patch('admins/:userId/status')
  async updateAdminStatus(
    @Param('userId') userId: string,
    @Body() payload: UpdateUserStatusDto
  ) {
    const updatedAdmin = await this.usersService.updateStatus(userId, payload.status, [Role.ADMIN]);
    return this.usersService.toPublicUser(updatedAdmin);
  }

  @Get('pending-users')
  async listPendingUsers() {
    const pendingUsers = await this.usersService.findPendingUsers();
    return pendingUsers.map((user) => this.usersService.toPublicUser(user));
  }

  @Patch('approve/:userId')
  async approveUser(@Param('userId') userId: string) {
    const approvedUser = await this.usersService.approveUser(userId);
    return this.usersService.toPublicUser(approvedUser);
  }
}
