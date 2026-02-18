import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CertificatesModule } from '../certificates/certificates.module';
import { StudentEnrollment } from '../course-batch/entities/student-enrollment.entity';
import { Exam } from '../faculty-exams/entities/exam.entity';
import { ExamQuestion } from '../faculty-exams/entities/exam-question.entity';
import { QuestionOption } from '../faculty-exams/entities/question-option.entity';
import { AttemptAnswer } from './entities/attempt-answer.entity';
import { AttemptSecurityEvent } from './entities/attempt-security-event.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { ExamResult } from './entities/exam-result.entity';
import { StudentAttemptsService } from './student-attempts.service';

@Module({
  imports: [
    CertificatesModule,
    TypeOrmModule.forFeature([
      Exam,
      ExamQuestion,
      QuestionOption,
      StudentEnrollment,
      ExamAttempt,
      AttemptAnswer,
      ExamResult,
      AttemptSecurityEvent
    ])
  ],
  providers: [StudentAttemptsService],
  exports: [StudentAttemptsService]
})
export class StudentAttemptsModule {}
