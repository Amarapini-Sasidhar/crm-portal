import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Batch } from '../course-batch/entities/batch.entity';
import { Course } from '../course-batch/entities/course.entity';
import { StudentEnrollment } from '../course-batch/entities/student-enrollment.entity';
import { Exam } from '../faculty-exams/entities/exam.entity';
import { User } from '../users/entities/user.entity';
import { ExamAttempt } from '../student-attempts/entities/exam-attempt.entity';
import { ExamResult } from '../student-attempts/entities/exam-result.entity';
import { DashboardsService } from './dashboards.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Course,
      Batch,
      Exam,
      StudentEnrollment,
      ExamAttempt,
      ExamResult
    ])
  ],
  providers: [DashboardsService],
  exports: [DashboardsService]
})
export class DashboardsModule {}
