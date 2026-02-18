import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { DashboardsService } from '../dashboards/dashboards.service';
import { AddQuestionDto } from '../faculty-exams/dto/add-question.dto';
import { CreateExamDto } from '../faculty-exams/dto/create-exam.dto';
import { UpdateExamDto } from '../faculty-exams/dto/update-exam.dto';
import { FacultyExamsService } from '../faculty-exams/faculty-exams.service';

type MultipartRequest = FastifyRequest & {
  file: () => Promise<MultipartFile | undefined>;
};

@Roles(Role.FACULTY)
@Controller('faculty')
export class FacultyController {
  constructor(
    private readonly facultyExamsService: FacultyExamsService,
    private readonly dashboardsService: DashboardsService
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.dashboardsService.getFacultyDashboard(currentUser.userId);
  }

  @Get('dashboard/exams/:examId/scores')
  examScores(@CurrentUser() currentUser: AuthenticatedUser, @Param('examId') examId: string) {
    return this.dashboardsService.getFacultyExamStudentScores(currentUser.userId, examId);
  }

  @Post('exams')
  createExam(@CurrentUser() currentUser: AuthenticatedUser, @Body() payload: CreateExamDto) {
    return this.facultyExamsService.createExam(currentUser.userId, payload);
  }

  @Patch('exams/:examId')
  updateExam(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('examId') examId: string,
    @Body() payload: UpdateExamDto
  ) {
    return this.facultyExamsService.updateExam(currentUser.userId, examId, payload);
  }

  @Delete('exams/:examId')
  deleteExam(@CurrentUser() currentUser: AuthenticatedUser, @Param('examId') examId: string) {
    return this.facultyExamsService.deleteExam(currentUser.userId, examId);
  }

  @Post('questions/images')
  async uploadQuestionImage(@Req() request: FastifyRequest) {
    const multipartRequest = request as MultipartRequest;
    if (typeof multipartRequest.file !== 'function') {
      throw new BadRequestException(
        'Multipart upload is not available. Ensure @fastify/multipart is registered.'
      );
    }

    const file = await multipartRequest.file();
    if (!file) {
      throw new BadRequestException('No image file provided.');
    }

    return this.facultyExamsService.uploadQuestionImage(file);
  }

  @Post('exams/:examId/questions')
  addQuestion(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('examId') examId: string,
    @Body() payload: AddQuestionDto
  ) {
    return this.facultyExamsService.addQuestion(currentUser.userId, examId, payload);
  }

  @Get('results')
  viewResults(@CurrentUser() currentUser: AuthenticatedUser) {
    return {
      message: 'Result viewing is authorized for Faculty.',
      requestedBy: currentUser.userId
    };
  }
}
