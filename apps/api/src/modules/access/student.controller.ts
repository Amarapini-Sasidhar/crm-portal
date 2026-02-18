import { createReadStream } from 'fs';
import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CertificatesService } from '../certificates/certificates.service';
import { CourseBatchService } from '../course-batch/course-batch.service';
import { DashboardsService } from '../dashboards/dashboards.service';
import { EnrollStudentDto } from '../course-batch/dto/enroll-student.dto';
import { AttemptHeartbeatDto } from '../student-attempts/dto/attempt-heartbeat.dto';
import { RecordSecurityEventDto } from '../student-attempts/dto/record-security-event.dto';
import { SaveAttemptAnswersDto } from '../student-attempts/dto/save-attempt-answers.dto';
import { SubmitAttemptDto } from '../student-attempts/dto/submit-attempt.dto';
import { StudentAttemptsService } from '../student-attempts/student-attempts.service';

@Roles(Role.STUDENT)
@Controller('student')
export class StudentController {
  constructor(
    private readonly courseBatchService: CourseBatchService,
    private readonly studentAttemptsService: StudentAttemptsService,
    private readonly dashboardsService: DashboardsService,
    private readonly certificatesService: CertificatesService
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardsService.getStudentDashboard(currentUser.userId);
  }

  @Post('enrollments')
  enroll(@CurrentUser() currentUser: AuthenticatedUser, @Body() payload: EnrollStudentDto) {
    return this.courseBatchService.enrollStudent(currentUser.userId, payload);
  }

  @Post('exams/:examId/attempts')
  startExamLegacyRoute(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('examId') examId: string,
    @Req() request: FastifyRequest
  ) {
    return this.studentAttemptsService.startExam(
      currentUser.userId,
      examId,
      this.getClientContext(request)
    );
  }

  @Post('exams/:examId/attempts/start')
  startExam(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('examId') examId: string,
    @Req() request: FastifyRequest
  ) {
    return this.studentAttemptsService.startExam(
      currentUser.userId,
      examId,
      this.getClientContext(request)
    );
  }

  @Patch('attempts/:attemptId/answers')
  saveAnswers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() payload: SaveAttemptAnswersDto,
    @Req() request: FastifyRequest
  ) {
    return this.studentAttemptsService.saveAnswers(
      currentUser.userId,
      attemptId,
      payload,
      this.getClientContext(request)
    );
  }

  @Post('attempts/:attemptId/heartbeat')
  heartbeat(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() payload: AttemptHeartbeatDto,
    @Req() request: FastifyRequest
  ) {
    return this.studentAttemptsService.heartbeat(
      currentUser.userId,
      attemptId,
      payload,
      this.getClientContext(request)
    );
  }

  @Post('attempts/:attemptId/security-events')
  recordSecurityEvent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() payload: RecordSecurityEventDto,
    @Req() request: FastifyRequest
  ) {
    return this.studentAttemptsService.recordSecurityEvent(
      currentUser.userId,
      attemptId,
      payload,
      this.getClientContext(request)
    );
  }

  @Post('attempts/:attemptId/submit')
  submitAttempt(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() payload: SubmitAttemptDto,
    @Req() request: FastifyRequest
  ) {
    return this.studentAttemptsService.submitExam(
      currentUser.userId,
      attemptId,
      payload,
      this.getClientContext(request)
    );
  }

  @Get('attempts/:attemptId')
  getAttemptState(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Req() request: FastifyRequest
  ) {
    return this.studentAttemptsService.getAttemptState(
      currentUser.userId,
      attemptId,
      this.getClientContext(request)
    );
  }

  @Get('results')
  viewResults(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.studentAttemptsService.listResults(currentUser.userId);
  }

  @Get('certificates')
  listCertificates(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.certificatesService.listStudentCertificates(currentUser.userId);
  }

  @Get('certificates/:certificateNo/download')
  async downloadCertificate(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('certificateNo') certificateNo: string,
    @Res() response: FastifyReply
  ) {
    const file = await this.certificatesService.getStudentCertificateDownload(
      currentUser.userId,
      certificateNo
    );

    response
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${file.fileName}"`)
      .send(createReadStream(file.absolutePath));
  }

  private getClientContext(request: FastifyRequest) {
    const userAgentHeader = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? null,
      userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : null
    };
  }
}
