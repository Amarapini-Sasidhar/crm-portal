import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttemptStatus } from '../../common/enums/attempt-status.enum';
import { EnrollmentStatus } from '../../common/enums/enrollment-status.enum';
import { ExamStatus } from '../../common/enums/exam-status.enum';
import { SecurityEventType } from '../../common/enums/security-event-type.enum';
import {
  CertificateSummary,
  CertificatesService
} from '../certificates/certificates.service';
import { StudentEnrollment } from '../course-batch/entities/student-enrollment.entity';
import { Exam } from '../faculty-exams/entities/exam.entity';
import { ExamQuestion } from '../faculty-exams/entities/exam-question.entity';
import { QuestionOption } from '../faculty-exams/entities/question-option.entity';
import { AttemptHeartbeatDto } from './dto/attempt-heartbeat.dto';
import { RecordSecurityEventDto } from './dto/record-security-event.dto';
import { SaveAttemptAnswersDto } from './dto/save-attempt-answers.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { AttemptAnswer } from './entities/attempt-answer.entity';
import { AttemptSecurityEvent } from './entities/attempt-security-event.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { ExamResult } from './entities/exam-result.entity';

type ClientContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

type PersistedEvaluation = {
  resultId: string;
  attemptId: string;
  examId: string;
  studentId: string;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  maxMarks: number;
  marksObtained: number;
  scorePercentage: number;
  passed: boolean;
  evaluatedAt: Date;
  certificate: CertificateSummary | null;
};

const PASS_PERCENTAGE = 70;
const TAB_SWITCH_AUTO_SUBMIT_THRESHOLD = 8;
const FULLSCREEN_EXIT_AUTO_SUBMIT_THRESHOLD = 5;
const COPY_PASTE_AUTO_SUBMIT_THRESHOLD = 4;

@Injectable()
export class StudentAttemptsService {
  constructor(
    @InjectRepository(Exam)
    private readonly examsRepository: Repository<Exam>,
    @InjectRepository(ExamQuestion)
    private readonly examQuestionsRepository: Repository<ExamQuestion>,
    @InjectRepository(QuestionOption)
    private readonly questionOptionsRepository: Repository<QuestionOption>,
    @InjectRepository(StudentEnrollment)
    private readonly studentEnrollmentsRepository: Repository<StudentEnrollment>,
    @InjectRepository(ExamAttempt)
    private readonly examAttemptsRepository: Repository<ExamAttempt>,
    @InjectRepository(AttemptAnswer)
    private readonly attemptAnswersRepository: Repository<AttemptAnswer>,
    @InjectRepository(ExamResult)
    private readonly examResultsRepository: Repository<ExamResult>,
    @InjectRepository(AttemptSecurityEvent)
    private readonly attemptSecurityEventsRepository: Repository<AttemptSecurityEvent>,
    private readonly certificatesService: CertificatesService
  ) {}

  async startExam(studentId: string, examId: string, client: ClientContext) {
    const exam = await this.getExamOrFail(examId);
    this.validateExamWindowForStart(exam);

    const enrollment = await this.studentEnrollmentsRepository.findOne({
      where: {
        studentId,
        batchId: exam.batchId,
        status: In([EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED])
      }
    });

    if (!enrollment) {
      throw new BadRequestException('Student is not enrolled in this exam batch.');
    }

    const existingInProgress = await this.examAttemptsRepository.findOne({
      where: {
        examId,
        studentId,
        status: AttemptStatus.IN_PROGRESS
      },
      order: {
        startedAt: 'DESC'
      }
    });

    if (existingInProgress) {
      const autoSubmitted = await this.autoSubmitIfExpired(
        existingInProgress,
        exam,
        client,
        'TIME_LIMIT_REACHED'
      );
      if (!autoSubmitted) {
        throw new ConflictException('Student already has an active attempt for this exam.');
      }
    }

    const usedAttempts = await this.examAttemptsRepository.count({
      where: {
        examId,
        studentId
      }
    });

    if (usedAttempts >= exam.maxAttempts) {
      throw new ConflictException('Maximum number of attempts reached for this exam.');
    }

    const now = new Date();
    const attempt = this.examAttemptsRepository.create({
      examId,
      studentId,
      attemptNo: usedAttempts + 1,
      startedAt: now,
      status: AttemptStatus.IN_PROGRESS,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent
    });

    const savedAttempt = await this.examAttemptsRepository.save(attempt);
    const questions = await this.getExamQuestions(exam);
    const deadlineAt = this.getAttemptDeadline(savedAttempt, exam);

    return {
      attemptId: savedAttempt.attemptId,
      examId: savedAttempt.examId,
      attemptNo: savedAttempt.attemptNo,
      startedAt: savedAttempt.startedAt,
      deadlineAt,
      remainingSeconds: this.getRemainingSeconds(deadlineAt),
      timeLimitMinutes: exam.durationMinutes,
      status: savedAttempt.status,
      questions
    };
  }

  async saveAnswers(
    studentId: string,
    attemptId: string,
    payload: SaveAttemptAnswersDto,
    client: ClientContext
  ) {
    const attempt = await this.getOwnedAttemptOrFail(studentId, attemptId);
    const exam = await this.getExamOrFail(attempt.examId);
    await this.assertAttemptIsModifiable(attempt);

    const autoSubmitted = await this.autoSubmitIfExpired(attempt, exam, client, 'TIME_LIMIT_REACHED');
    if (autoSubmitted) {
      return autoSubmitted;
    }

    await this.recordClientFingerprintEvents(attempt, client);

    const uniqueQuestionIds = [...new Set(payload.answers.map((answer) => answer.questionId))];
    if (uniqueQuestionIds.length !== payload.answers.length) {
      throw new BadRequestException('Duplicate questionId values are not allowed in one save request.');
    }

    const questions = await this.examQuestionsRepository.find({
      where: {
        examId: attempt.examId,
        questionId: In(uniqueQuestionIds)
      }
    });

    if (questions.length !== uniqueQuestionIds.length) {
      throw new BadRequestException('One or more questionId values do not belong to this exam.');
    }

    const selectedOptionIds = payload.answers
      .map((answer) => answer.selectedOptionId)
      .filter((value): value is string => typeof value === 'string');

    let optionById = new Map<string, QuestionOption>();
    if (selectedOptionIds.length > 0) {
      const options = await this.questionOptionsRepository.find({
        where: {
          optionId: In(selectedOptionIds),
          questionId: In(uniqueQuestionIds)
        }
      });

      optionById = new Map(options.map((option) => [option.optionId, option]));
    }

    for (const answer of payload.answers) {
      if (!answer.selectedOptionId) {
        continue;
      }

      const option = optionById.get(answer.selectedOptionId);
      if (!option || option.questionId !== answer.questionId) {
        throw new BadRequestException(
          `selectedOptionId ${answer.selectedOptionId} does not belong to questionId ${answer.questionId}.`
        );
      }
    }

    await this.examAttemptsRepository.manager.transaction(async (manager) => {
      const existingAnswers = await manager.getRepository(AttemptAnswer).find({
        where: {
          attemptId,
          questionId: In(uniqueQuestionIds)
        }
      });

      const existingByQuestionId = new Map(existingAnswers.map((item) => [item.questionId, item]));
      const now = new Date();

      for (const answer of payload.answers) {
        const existing = existingByQuestionId.get(answer.questionId);
        if (!existing) {
          const newAnswer = manager.getRepository(AttemptAnswer).create({
            attemptId,
            examId: attempt.examId,
            questionId: answer.questionId,
            selectedOptionId: answer.selectedOptionId ?? null,
            answeredAt: answer.selectedOptionId ? now : null,
            isMarkedForReview: answer.isMarkedForReview ?? false
          });
          await manager.getRepository(AttemptAnswer).save(newAnswer);
          continue;
        }

        existing.selectedOptionId = answer.selectedOptionId ?? null;
        existing.answeredAt = answer.selectedOptionId ? now : null;
        existing.isMarkedForReview = answer.isMarkedForReview ?? existing.isMarkedForReview;
        await manager.getRepository(AttemptAnswer).save(existing);
      }
    });

    const answeredCount = await this.attemptAnswersRepository
      .createQueryBuilder('answer')
      .where('answer.attempt_id = :attemptId', { attemptId })
      .andWhere('answer.selected_option_id IS NOT NULL')
      .getCount();

    const deadlineAt = this.getAttemptDeadline(attempt, exam);
    return {
      attemptId: attempt.attemptId,
      status: attempt.status,
      answeredCount,
      remainingSeconds: this.getRemainingSeconds(deadlineAt),
      deadlineAt
    };
  }

  async submitExam(
    studentId: string,
    attemptId: string,
    payload: SubmitAttemptDto | undefined,
    client: ClientContext
  ) {
    const attempt = await this.getOwnedAttemptOrFail(studentId, attemptId);
    const exam = await this.getExamOrFail(attempt.examId);

    if (attempt.status === AttemptStatus.EVALUATED || attempt.status === AttemptStatus.SUBMITTED) {
      const existingResult = await this.getResultByAttemptIdOrFail(attempt.attemptId);
      const certificate = await this.certificatesService.getCertificateSummaryByResultId(
        existingResult.resultId
      );
      return {
        attemptId: attempt.attemptId,
        status: AttemptStatus.EVALUATED,
        autoSubmitted: false,
        result: {
          ...this.toResultResponse(existingResult),
          certificate
        }
      };
    }

    await this.assertAttemptIsModifiable(attempt);
    const autoSubmitted = await this.autoSubmitIfExpired(attempt, exam, client, 'TIME_LIMIT_REACHED');
    if (autoSubmitted) {
      return autoSubmitted;
    }

    await this.recordClientFingerprintEvents(attempt, client);

    const now = new Date();
    const calculatedTimeSpent = this.calculateTimeSpentSeconds(attempt.startedAt, now);
    attempt.submittedAt = now;
    attempt.timeSpentSeconds = payload?.timeSpentSeconds
      ? Math.min(payload.timeSpentSeconds, calculatedTimeSpent)
      : calculatedTimeSpent;
    attempt.status = AttemptStatus.SUBMITTED;
    await this.examAttemptsRepository.save(attempt);

    const evaluation = await this.evaluateAndPersistResult(attempt, exam);
    attempt.status = AttemptStatus.EVALUATED;
    await this.examAttemptsRepository.save(attempt);

    return {
      attemptId: attempt.attemptId,
      status: attempt.status,
      autoSubmitted: false,
      result: evaluation
    };
  }

  async heartbeat(
    studentId: string,
    attemptId: string,
    payload: AttemptHeartbeatDto,
    client: ClientContext
  ) {
    const attempt = await this.getOwnedAttemptOrFail(studentId, attemptId);
    const exam = await this.getExamOrFail(attempt.examId);

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      const existingResult = await this.examResultsRepository.findOne({
        where: { attemptId: attempt.attemptId }
      });
      const certificate = existingResult
        ? await this.certificatesService.getCertificateSummaryByResultId(existingResult.resultId)
        : null;
      return {
        attemptId: attempt.attemptId,
        status: attempt.status,
        autoSubmitted: false,
        result: existingResult
          ? {
              ...this.toResultResponse(existingResult),
              certificate
            }
          : null
      };
    }

    const autoSubmitted = await this.autoSubmitIfExpired(attempt, exam, client, 'TIME_LIMIT_REACHED');
    if (autoSubmitted) {
      return autoSubmitted;
    }

    await this.recordClientFingerprintEvents(attempt, client);
    await this.recordHeartbeatSecurityEvents(attempt, payload);

    if (
      payload.devToolsOpen ||
      payload.multipleFaceDetected ||
      (payload.tabSwitchCount ?? 0) >= TAB_SWITCH_AUTO_SUBMIT_THRESHOLD ||
      (payload.fullscreenExitCount ?? 0) >= FULLSCREEN_EXIT_AUTO_SUBMIT_THRESHOLD ||
      (payload.copyPasteCount ?? 0) >= COPY_PASTE_AUTO_SUBMIT_THRESHOLD
    ) {
      return this.forceAutoSubmitForSecurity(
        attempt,
        exam,
        client,
        payload as unknown as Record<string, unknown>
      );
    }

    const deadlineAt = this.getAttemptDeadline(attempt, exam);
    return {
      attemptId: attempt.attemptId,
      status: attempt.status,
      autoSubmitted: false,
      deadlineAt,
      remainingSeconds: this.getRemainingSeconds(deadlineAt)
    };
  }

  async recordSecurityEvent(
    studentId: string,
    attemptId: string,
    payload: RecordSecurityEventDto,
    client: ClientContext
  ) {
    const attempt = await this.getOwnedAttemptOrFail(studentId, attemptId);
    const exam = await this.getExamOrFail(attempt.examId);
    await this.recordClientFingerprintEvents(attempt, client);

    const event = await this.logSecurityEvent({
      attemptId: attempt.attemptId,
      studentId,
      eventType: payload.eventType,
      riskScore: payload.riskScore ?? this.defaultRiskForEvent(payload.eventType),
      eventData: payload.eventData ?? null
    });

    if (attempt.status === AttemptStatus.IN_PROGRESS && this.isSevereEvent(payload.eventType)) {
      return this.forceAutoSubmitForSecurity(attempt, exam, client, payload.eventData ?? {});
    }

    return {
      eventId: event.eventId,
      attemptId: event.attemptId,
      eventType: event.eventType,
      riskScore: event.riskScore,
      occurredAt: event.occurredAt
    };
  }

  async getAttemptState(studentId: string, attemptId: string, client: ClientContext) {
    const attempt = await this.getOwnedAttemptOrFail(studentId, attemptId);
    const exam = await this.getExamOrFail(attempt.examId);

    if (attempt.status === AttemptStatus.IN_PROGRESS) {
      const autoSubmitted = await this.autoSubmitIfExpired(attempt, exam, client, 'TIME_LIMIT_REACHED');
      if (autoSubmitted) {
        return autoSubmitted;
      }
      await this.recordClientFingerprintEvents(attempt, client);
    }

    const answeredCount = await this.attemptAnswersRepository
      .createQueryBuilder('answer')
      .where('answer.attempt_id = :attemptId', { attemptId })
      .andWhere('answer.selected_option_id IS NOT NULL')
      .getCount();

    const result = await this.examResultsRepository.findOne({
      where: { attemptId: attempt.attemptId }
    });
    const certificate = result
      ? await this.certificatesService.getCertificateSummaryByResultId(result.resultId)
      : null;

    const deadlineAt = this.getAttemptDeadline(attempt, exam);
    return {
      attemptId: attempt.attemptId,
      examId: attempt.examId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      deadlineAt,
      remainingSeconds: this.getRemainingSeconds(deadlineAt),
      answeredCount,
      result: result
        ? {
            ...this.toResultResponse(result),
            certificate
          }
        : null
    };
  }

  async listResults(studentId: string) {
    const results = await this.examResultsRepository
      .createQueryBuilder('result')
      .leftJoin(Exam, 'exam', 'exam.exam_id = result.exam_id')
      .leftJoin('crm.certificates', 'certificate', 'certificate.result_id = result.result_id')
      .select([
        'result.result_id AS "resultId"',
        'result.attempt_id AS "attemptId"',
        'result.exam_id AS "examId"',
        'result.total_questions AS "totalQuestions"',
        'result.correct_answers AS "correctAnswers"',
        'result.wrong_answers AS "wrongAnswers"',
        'result.unanswered AS "unanswered"',
        'result.max_marks AS "maxMarks"',
        'result.marks_obtained AS "marksObtained"',
        'result.score_percentage AS "scorePercentage"',
        'result.passed AS "passed"',
        'result.evaluated_at AS "evaluatedAt"',
        'exam.title AS "examTitle"',
        'certificate.certificate_no AS "certificateNo"'
      ])
      .where('result.student_id = :studentId', { studentId })
      .orderBy('result.evaluated_at', 'DESC')
      .getRawMany<{
        resultId: string;
        attemptId: string;
        examId: string;
        totalQuestions: string;
        correctAnswers: string;
        wrongAnswers: string;
        unanswered: string;
        maxMarks: string;
        marksObtained: string;
        scorePercentage: string;
        passed: boolean | string;
        evaluatedAt: Date;
        examTitle: string;
        certificateNo: string | null;
      }>();

    return results.map((row) => ({
      resultId: row.resultId,
      attemptId: row.attemptId,
      examId: row.examId,
      examTitle: row.examTitle,
      totalQuestions: Number(row.totalQuestions),
      correctAnswers: Number(row.correctAnswers),
      wrongAnswers: Number(row.wrongAnswers),
      unanswered: Number(row.unanswered),
      maxMarks: Number(row.maxMarks),
      marksObtained: Number(row.marksObtained),
      scorePercentage: Number(row.scorePercentage),
      passed: this.toBoolean(row.passed),
      evaluatedAt: row.evaluatedAt,
      certificateNo: row.certificateNo,
      certificateDownloadUrl: row.certificateNo
        ? this.certificatesService.buildDownloadUrl(row.certificateNo)
        : null
    }));
  }

  private async getExamOrFail(examId: string): Promise<Exam> {
    const exam = await this.examsRepository.findOne({
      where: { examId }
    });

    if (!exam) {
      throw new NotFoundException('Exam not found.');
    }

    return exam;
  }

  private validateExamWindowForStart(exam: Exam): void {
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw new BadRequestException('Exam is not available for attempts.');
    }

    const now = new Date();
    if (exam.startsAt && now < exam.startsAt) {
      throw new BadRequestException('Exam has not started yet.');
    }

    if (exam.endsAt && now > exam.endsAt) {
      throw new BadRequestException('Exam time window has ended.');
    }
  }

  private async getExamQuestions(exam: Exam) {
    const questions = await this.examQuestionsRepository.find({
      where: { examId: exam.examId },
      order: { displayOrder: 'ASC' }
    });

    if (questions.length === 0) {
      throw new BadRequestException('Exam has no questions.');
    }

    const questionIds = questions.map((item) => item.questionId);
    const options = await this.questionOptionsRepository.find({
      where: { questionId: In(questionIds) },
      order: { optionKey: 'ASC' }
    });

    const optionsByQuestionId = new Map<string, QuestionOption[]>();
    for (const option of options) {
      const bucket = optionsByQuestionId.get(option.questionId) ?? [];
      bucket.push(option);
      optionsByQuestionId.set(option.questionId, bucket);
    }

    const preparedQuestions = questions.map((question) => ({
      questionId: question.questionId,
      questionText: question.questionText,
      imageKey: question.imageKey,
      marks: question.marks,
      options: (optionsByQuestionId.get(question.questionId) ?? []).map((option) => ({
        optionId: option.optionId,
        optionKey: option.optionKey,
        optionText: option.optionText
      }))
    }));

    const questionsOrdered = exam.shuffleQuestions
      ? this.shuffleArray(preparedQuestions)
      : preparedQuestions;

    if (!exam.shuffleOptions) {
      return questionsOrdered;
    }

    return questionsOrdered.map((question) => ({
      ...question,
      options: this.shuffleArray(question.options)
    }));
  }

  private async getOwnedAttemptOrFail(studentId: string, attemptId: string): Promise<ExamAttempt> {
    const attempt = await this.examAttemptsRepository.findOne({
      where: {
        attemptId,
        studentId
      }
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found.');
    }

    return attempt;
  }

  private async assertAttemptIsModifiable(attempt: ExamAttempt) {
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('Attempt is no longer in progress.');
    }
  }

  private getAttemptDeadline(attempt: ExamAttempt, exam: Exam): Date {
    const durationDeadline = new Date(
      attempt.startedAt.getTime() + exam.durationMinutes * 60 * 1000
    );

    if (!exam.endsAt) {
      return durationDeadline;
    }

    return exam.endsAt < durationDeadline ? exam.endsAt : durationDeadline;
  }

  private getRemainingSeconds(deadlineAt: Date): number {
    const diffMs = deadlineAt.getTime() - Date.now();
    return Math.max(0, Math.floor(diffMs / 1000));
  }

  private calculateTimeSpentSeconds(startedAt: Date, endTime: Date): number {
    return Math.max(0, Math.floor((endTime.getTime() - startedAt.getTime()) / 1000));
  }

  private async autoSubmitIfExpired(
    attempt: ExamAttempt,
    exam: Exam,
    client: ClientContext,
    reason: string
  ) {
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      return null;
    }

    const deadlineAt = this.getAttemptDeadline(attempt, exam);
    if (new Date() <= deadlineAt) {
      return null;
    }

    return this.forceAutoSubmit(attempt, exam, client, reason);
  }

  private async forceAutoSubmitForSecurity(
    attempt: ExamAttempt,
    exam: Exam,
    client: ClientContext,
    eventData: Record<string, unknown>
  ) {
    return this.forceAutoSubmit(attempt, exam, client, 'ANTI_CHEAT_TRIGGER', eventData);
  }

  private async forceAutoSubmit(
    attempt: ExamAttempt,
    exam: Exam,
    client: ClientContext,
    reason: string,
    eventData?: Record<string, unknown>
  ) {
    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      const existingResult = await this.examResultsRepository.findOne({
        where: { attemptId: attempt.attemptId }
      });
      const certificate = existingResult
        ? await this.certificatesService.getCertificateSummaryByResultId(existingResult.resultId)
        : null;
      return {
        attemptId: attempt.attemptId,
        status: attempt.status,
        autoSubmitted: false,
        result: existingResult
          ? {
              ...this.toResultResponse(existingResult),
              certificate
            }
          : null
      };
    }

    await this.recordClientFingerprintEvents(attempt, client);

    const submittedAt = new Date();
    attempt.submittedAt = submittedAt;
    attempt.timeSpentSeconds = this.calculateTimeSpentSeconds(attempt.startedAt, submittedAt);
    attempt.status = AttemptStatus.SUBMITTED;
    await this.examAttemptsRepository.save(attempt);

    await this.logSecurityEvent({
      attemptId: attempt.attemptId,
      studentId: attempt.studentId,
      eventType: SecurityEventType.AUTO_SUBMIT,
      riskScore: 10,
      eventData: {
        reason,
        ...(eventData ?? {})
      }
    });

    const evaluation = await this.evaluateAndPersistResult(attempt, exam);
    attempt.status = AttemptStatus.EVALUATED;
    await this.examAttemptsRepository.save(attempt);

    return {
      attemptId: attempt.attemptId,
      status: attempt.status,
      autoSubmitted: true,
      reason,
      result: evaluation
    };
  }

  private async evaluateAndPersistResult(
    attempt: ExamAttempt,
    exam: Exam
  ): Promise<PersistedEvaluation> {
    const questions = await this.examQuestionsRepository.find({
      where: { examId: exam.examId }
    });

    if (questions.length === 0) {
      throw new BadRequestException('Cannot evaluate exam without questions.');
    }

    const questionIds = questions.map((question) => question.questionId);
    const answers = await this.attemptAnswersRepository.find({
      where: {
        attemptId: attempt.attemptId,
        questionId: In(questionIds)
      }
    });

    const correctOptions = await this.questionOptionsRepository.find({
      where: {
        questionId: In(questionIds),
        isCorrect: true
      }
    });

    const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));
    const correctOptionIdByQuestionId = new Map(
      correctOptions.map((option) => [option.questionId, option.optionId])
    );

    let correctAnswers = 0;
    let wrongAnswers = 0;
    let unanswered = 0;
    let marksObtained = 0;

    for (const question of questions) {
      const selected = answerByQuestionId.get(question.questionId)?.selectedOptionId ?? null;
      const correctOptionId = correctOptionIdByQuestionId.get(question.questionId) ?? null;

      if (!selected) {
        unanswered += 1;
        continue;
      }

      if (selected === correctOptionId) {
        correctAnswers += 1;
        marksObtained += Number(question.marks);
      } else {
        wrongAnswers += 1;
      }
    }

    const maxMarksFromQuestions = questions.reduce(
      (accumulator, question) => accumulator + Number(question.marks),
      0
    );
    const maxMarks = exam.totalMarks > 0 ? exam.totalMarks : maxMarksFromQuestions;
    const normalizedMarksObtained = this.roundToTwo(marksObtained);
    const scorePercentage = maxMarks > 0 ? this.roundToTwo((normalizedMarksObtained * 100) / maxMarks) : 0;
    const passed = scorePercentage >= PASS_PERCENTAGE;
    const now = new Date();

    const existingResult = await this.examResultsRepository.findOne({
      where: { attemptId: attempt.attemptId }
    });

    let savedResult: ExamResult;
    if (existingResult) {
      existingResult.examId = attempt.examId;
      existingResult.studentId = attempt.studentId;
      existingResult.totalQuestions = questions.length;
      existingResult.correctAnswers = correctAnswers;
      existingResult.wrongAnswers = wrongAnswers;
      existingResult.unanswered = unanswered;
      existingResult.maxMarks = this.roundToTwo(maxMarks);
      existingResult.marksObtained = normalizedMarksObtained;
      existingResult.evaluatedAt = now;
      savedResult = await this.examResultsRepository.save(existingResult);
    } else {
      const newResult = this.examResultsRepository.create({
        attemptId: attempt.attemptId,
        examId: attempt.examId,
        studentId: attempt.studentId,
        totalQuestions: questions.length,
        correctAnswers,
        wrongAnswers,
        unanswered,
        maxMarks: this.roundToTwo(maxMarks),
        marksObtained: normalizedMarksObtained,
        evaluatedAt: now
      });
      savedResult = await this.examResultsRepository.save(newResult);
    }

    const certificate = await this.certificatesService.issueCertificateIfEligible({
      resultId: savedResult.resultId,
      examId: attempt.examId,
      studentId: attempt.studentId,
      courseId: exam.courseId,
      facultyId: exam.createdByFacultyId,
      scorePercentage,
      passedAt: now
    });

    return {
      resultId: savedResult.resultId,
      attemptId: attempt.attemptId,
      examId: attempt.examId,
      studentId: attempt.studentId,
      totalQuestions: questions.length,
      correctAnswers,
      wrongAnswers,
      unanswered,
      maxMarks: this.roundToTwo(maxMarks),
      marksObtained: normalizedMarksObtained,
      scorePercentage,
      passed,
      evaluatedAt: now,
      certificate
    };
  }

  private async getResultByAttemptIdOrFail(attemptId: string): Promise<ExamResult> {
    const result = await this.examResultsRepository.findOne({
      where: { attemptId }
    });

    if (!result) {
      throw new NotFoundException('Result not found for this attempt.');
    }

    return result;
  }

  private toResultResponse(result: ExamResult): PersistedEvaluation {
    const maxMarks = Number(result.maxMarks);
    const marksObtained = Number(result.marksObtained);
    const scorePercentage =
      result.scorePercentage !== undefined && result.scorePercentage !== null
        ? Number(result.scorePercentage)
        : maxMarks > 0
          ? this.roundToTwo((marksObtained * 100) / maxMarks)
          : 0;
    const passed =
      result.passed !== undefined && result.passed !== null
        ? Boolean(result.passed)
        : scorePercentage >= PASS_PERCENTAGE;

    return {
      resultId: result.resultId,
      attemptId: result.attemptId,
      examId: result.examId,
      studentId: result.studentId,
      totalQuestions: result.totalQuestions,
      correctAnswers: result.correctAnswers,
      wrongAnswers: result.wrongAnswers,
      unanswered: result.unanswered,
      maxMarks,
      marksObtained,
      scorePercentage,
      passed,
      evaluatedAt: result.evaluatedAt,
      certificate: null
    };
  }

  private async recordClientFingerprintEvents(attempt: ExamAttempt, client: ClientContext) {
    if (attempt.ipAddress && client.ipAddress && attempt.ipAddress !== client.ipAddress) {
      await this.logSecurityEvent({
        attemptId: attempt.attemptId,
        studentId: attempt.studentId,
        eventType: SecurityEventType.IP_MISMATCH,
        riskScore: 8,
        eventData: {
          expectedIp: attempt.ipAddress,
          currentIp: client.ipAddress
        }
      });
    }

    if (attempt.userAgent && client.userAgent && attempt.userAgent !== client.userAgent) {
      await this.logSecurityEvent({
        attemptId: attempt.attemptId,
        studentId: attempt.studentId,
        eventType: SecurityEventType.USER_AGENT_MISMATCH,
        riskScore: 8,
        eventData: {
          expectedUserAgent: attempt.userAgent,
          currentUserAgent: client.userAgent
        }
      });
    }
  }

  private async recordHeartbeatSecurityEvents(attempt: ExamAttempt, payload: AttemptHeartbeatDto) {
    if ((payload.tabSwitchCount ?? 0) > 0) {
      await this.logSecurityEvent({
        attemptId: attempt.attemptId,
        studentId: attempt.studentId,
        eventType: SecurityEventType.TAB_SWITCH,
        riskScore: Math.min(6, Math.floor((payload.tabSwitchCount ?? 0) / 2) + 1),
        eventData: {
          tabSwitchCount: payload.tabSwitchCount
        }
      });
    }

    if ((payload.fullscreenExitCount ?? 0) > 0) {
      await this.logSecurityEvent({
        attemptId: attempt.attemptId,
        studentId: attempt.studentId,
        eventType: SecurityEventType.FULLSCREEN_EXIT,
        riskScore: Math.min(8, Math.floor((payload.fullscreenExitCount ?? 0) / 2) + 2),
        eventData: {
          fullscreenExitCount: payload.fullscreenExitCount
        }
      });
    }

    if ((payload.copyPasteCount ?? 0) > 0) {
      await this.logSecurityEvent({
        attemptId: attempt.attemptId,
        studentId: attempt.studentId,
        eventType: SecurityEventType.COPY_PASTE,
        riskScore: Math.min(7, Math.floor((payload.copyPasteCount ?? 0) / 2) + 2),
        eventData: {
          copyPasteCount: payload.copyPasteCount
        }
      });
    }

    if (payload.devToolsOpen) {
      await this.logSecurityEvent({
        attemptId: attempt.attemptId,
        studentId: attempt.studentId,
        eventType: SecurityEventType.DEVTOOLS_OPEN,
        riskScore: 10,
        eventData: {
          devToolsOpen: true
        }
      });
    }

    if (payload.multipleFaceDetected) {
      await this.logSecurityEvent({
        attemptId: attempt.attemptId,
        studentId: attempt.studentId,
        eventType: SecurityEventType.MULTIPLE_FACE_DETECTED,
        riskScore: 10,
        eventData: {
          multipleFaceDetected: true
        }
      });
    }
  }

  private async logSecurityEvent(input: {
    attemptId: string;
    studentId: string;
    eventType: SecurityEventType;
    eventData: Record<string, unknown> | null;
    riskScore: number;
  }) {
    const event = this.attemptSecurityEventsRepository.create({
      attemptId: input.attemptId,
      studentId: input.studentId,
      eventType: input.eventType,
      eventData: input.eventData,
      riskScore: input.riskScore
    });

    return this.attemptSecurityEventsRepository.save(event);
  }

  private defaultRiskForEvent(eventType: SecurityEventType): number {
    if (this.isSevereEvent(eventType)) {
      return 10;
    }

    if (
      eventType === SecurityEventType.TAB_SWITCH ||
      eventType === SecurityEventType.FULLSCREEN_EXIT ||
      eventType === SecurityEventType.COPY_PASTE
    ) {
      return 5;
    }

    return 3;
  }

  private isSevereEvent(eventType: SecurityEventType): boolean {
    return (
      eventType === SecurityEventType.DEVTOOLS_OPEN ||
      eventType === SecurityEventType.MULTIPLE_FACE_DETECTED ||
      eventType === SecurityEventType.IP_MISMATCH ||
      eventType === SecurityEventType.USER_AGENT_MISMATCH
    );
  }

  private roundToTwo(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === 't' || normalized === '1';
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    return false;
  }

  private shuffleArray<T>(items: T[]): T[] {
    const clone = [...items];
    for (let index = clone.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
    }
    return clone;
  }
}
