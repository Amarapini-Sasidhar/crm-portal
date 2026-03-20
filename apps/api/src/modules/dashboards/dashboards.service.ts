import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { BatchStatus } from '../../common/enums/batch-status.enum';
import { CourseStatus } from '../../common/enums/course-status.enum';
import { Certificate } from '../certificates/entities/certificate.entity';
import { Batch } from '../course-batch/entities/batch.entity';
import { Course } from '../course-batch/entities/course.entity';
import { StudentEnrollment } from '../course-batch/entities/student-enrollment.entity';
import { buildImpactCourseTitle, extractCourseVideoUrl } from '../course-batch/course-video';
import { Exam } from '../faculty-exams/entities/exam.entity';
import { User } from '../users/entities/user.entity';
import { ExamAttempt } from '../student-attempts/entities/exam-attempt.entity';
import { ExamResult } from '../student-attempts/entities/exam-result.entity';

const DEFAULT_OPEN_COURSE_CAPACITY = 100;

@Injectable()
export class DashboardsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    @InjectRepository(Batch)
    private readonly batchesRepository: Repository<Batch>,
    @InjectRepository(Exam)
    private readonly examsRepository: Repository<Exam>,
    @InjectRepository(StudentEnrollment)
    private readonly studentEnrollmentsRepository: Repository<StudentEnrollment>,
    @InjectRepository(Certificate)
    private readonly certificatesRepository: Repository<Certificate>,
    @InjectRepository(ExamAttempt)
    private readonly examAttemptsRepository: Repository<ExamAttempt>,
    @InjectRepository(ExamResult)
    private readonly examResultsRepository: Repository<ExamResult>,
    private readonly dataSource: DataSource
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
    const enrolledCourses = await this.dataSource.query(
      `
        SELECT
          enrollment.enrollment_id AS "enrollmentId",
          enrollment.status::text AS "enrollmentStatus",
          enrollment.enrolled_at AS "enrolledAt",
          batch.batch_id AS "batchId",
          batch.batch_name AS "batchName",
          batch.start_date AS "batchStartDate",
          batch.end_date AS "batchEndDate",
          course.course_id AS "courseId",
          course.course_name AS "courseName",
          course.description AS "courseDescription",
          course.duration_days AS "durationDays"
        FROM crm.student_enrollments enrollment
        INNER JOIN crm.batches batch ON batch.batch_id = enrollment.batch_id
        INNER JOIN crm.courses course ON course.course_id = batch.course_id
        WHERE enrollment.student_id = $1
        ORDER BY enrollment.enrolled_at DESC
      `,
      [studentId]
    ) as Array<{
      enrollmentId: string;
      enrollmentStatus: string;
      enrolledAt: Date;
      batchId: string;
      batchName: string;
      batchStartDate: string;
      batchEndDate: string;
      courseId: string;
      courseName: string;
      courseDescription: string | null;
      durationDays: string;
    }>;

    const completionResultIds = enrolledCourses.map((item) =>
      (4000000000000000000n + BigInt(item.enrollmentId)).toString()
    );
    const courseCertificates = completionResultIds.length
      ? ((await this.dataSource.query(
          `
            SELECT
              result_id AS "resultId",
              certificate_no AS "certificateNo"
            FROM crm.certificates
            WHERE result_id = ANY($1::bigint[])
              AND revoked = false
          `,
          [completionResultIds]
        )) as Array<{ resultId: string; certificateNo: string }>)
      : [];
    const certificateNoByResultId = new Map(
      courseCertificates.map((item) => [String(item.resultId), String(item.certificateNo)])
    );

    const attemptedExams = (await this.dataSource.query(
      `
        SELECT
          exam.exam_id AS "examId",
          exam.title AS "examTitle",
          COUNT(attempt.attempt_id)::int AS "attemptsCount",
          MAX(attempt.attempt_no)::int AS "latestAttemptNo",
          MAX(attempt.started_at) AS "lastAttemptAt",
          COALESCE(MAX(result.score_percentage), 0) AS "bestScore"
        FROM crm.exam_attempts attempt
        INNER JOIN crm.exams exam ON exam.exam_id = attempt.exam_id
        LEFT JOIN crm.exam_results result ON result.attempt_id = attempt.attempt_id
        WHERE attempt.student_id = $1
        GROUP BY exam.exam_id, exam.title
        ORDER BY MAX(attempt.started_at) DESC
      `,
      [studentId]
    )) as Array<{
      examId: string;
      examTitle: string;
      attemptsCount: string;
      latestAttemptNo: string;
      lastAttemptAt: Date;
      bestScore: string;
    }>;

    const enrolledCourseIds = [...new Set(enrolledCourses.map((item) => item.courseId))];
    const openBatches = await this.dataSource.query(
      `
        SELECT
          batch_id AS "batchId",
          course_id AS "courseId",
          batch_name AS "batchName",
          batch_code AS "batchCode",
          status::text AS "status",
          start_date AS "startDate",
          end_date AS "endDate",
          capacity AS "capacity"
        FROM crm.batches
        WHERE status::text IN ('ACTIVE', 'PLANNED')
        ORDER BY start_date ASC
      `
    ) as Array<{
      batchId: string;
      courseId: string;
      batchName: string;
      batchCode: string;
      status: string;
      startDate: string;
      endDate: string;
      capacity: number;
    }>;
    const firstOpenBatchByCourseId = new Map<string, (typeof openBatches)[number]>();
    for (const batch of openBatches) {
      if (!firstOpenBatchByCourseId.has(batch.courseId)) {
        firstOpenBatchByCourseId.set(batch.courseId, batch);
      }
    }

    const availableCourseRows = await this.dataSource.query(
      `
        SELECT
          course_id AS "courseId",
          course_name AS "courseName",
          description AS "description",
          duration_days AS "durationDays",
          created_at AS "createdAt"
        FROM crm.courses
        WHERE status::text = $1
        ORDER BY created_at DESC
      `,
      [CourseStatus.ACTIVE]
    ) as Array<{
      courseId: string;
      courseName: string;
      description: string | null;
      durationDays: number;
      createdAt: string;
    }>;
    const availableCourses = availableCourseRows
      .filter((course) => !enrolledCourseIds.includes(course.courseId))
      .map((course) => {
        const batch = firstOpenBatchByCourseId.get(course.courseId);
        return {
          courseId: course.courseId,
          courseName: course.courseName,
          courseDescription: course.description,
          durationDays: String(course.durationDays),
          batchId: batch?.batchId ?? null,
          batchName: batch?.batchName ?? 'Open Enrollment',
          batchCode: batch?.batchCode ?? null,
          batchStatus: batch?.status ?? BatchStatus.ACTIVE,
          batchStartDate: batch?.startDate ?? new Date().toISOString().slice(0, 10),
          batchEndDate:
            batch?.endDate ??
            new Date(Date.now() + Math.max(0, course.durationDays - 1) * 86400000)
              .toISOString()
              .slice(0, 10),
          capacity: String(batch?.capacity ?? DEFAULT_OPEN_COURSE_CAPACITY)
        };
      });

    const results = (await this.dataSource.query(
      `
        SELECT
          result.result_id AS "resultId",
          result.exam_id AS "examId",
          exam.title AS "examTitle",
          result.marks_obtained AS "marksObtained",
          result.max_marks AS "maxMarks",
          result.score_percentage AS "scorePercentage",
          result.passed AS "passed",
          result.evaluated_at AS "evaluatedAt"
        FROM crm.exam_results result
        INNER JOIN crm.exams exam ON exam.exam_id = result.exam_id
        WHERE result.student_id = $1
        ORDER BY result.evaluated_at DESC
      `,
      [studentId]
    )) as Array<{
      resultId: string;
      examId: string;
      examTitle: string;
      marksObtained: string;
      maxMarks: string;
      scorePercentage: string;
      passed: boolean;
      evaluatedAt: Date;
    }>;

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
        courseShortTitle: buildImpactCourseTitle(
          item.courseName,
          extractCourseVideoUrl(item.courseDescription)
        ),
        videoUrl: extractCourseVideoUrl(item.courseDescription),
        completionPercentage: item.enrollmentStatus === 'COMPLETED' ? 100 : 0,
        certificateNo:
          certificateNoByResultId.get(
            (4000000000000000000n + BigInt(item.enrollmentId)).toString()
          ) ?? null,
        durationDays: this.toNumber(item.durationDays),
        batchId: item.batchId,
        batchName: item.batchName,
        batchStartDate: item.batchStartDate,
        batchEndDate: item.batchEndDate
      })),
      availableCourses: availableCourses.map((item: {
        batchId: string | null;
        batchName: string;
        batchCode: string | null;
        batchStartDate: string;
        batchEndDate: string;
        capacity: string;
        batchStatus: string;
        courseId: string;
        courseName: string;
        courseDescription: string | null;
        durationDays: string;
      }) => ({
        courseId: item.courseId,
        courseName: item.courseName,
        courseShortTitle: buildImpactCourseTitle(
          item.courseName,
          extractCourseVideoUrl(item.courseDescription)
        ),
        videoUrl: extractCourseVideoUrl(item.courseDescription),
        durationDays: this.toNumber(item.durationDays),
        batchId: item.batchId,
        batchName: item.batchName,
        batchCode: item.batchCode,
        batchStatus: item.batchStatus,
        batchStartDate: item.batchStartDate,
        batchEndDate: item.batchEndDate,
        capacity: this.toNumber(item.capacity)
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
