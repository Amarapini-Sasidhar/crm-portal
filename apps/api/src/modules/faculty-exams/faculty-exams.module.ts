import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchFacultyAssignment } from '../course-batch/entities/batch-faculty-assignment.entity';
import { Batch } from '../course-batch/entities/batch.entity';
import { Exam } from './entities/exam.entity';
import { ExamQuestion } from './entities/exam-question.entity';
import { QuestionOption } from './entities/question-option.entity';
import { FacultyExamsService } from './faculty-exams.service';
import { QuestionImageStorageService } from './question-image-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Exam, ExamQuestion, QuestionOption, Batch, BatchFacultyAssignment])
  ],
  providers: [FacultyExamsService, QuestionImageStorageService],
  exports: [FacultyExamsService]
})
export class FacultyExamsModule {}
