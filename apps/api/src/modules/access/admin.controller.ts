import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuthService } from '../auth/auth.service';
import { AssignFacultyDto } from '../course-batch/dto/assign-faculty.dto';
import { CreateBatchDto } from '../course-batch/dto/create-batch.dto';
import { CreateCourseDto } from '../course-batch/dto/create-course.dto';
import { CourseBatchService } from '../course-batch/course-batch.service';
import { DashboardsService } from '../dashboards/dashboards.service';
import { CreateManagedUserDto } from '../users/dto/create-managed-user.dto';
import { UpdateUserStatusDto } from '../users/dto/update-user-status.dto';
import { UsersService } from '../users/users.service';

@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly courseBatchService: CourseBatchService,
    private readonly dashboardsService: DashboardsService
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.dashboardsService.getAdminDashboard();
  }

  @Post('courses')
  createCourse(@CurrentUser() currentUser: AuthenticatedUser, @Body() payload: CreateCourseDto) {
    return this.courseBatchService.createCourse(currentUser.userId, payload);
  }

  @Post('batches')
  createBatch(@CurrentUser() currentUser: AuthenticatedUser, @Body() payload: CreateBatchDto) {
    return this.courseBatchService.createBatch(currentUser.userId, payload);
  }

  @Patch('batches/:batchId/faculty')
  assignFaculty(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('batchId') batchId: string,
    @Body() payload: AssignFacultyDto
  ) {
    return this.courseBatchService.assignFacultyToBatch(currentUser.userId, batchId, payload);
  }

  @Post('students')
  createStudent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() payload: CreateManagedUserDto
  ) {
    return this.authService.createManagedUser(Role.STUDENT, payload, currentUser.role);
  }

  @Get('students')
  async listStudents() {
    const students = await this.usersService.listByRole(Role.STUDENT);
    return students.map((student) => this.usersService.toPublicUser(student));
  }

  @Patch('students/:userId/status')
  async updateStudentStatus(
    @Param('userId') userId: string,
    @Body() payload: UpdateUserStatusDto
  ) {
    const student = await this.usersService.updateStatus(userId, payload.status, [Role.STUDENT]);
    return this.usersService.toPublicUser(student);
  }

  @Get('reports')
  getReports(@CurrentUser() currentUser: AuthenticatedUser) {
    return {
      message: 'Reports endpoint is authorized for Admin.',
      requestedBy: currentUser.userId
    };
  }

  @Get('certificates')
  getCertificates(@CurrentUser() currentUser: AuthenticatedUser) {
    return {
      message: 'Certificate management endpoint is authorized for Admin.',
      requestedBy: currentUser.userId
    };
  }
}
