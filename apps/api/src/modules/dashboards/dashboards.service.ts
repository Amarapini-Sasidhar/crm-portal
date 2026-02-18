import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { Batch } from '../course-batch/entities/batch.entity';
import { Course } from '../course-batch/entities/course.entity';
import { StudentEnrollment } from '../course-batch/entities/student-enrollment.entity';
import { Exam } from '../faculty-exams/entities/exam.entity';
import { User } from '../users/entities/user.entity';
import { ExamAttempt } from '../student-attempts/entities/exam-attempt.entity';
import { ExamResult } from '../student-attempts/entities/exam-result.entity';

@Injectable()
export class DashboardsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    @InjectRepository(Exam)
    private readonly examsRepository: Repository<Exam>,
    @InjectRepository(StudentEnrollment)
    private readonly studentEnrollmentsRepository: Repository<StudentEnrollment>,
    @InjectRepository(ExamAttempt)
    private readonly examAttemptsRepository: Repository<ExamAttempt>,
    @InjectRepository(ExamResult)
    private readonly examResultsRepository: Repository<ExamResult>
  ) {}

  async getAdminDashboard() {
    const [totalStudents, totalCourses, totalExams] = await Promise.all([
      this.usersRepository.count({
        where: { role: Role.STUDENT }
      }),
      this.coursesRepository.count(),
      this.examsRepository.count()
    ]);

    const passFail = await this.examResultsRepository
      .createQueryBuilder('result')
      .select('COUNT(result.resultId)', 'totalEvaluated')
      .addSelect(
        'COALESCE(SUM(CASE WHEN result.passed = true THEN 1 ELSE 0 END), 0)',
        'passCount'
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN result.passed = false THEN 1 ELSE 0 END), 0)',
        'failCount'
      )
      .addSelect('COALESCE(ROUND(AVG(result.scorePercentage), 2), 0)', 'averageScore')
      .getRawOne<{
        totalEvaluated: string;
        passCount: string;
        failCount: string;
        averageScore: string;
      }>();

    const passCount = this.toNumber(passFail?.passCount);
    const failCount = this.toNumber(passFail?.failCount);
    const totalEvaluated = this.toNumber(passFail?.totalEvaluated);

    const passFailByExam = await this.examsRepository
      .createQueryBuilder('exam')
      .leftJoin(ExamResult, 'result', 'result.examId = exam.examId')
      .select('exam.examId', 'examId')
      .addSelect('exam.title', 'examTitle')
      .addSelect('COUNT(result.resultId)', 'evaluatedCount')
      .addSelect(
        'COALESCE(SUM(CASE WHEN result.passed = true THEN 1 ELSE 0 END), 0)',
        'passCount'
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN result.passed = false THEN 1 ELSE 0 END), 0)',
        'failCount'
      )
      .addSelect('COALESCE(ROUND(AVG(result.scorePercentage), 2), 0)', 'averageScore')
      .groupBy('exam.examId')
      .addGroupBy('exam.title')
      .orderBy('exam.createdAt', 'DESC')
      .limit(10)
      .getRawMany<{
        examId: string;
        examTitle: string;
        evaluatedCount: string;
        passCount: string;
        failCount: string;
        averageScore: string;
      }>();

    return {
      totals: {
        totalStudents,
        totalCourses,
        totalExams
      },
      passFailAnalytics: {
        totalEvaluated,
        passCount,
        failCount,
        passRate: totalEvaluated > 0 ? this.toPercent((passCount * 100) / totalEvaluated) : 0,
        averageScore: this.toNumber(passFail?.averageScore)
      },
      passFailByExam: passFailByExam.map((item) => {
        const examPassCount = this.toNumber(item.passCount);
        const examFailCount = this.toNumber(item.failCount);
        const evaluatedCount = this.toNumber(item.evaluatedCount);
        return {
          examId: item.examId,
          examTitle: item.examTitle,
          evaluatedCount,
          passCount: examPassCount,
          failCount: examFailCount,
          passRate: evaluatedCount > 0 ? this.toPercent((examPassCount * 100) / evaluatedCount) : 0,
          averageScore: this.toNumber(item.averageScore)
        };
      })
    };
  }

  async getFacultyDashboard(facultyId: string) {
    const examRows = await this.examsRepository
      .createQueryBuilder('exam')
      .leftJoin(ExamResult, 'result', 'result.examId = exam.examId')
      .select('exam.examId', 'examId')
      .addSelect('exam.title', 'examTitle')
      .addSelect('COUNT(result.resultId)', 'evaluatedAttempts')
      .addSelect(
        'COALESCE(SUM(CASE WHEN result.passed = true THEN 1 ELSE 0 END), 0)',
        'passCount'
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN result.passed = false THEN 1 ELSE 0 END), 0)',
        'failCount'
      )
      .addSelect('COALESCE(ROUND(AVG(result.scorePercentage), 2), 0)', 'averageScore')
      .addSelect('COALESCE(MAX(result.scorePercentage), 0)', 'highestScore')
      .addSelect('COALESCE(MIN(result.scorePercentage), 0)', 'lowestScore')
      .where('exam.createdByFacultyId = :facultyId', { facultyId })
      .groupBy('exam.examId')
      .addGroupBy('exam.title')
      .orderBy('exam.createdAt', 'DESC')
      .getRawMany<{
        examId: string;
        examTitle: string;
        evaluatedAttempts: string;
        passCount: string;
        failCount: string;
        averageScore: string;
        highestScore: string;
        lowestScore: string;
      }>();

    const stats = await this.examsRepository
      .createQueryBuilder('exam')
      .leftJoin(ExamResult, 'result', 'result.examId = exam.examId')
      .select('COUNT(DISTINCT exam.examId)', 'totalExams')
      .addSelect('COUNT(result.resultId)', 'evaluatedAttempts')
      .addSelect(
        'COALESCE(SUM(CASE WHEN result.passed = true THEN 1 ELSE 0 END), 0)',
        'passCount'
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN result.passed = false THEN 1 ELSE 0 END), 0)',
        'failCount'
      )
      .addSelect('COALESCE(ROUND(AVG(result.scorePercentage), 2), 0)', 'averageScore')
      .where('exam.createdByFacultyId = :facultyId', { facultyId })
      .getRawOne<{
        totalExams: string;
        evaluatedAttempts: string;
        passCount: string;
        failCount: string;
        averageScore: string;
      }>();

    const evaluatedAttempts = this.toNumber(stats?.evaluatedAttempts);
    const passCount = this.toNumber(stats?.passCount);

    return {
      performanceStatistics: {
        totalExams: this.toNumber(stats?.totalExams),
        evaluatedAttempts,
        passCount,
        failCount: this.toNumber(stats?.failCount),
        passRate: evaluatedAttempts > 0 ? this.toPercent((passCount * 100) / evaluatedAttempts) : 0,
        averageScore: this.toNumber(stats?.averageScore)
      },
      examPerformance: examRows.map((row) => ({
        examId: row.examId,
        examTitle: row.examTitle,
        evaluatedAttempts: this.toNumber(row.evaluatedAttempts),
        passCount: this.toNumber(row.passCount),
        failCount: this.toNumber(row.failCount),
        averageScore: this.toNumber(row.averageScore),
        highestScore: this.toNumber(row.highestScore),
        lowestScore: this.toNumber(row.lowestScore)
      }))
    };
  }

  async getFacultyExamStudentScores(facultyId: string, examId: string) {
    const exam = await this.examsRepository.findOne({
      where: {
        examId,
        createdByFacultyId: facultyId
      }
    });

    if (!exam) {
      throw new NotFoundException('Exam not found for this faculty.');
    }

    const rows = await this.examResultsRepository
      .createQueryBuilder('result')
      .innerJoin(ExamAttempt, 'attempt', 'attempt.attemptId = result.attemptId')
      .innerJoin(User, 'student', 'student.userId = result.studentId')
      .select('student.userId', 'studentId')
      .addSelect('student.firstName', 'firstName')
      .addSelect('student.lastName', 'lastName')
      .addSelect('student.email', 'email')
      .addSelect('attempt.attemptNo', 'attemptNo')
      .addSelect('result.marksObtained', 'marksObtained')
      .addSelect('result.maxMarks', 'maxMarks')
      .addSelect('result.scorePercentage', 'scorePercentage')
      .addSelect('result.passed', 'passed')
      .addSelect('result.evaluatedAt', 'evaluatedAt')
      .where('result.examId = :examId', { examId })
      .orderBy('result.scorePercentage', 'DESC')
      .addOrderBy('result.evaluatedAt', 'DESC')
      .getRawMany<{
        studentId: string;
        firstName: string;
        lastName: string;
        email: string;
        attemptNo: string;
        marksObtained: string;
        maxMarks: string;
        scorePercentage: string;
        passed: boolean;
        evaluatedAt: Date;
      }>();

    return {
      examId: exam.examId,
      examTitle: exam.title,
      studentScores: rows.map((row) => ({
        studentId: row.studentId,
        name: `${row.firstName} ${row.lastName}`.trim(),
        email: row.email,
        attemptNo: this.toNumber(row.attemptNo),
        marksObtained: this.toNumber(row.marksObtained),
        maxMarks: this.toNumber(row.maxMarks),
        scorePercentage: this.toNumber(row.scorePercentage),
        passed: this.toBoolean(row.passed),
        evaluatedAt: row.evaluatedAt
      }))
    };
  }

  async getStudentDashboard(studentId: string) {
    const enrolledCourses = await this.studentEnrollmentsRepository
      .createQueryBuilder('enrollment')
      .innerJoin(Batch, 'batch', 'batch.batchId = enrollment.batchId')
      .innerJoin(Course, 'course', 'course.courseId = batch.courseId')
      .select('enrollment.enrollmentId', 'enrollmentId')
      .addSelect('enrollment.status', 'enrollmentStatus')
      .addSelect('enrollment.enrolledAt', 'enrolledAt')
      .addSelect('batch.batchId', 'batchId')
      .addSelect('batch.batchName', 'batchName')
      .addSelect('batch.startDate', 'batchStartDate')
      .addSelect('batch.endDate', 'batchEndDate')
      .addSelect('course.courseId', 'courseId')
      .addSelect('course.courseName', 'courseName')
      .addSelect('course.durationDays', 'durationDays')
      .where('enrollment.studentId = :studentId', { studentId })
      .orderBy('enrollment.enrolledAt', 'DESC')
      .getRawMany<{
        enrollmentId: string;
        enrollmentStatus: string;
        enrolledAt: Date;
        batchId: string;
        batchName: string;
        batchStartDate: string;
        batchEndDate: string;
        courseId: string;
        courseName: string;
        durationDays: string;
      }>();

    const attemptedExams = await this.examAttemptsRepository
      .createQueryBuilder('attempt')
      .innerJoin(Exam, 'exam', 'exam.examId = attempt.examId')
      .leftJoin(ExamResult, 'result', 'result.attemptId = attempt.attemptId')
      .select('exam.examId', 'examId')
      .addSelect('exam.title', 'examTitle')
      .addSelect('COUNT(attempt.attemptId)', 'attemptsCount')
      .addSelect('MAX(attempt.attemptNo)', 'latestAttemptNo')
      .addSelect('MAX(attempt.startedAt)', 'lastAttemptAt')
      .addSelect('COALESCE(MAX(result.scorePercentage), 0)', 'bestScore')
      .where('attempt.studentId = :studentId', { studentId })
      .groupBy('exam.examId')
      .addGroupBy('exam.title')
      .orderBy('MAX(attempt.startedAt)', 'DESC')
      .getRawMany<{
        examId: string;
        examTitle: string;
        attemptsCount: string;
        latestAttemptNo: string;
        lastAttemptAt: Date;
        bestScore: string;
      }>();

    const results = await this.examResultsRepository
      .createQueryBuilder('result')
      .innerJoin(Exam, 'exam', 'exam.examId = result.examId')
      .select('result.resultId', 'resultId')
      .addSelect('result.examId', 'examId')
      .addSelect('exam.title', 'examTitle')
      .addSelect('result.marksObtained', 'marksObtained')
      .addSelect('result.maxMarks', 'maxMarks')
      .addSelect('result.scorePercentage', 'scorePercentage')
      .addSelect('result.passed', 'passed')
      .addSelect('result.evaluatedAt', 'evaluatedAt')
      .where('result.studentId = :studentId', { studentId })
      .orderBy('result.evaluatedAt', 'DESC')
      .getRawMany<{
        resultId: string;
        examId: string;
        examTitle: string;
        marksObtained: string;
        maxMarks: string;
        scorePercentage: string;
        passed: boolean;
        evaluatedAt: Date;
      }>();

    const uniqueCourseIds = [...new Set(enrolledCourses.map((item) => item.courseId))];
    const attemptedExamIds = [...new Set(attemptedExams.map((item) => item.examId))];
    const totalPassed = results.filter((item) => this.toBoolean(item.passed)).length;

    return {
      summary: {
        totalEnrolledCourses: uniqueCourseIds.length,
        totalAttemptedExams: attemptedExamIds.length,
        totalResults: results.length,
        passedResults: totalPassed,
        failedResults: results.length - totalPassed
      },
      enrolledCourses: enrolledCourses.map((item) => ({
        enrollmentId: item.enrollmentId,
        enrollmentStatus: item.enrollmentStatus,
        enrolledAt: item.enrolledAt,
        courseId: item.courseId,
        courseName: item.courseName,
        durationDays: this.toNumber(item.durationDays),
        batchId: item.batchId,
        batchName: item.batchName,
        batchStartDate: item.batchStartDate,
        batchEndDate: item.batchEndDate
      })),
      attemptedExams: attemptedExams.map((item) => ({
        examId: item.examId,
        examTitle: item.examTitle,
        attemptsCount: this.toNumber(item.attemptsCount),
        latestAttemptNo: this.toNumber(item.latestAttemptNo),
        lastAttemptAt: item.lastAttemptAt,
        bestScore: this.toNumber(item.bestScore)
      })),
      results: results.map((item) => ({
        resultId: item.resultId,
        examId: item.examId,
        examTitle: item.examTitle,
        marksObtained: this.toNumber(item.marksObtained),
        maxMarks: this.toNumber(item.maxMarks),
        scorePercentage: this.toNumber(item.scorePercentage),
        passed: this.toBoolean(item.passed),
        evaluatedAt: item.evaluatedAt
      }))
    };
  }

  private toNumber(value: string | number | undefined | null): number {
    if (value === undefined || value === null) {
      return 0;
    }
    return Number(value);
  }

  private toPercent(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 't';
    }

    return false;
  }
}
