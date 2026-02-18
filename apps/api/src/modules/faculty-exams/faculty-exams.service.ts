import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { BatchFacultyAssignment } from '../course-batch/entities/batch-faculty-assignment.entity';
import { Batch } from '../course-batch/entities/batch.entity';
import { AddQuestionDto, QuestionOptionDto } from './dto/add-question.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { Exam } from './entities/exam.entity';
import { ExamQuestion } from './entities/exam-question.entity';
import { QuestionOption } from './entities/question-option.entity';
import { QuestionImageStorageService } from './question-image-storage.service';
import { MultipartFile } from '@fastify/multipart';
import { ExamStatus } from '../../common/enums/exam-status.enum';
import { BatchStatus } from '../../common/enums/batch-status.enum';

@Injectable()
export class FacultyExamsService {
  constructor(
    @InjectRepository(Exam)
    private readonly examsRepository: Repository<Exam>,
    @InjectRepository(ExamQuestion)
    private readonly examQuestionsRepository: Repository<ExamQuestion>,
    @InjectRepository(QuestionOption)
    private readonly questionOptionsRepository: Repository<QuestionOption>,
    @InjectRepository(Batch)
    private readonly batchesRepository: Repository<Batch>,
    @InjectRepository(BatchFacultyAssignment)
    private readonly batchFacultyAssignmentsRepository: Repository<BatchFacultyAssignment>,
    private readonly questionImageStorageService: QuestionImageStorageService
  ) {}

  async createExam(facultyId: string, payload: CreateExamDto) {
    const batch = await this.validateBatchAssignment(payload.batchId, facultyId);
    const { startsAt, endsAt } = this.buildSchedule(payload.scheduledAt, payload.timeLimitMinutes);

    const exam = this.examsRepository.create({
      courseId: batch.courseId,
      batchId: payload.batchId,
      createdByFacultyId: facultyId,
      title: payload.title,
      description: payload.description?.trim() ?? null,
      durationMinutes: payload.timeLimitMinutes,
      totalMarks: payload.totalMarks,
      passPercentage: 70,
      maxAttempts: payload.maxAttempts ?? 1,
      startsAt,
      endsAt,
      status: ExamStatus.PUBLISHED,
      shuffleQuestions: payload.shuffleQuestions ?? false,
      shuffleOptions: payload.shuffleOptions ?? false
    });

    const savedExam = await this.examsRepository.save(exam);
    return this.toExamResponse(savedExam);
  }

  async updateExam(facultyId: string, examId: string, payload: UpdateExamDto) {
    const exam = await this.getOwnedExamOrFail(facultyId, examId);

    if (payload.batchId && payload.batchId !== exam.batchId) {
      const newBatch = await this.validateBatchAssignment(payload.batchId, facultyId);
      exam.batchId = newBatch.batchId;
      exam.courseId = newBatch.courseId;
    }

    if (payload.title !== undefined) {
      exam.title = payload.title.trim();
    }

    if (payload.description !== undefined) {
      exam.description = payload.description?.trim() || null;
    }

    if (payload.totalMarks !== undefined) {
      await this.assertTotalMarksNotLessThanQuestionSum(examId, payload.totalMarks);
      exam.totalMarks = payload.totalMarks;
    }

    if (payload.maxAttempts !== undefined) {
      exam.maxAttempts = payload.maxAttempts;
    }

    if (payload.shuffleQuestions !== undefined) {
      exam.shuffleQuestions = payload.shuffleQuestions;
    }

    if (payload.shuffleOptions !== undefined) {
      exam.shuffleOptions = payload.shuffleOptions;
    }

    const durationMinutes = payload.timeLimitMinutes ?? exam.durationMinutes;
    const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : exam.startsAt;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid existing schedule. Provide scheduledAt to update this exam.');
    }

    if (payload.timeLimitMinutes !== undefined || payload.scheduledAt !== undefined) {
      const { startsAt, endsAt } = this.buildSchedule(scheduledAt.toISOString(), durationMinutes);
      exam.durationMinutes = durationMinutes;
      exam.startsAt = startsAt;
      exam.endsAt = endsAt;
    }

    const savedExam = await this.examsRepository.save(exam);
    return this.toExamResponse(savedExam);
  }

  async deleteExam(facultyId: string, examId: string) {
    const exam = await this.getOwnedExamOrFail(facultyId, examId);

    try {
      await this.examsRepository.remove(exam);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException(
          'Exam cannot be deleted because dependent records exist (attempts/results).'
        );
      }
      throw error;
    }

    return {
      examId,
      deleted: true
    };
  }

  async addQuestion(facultyId: string, examId: string, payload: AddQuestionDto) {
    const exam = await this.getOwnedExamOrFail(facultyId, examId);
    this.validateQuestionOptions(payload.options);

    const currentMarks = await this.getCurrentQuestionMarks(exam.examId);
    if (currentMarks + payload.marks > exam.totalMarks) {
      throw new BadRequestException(
        `Question marks exceed exam totalMarks. Current=${currentMarks}, incoming=${payload.marks}, totalMarks=${exam.totalMarks}.`
      );
    }

    const maxDisplayOrder = await this.examQuestionsRepository
      .createQueryBuilder('question')
      .select('COALESCE(MAX(question.display_order), 0)', 'maxDisplayOrder')
      .where('question.exam_id = :examId', { examId: exam.examId })
      .getRawOne<{ maxDisplayOrder: string }>();

    const displayOrder = Number(maxDisplayOrder?.maxDisplayOrder ?? '0') + 1;

    const savedQuestion = await this.examQuestionsRepository.manager.transaction(async (manager) => {
      const question = manager.getRepository(ExamQuestion).create({
        examId: exam.examId,
        questionText: payload.questionText.trim(),
        imageKey: payload.imageKey?.trim() ?? null,
        marks: payload.marks,
        displayOrder
      });

      const persistedQuestion = await manager.getRepository(ExamQuestion).save(question);

      const options = payload.options.map((option) =>
        manager.getRepository(QuestionOption).create({
          questionId: persistedQuestion.questionId,
          optionKey: option.optionKey,
          optionText: option.optionText.trim(),
          isCorrect: option.isCorrect
        })
      );

      await manager.getRepository(QuestionOption).save(options);
      return persistedQuestion;
    });

    return {
      questionId: savedQuestion.questionId,
      examId: savedQuestion.examId,
      questionText: savedQuestion.questionText,
      imageKey: savedQuestion.imageKey,
      marks: savedQuestion.marks,
      displayOrder: savedQuestion.displayOrder
    };
  }

  async uploadQuestionImage(file: MultipartFile) {
    return this.questionImageStorageService.saveQuestionImage(file);
  }

  private async getOwnedExamOrFail(facultyId: string, examId: string): Promise<Exam> {
    const exam = await this.examsRepository.findOne({
      where: {
        examId,
        createdByFacultyId: facultyId
      }
    });

    if (!exam) {
      throw new NotFoundException('Exam not found for this faculty.');
    }

    return exam;
  }

  private async validateBatchAssignment(batchId: string, facultyId: string): Promise<Batch> {
    const batch = await this.batchesRepository.findOne({
      where: { batchId }
    });

    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }

    if (batch.status === BatchStatus.CANCELLED || batch.status === BatchStatus.COMPLETED) {
      throw new BadRequestException('Exams cannot be assigned to cancelled or completed batches.');
    }

    const assignment = await this.batchFacultyAssignmentsRepository.findOne({
      where: {
        batchId,
        facultyId
      }
    });

    if (!assignment) {
      throw new BadRequestException('Faculty is not assigned to this batch.');
    }

    return batch;
  }

  private buildSchedule(scheduledAtRaw: string, timeLimitMinutes: number) {
    const startsAt = new Date(scheduledAtRaw);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt format.');
    }

    const endsAt = new Date(startsAt.getTime() + timeLimitMinutes * 60 * 1000);
    return { startsAt, endsAt };
  }

  private validateQuestionOptions(options: QuestionOptionDto[]) {
    if (options.length !== 4) {
      throw new BadRequestException('Each question must have exactly 4 options.');
    }

    const keys = options.map((option) => option.optionKey);
    const uniqueKeys = new Set(keys);
    const requiredKeys: Array<QuestionOptionDto['optionKey']> = ['A', 'B', 'C', 'D'];

    if (uniqueKeys.size !== 4 || !requiredKeys.every((key) => uniqueKeys.has(key))) {
      throw new BadRequestException('Options must include unique keys A, B, C, D.');
    }

    const correctOptionsCount = options.filter((option) => option.isCorrect).length;
    if (correctOptionsCount !== 1) {
      throw new BadRequestException('Exactly one option must be marked as correct.');
    }
  }

  private async getCurrentQuestionMarks(examId: string) {
    const result = await this.examQuestionsRepository
      .createQueryBuilder('question')
      .select('COALESCE(SUM(question.marks), 0)', 'totalMarks')
      .where('question.exam_id = :examId', { examId })
      .getRawOne<{ totalMarks: string }>();

    return Number(result?.totalMarks ?? '0');
  }

  private async assertTotalMarksNotLessThanQuestionSum(examId: string, totalMarks: number) {
    const currentMarks = await this.getCurrentQuestionMarks(examId);
    if (totalMarks < currentMarks) {
      throw new BadRequestException(
        `totalMarks cannot be less than current question marks sum (${currentMarks}).`
      );
    }
  }

  private toExamResponse(exam: Exam) {
    return {
      examId: exam.examId,
      title: exam.title,
      description: exam.description,
      batchId: exam.batchId,
      courseId: exam.courseId,
      timeLimitMinutes: exam.durationMinutes,
      totalMarks: exam.totalMarks,
      maxAttempts: exam.maxAttempts,
      scheduledAt: exam.startsAt,
      endsAt: exam.endsAt,
      status: exam.status,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleOptions: exam.shuffleOptions,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt
    };
  }
}
