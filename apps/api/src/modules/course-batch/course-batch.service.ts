import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { BatchStatus } from '../../common/enums/batch-status.enum';
import { CourseStatus } from '../../common/enums/course-status.enum';
import { EnrollmentStatus } from '../../common/enums/enrollment-status.enum';
import { Role } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { CertificatesService } from '../certificates/certificates.service';
import { UsersService } from '../users/users.service';
import { AssignFacultyDto } from './dto/assign-faculty.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { appendCourseVideoToDescription, buildImpactCourseTitle, extractCourseVideoUrl } from './course-video';
import { BatchFacultyAssignment } from './entities/batch-faculty-assignment.entity';
import { Batch } from './entities/batch.entity';
import { Course } from './entities/course.entity';
import { StudentEnrollment } from './entities/student-enrollment.entity';

const DEFAULT_BATCH_CAPACITY = 100;

@Injectable()
export class CourseBatchService {
  private readonly logger = new Logger(CourseBatchService.name);

  constructor(
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    @InjectRepository(Batch)
    private readonly batchesRepository: Repository<Batch>,
    @InjectRepository(BatchFacultyAssignment)
    private readonly batchFacultyAssignmentsRepository: Repository<BatchFacultyAssignment>,
    @InjectRepository(StudentEnrollment)
    private readonly studentEnrollmentsRepository: Repository<StudentEnrollment>,
    private readonly certificatesService: CertificatesService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource
  ) {}

  async createCourse(adminUserId: string, actorRole: Role, payload: CreateCourseDto) {
    const normalizedName = payload.name.trim();

    if (actorRole === Role.STUDENT) {
      throw new UnprocessableEntityException('Students are not allowed to create courses.');
    }

    const duplicateNameRows = await this.dataSource.query(
      `
        SELECT course_id
        FROM crm.courses
        WHERE LOWER(course_name) = LOWER($1)
        LIMIT 1
      `,
      [normalizedName]
    );

    if (duplicateNameRows.length > 0) {
      throw new ConflictException('Course with this name already exists.');
    }

    const normalizedVideoUrl = extractCourseVideoUrl(payload.description);
    const courseCode = await this.generateCourseCode(normalizedName);
    const courseName = buildImpactCourseTitle(normalizedName, normalizedVideoUrl).slice(0, 200);
    const description =
      appendCourseVideoToDescription(payload.description, normalizedVideoUrl ?? undefined) ?? null;

    try {
      const savedCourseRows = await this.dataSource.query(
        `
          INSERT INTO crm.courses (
            course_code,
            course_name,
            description,
            duration_days,
            status,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING
            course_id AS "courseId",
            course_code AS "courseCode",
            course_name AS "courseName",
            description AS "description",
            duration_days AS "durationDays",
            status::text AS "status",
            created_at AS "createdAt"
        `,
        [courseCode, courseName, description, payload.duration, CourseStatus.ACTIVE, adminUserId]
      );
      const savedCourse = savedCourseRows[0];

      return this.toCourseResponse(savedCourse);
    } catch (error) {
      const databaseError = error as { code?: string; detail?: string; message?: string };

      if (databaseError.code === '23505') {
        throw new ConflictException('Course with this name or generated code already exists.');
      }

      if (databaseError.code === '23503') {
        throw new BadRequestException('Course could not be created for the authenticated user.');
      }

      if (databaseError.code === '22001') {
        throw new BadRequestException('Course name or generated content is too long.');
      }

      throw new BadRequestException(
        databaseError.detail ?? databaseError.message ?? 'Unable to create course right now.'
      );
    }
  }

  async listCourses() {
    const courses = await this.coursesRepository.find({
      order: {
        createdAt: 'DESC'
      }
    });

    return courses.map((course) => this.toCourseResponse(course));
  }

  async createBatch(adminUserId: string, payload: CreateBatchDto) {
    const course = await this.coursesRepository.findOne({
      where: { courseId: payload.courseId, status: CourseStatus.ACTIVE }
    });

    if (!course) {
      throw new NotFoundException('Active course not found for provided courseId.');
    }

    await this.validateFaculty(payload.facultyId);
    const { startDate, endDate } = this.validateDateRange(payload.startDate, payload.endDate);
    const status = this.deriveBatchStatus(startDate, endDate);

    const createdBatch = await this.dataSource.transaction(async (manager) => {
      const batchRepo = manager.getRepository(Batch);
      const assignmentRepo = manager.getRepository(BatchFacultyAssignment);

      const batchCode = await this.generateBatchCode(course.courseCode);
      const batchName = this.generateBatchName(course.courseName, startDate);

      const batch = batchRepo.create({
        courseId: course.courseId,
        batchCode,
        batchName,
        startDate,
        endDate,
        capacity: payload.capacity ?? DEFAULT_BATCH_CAPACITY,
        status,
        createdBy: adminUserId
      });

      const savedBatch = await batchRepo.save(batch);

      const assignment = assignmentRepo.create({
        batchId: savedBatch.batchId,
        facultyId: payload.facultyId,
        assignedBy: adminUserId
      });
      await assignmentRepo.save(assignment);

      return savedBatch;
    });

    return this.getBatchWithFaculty(createdBatch.batchId);
  }

  async assignFacultyToBatch(adminUserId: string, batchId: string, payload: AssignFacultyDto) {
    const batch = await this.batchesRepository.findOne({ where: { batchId } });
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }

    await this.validateFaculty(payload.facultyId);

    let assignment = await this.batchFacultyAssignmentsRepository.findOne({ where: { batchId } });
    if (!assignment) {
      assignment = this.batchFacultyAssignmentsRepository.create({
        batchId,
        facultyId: payload.facultyId,
        assignedBy: adminUserId
      });
    } else {
      assignment.facultyId = payload.facultyId;
      assignment.assignedBy = adminUserId;
    }

    await this.batchFacultyAssignmentsRepository.save(assignment);
    return this.getBatchWithFaculty(batchId);
  }

  async enrollStudent(studentId: string, payload: EnrollStudentDto) {
    const student = await this.usersService.findById(studentId);
    if (!student || student.role !== Role.STUDENT || student.status !== UserStatus.ACTIVE) {
      throw new UnprocessableEntityException('Only active students can enroll into a batch.');
    }

    const resolvedBatchId = await this.resolveEnrollmentBatchId(studentId, payload);
    const batchRows = await this.dataSource.query(
      `
        SELECT
          batch_id AS "batchId",
          capacity AS "capacity",
          status::text AS "status",
          created_by AS "createdBy"
        FROM crm.batches
        WHERE batch_id = $1
        LIMIT 1
      `,
      [resolvedBatchId]
    );
    const batch = batchRows[0] as
      | { batchId: string; capacity: number; status: string; createdBy: string | null }
      | undefined;
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }

    if (batch.status === BatchStatus.CANCELLED || batch.status === BatchStatus.COMPLETED) {
      throw new UnprocessableEntityException('Enrollment is not allowed for cancelled or completed batches.');
    }

    const existingEnrollmentRows = await this.dataSource.query(
      `
        SELECT enrollment_id
        FROM crm.student_enrollments
        WHERE student_id = $1
          AND batch_id = $2
        LIMIT 1
      `,
      [studentId, resolvedBatchId]
    );

    if (existingEnrollmentRows.length > 0) {
      throw new ConflictException('Student is already enrolled in this batch.');
    }

    const currentEnrollmentCountRows = await this.dataSource.query(
      `
        SELECT COUNT(*)::int AS "count"
        FROM crm.student_enrollments
        WHERE batch_id = $1
          AND status::text IN ('ACTIVE', 'COMPLETED')
      `,
      [resolvedBatchId]
    );
    const currentEnrollmentCount = Number(currentEnrollmentCountRows[0]?.count ?? 0);

    if (currentEnrollmentCount >= batch.capacity) {
      throw new ConflictException('Batch has reached maximum enrollment capacity.');
    }

    const savedEnrollmentRows = await this.dataSource.query(
      `
        INSERT INTO crm.student_enrollments (
          student_id,
          batch_id,
          status,
          created_by
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          enrollment_id AS "enrollmentId",
          student_id AS "studentId",
          batch_id AS "batchId",
          status::text AS "status",
          enrolled_at AS "enrolledAt"
      `,
      [studentId, resolvedBatchId, EnrollmentStatus.ACTIVE, batch.createdBy ?? studentId]
    );
    const savedEnrollment = savedEnrollmentRows[0];

    return {
      enrollmentId: savedEnrollment.enrollmentId,
      studentId: savedEnrollment.studentId,
      batchId: savedEnrollment.batchId,
      status: savedEnrollment.status,
      enrolledAt: savedEnrollment.enrolledAt
    };
  }

  private async resolveEnrollmentBatchId(studentId: string, payload: EnrollStudentDto): Promise<string> {
    const batchId = payload.batchId?.trim();
    if (batchId) {
      return batchId;
    }

    const courseId = payload.courseId?.trim();
    if (!courseId) {
      throw new BadRequestException('Either batchId or courseId is required for enrollment.');
    }

    const courseRows = await this.dataSource.query(
      `
        SELECT
          course_id AS "courseId",
          course_name AS "courseName",
          course_code AS "courseCode",
          duration_days AS "durationDays",
          created_by AS "createdBy"
        FROM crm.courses
        WHERE course_id = $1
          AND status::text = $2
        LIMIT 1
      `,
      [courseId, CourseStatus.ACTIVE]
    );
    const course = courseRows[0] as
      | {
          courseId: string;
          courseName: string;
          courseCode: string;
          durationDays: number;
          createdBy: string;
        }
      | undefined;

    if (!course) {
      throw new NotFoundException('Active course not found.');
    }

    const existingOpenBatchRows = await this.dataSource.query(
      `
        SELECT batch_id AS "batchId"
        FROM crm.batches
        WHERE course_id = $1
          AND status::text IN ('ACTIVE', 'PLANNED')
        ORDER BY start_date ASC
        LIMIT 1
      `,
      [courseId]
    );

    if (existingOpenBatchRows.length > 0) {
      return String(existingOpenBatchRows[0].batchId);
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setUTCDate(endDate.getUTCDate() + Math.max(0, course.durationDays - 1));
    const normalizedStartDate = today.toISOString().slice(0, 10);
    const normalizedEndDate = endDate.toISOString().slice(0, 10);
    const batchCode = await this.generateBatchCode(course.courseCode);

    const savedBatchRows = await this.dataSource.query(
      `
        INSERT INTO crm.batches (
          course_id,
          batch_code,
          batch_name,
          start_date,
          end_date,
          capacity,
          status,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING batch_id AS "batchId"
      `,
      [
        courseId,
        batchCode,
        `${course.courseName} - Open Batch`.slice(0, 150),
        normalizedStartDate,
        normalizedEndDate,
        DEFAULT_BATCH_CAPACITY,
        this.deriveBatchStatus(normalizedStartDate, normalizedEndDate),
        course.createdBy
      ]
    );

    return String(savedBatchRows[0].batchId);
  }

  async completeVideoCourse(studentId: string, enrollmentId: string) {
    const enrollmentRows = await this.dataSource.query(
      `
        SELECT
          enrollment.enrollment_id AS "enrollmentId",
          enrollment.student_id AS "studentId",
          enrollment.batch_id AS "batchId",
          enrollment.status::text AS "status",
          enrollment.created_by AS "createdBy",
          batch.course_id AS "courseId",
          batch.created_by AS "batchCreatedBy",
          course.description AS "courseDescription"
        FROM crm.student_enrollments enrollment
        INNER JOIN crm.batches batch ON batch.batch_id = enrollment.batch_id
        INNER JOIN crm.courses course ON course.course_id = batch.course_id
        WHERE enrollment.enrollment_id = $1
          AND enrollment.student_id = $2
        LIMIT 1
      `,
      [enrollmentId, studentId]
    );
    const enrollment = enrollmentRows[0] as
      | {
          enrollmentId: string;
          studentId: string;
          batchId: string;
          status: string;
          createdBy: string | null;
          courseId: string;
          batchCreatedBy: string | null;
          courseDescription: string | null;
        }
      | undefined;

    if (!enrollment) {
      throw new NotFoundException('Enrollment not found.');
    }

    try {
      const videoUrl = extractCourseVideoUrl(enrollment.courseDescription);
      if (!videoUrl) {
        throw new BadRequestException('This course does not have a linked video.');
      }

      if (enrollment.status !== EnrollmentStatus.COMPLETED) {
        await this.dataSource.query(
          `
            UPDATE crm.student_enrollments
            SET
              status = $1,
              created_by = $2
            WHERE enrollment_id = $3
              AND student_id = $4
          `,
          [
            EnrollmentStatus.COMPLETED,
            enrollment.batchCreatedBy ?? enrollment.createdBy ?? studentId,
            enrollment.enrollmentId,
            studentId
          ]
        );
      }

      let facultyAssignment: { facultyId: string | null } | undefined;
      try {
        const facultyAssignmentRows = await this.dataSource.query(
          `
            SELECT faculty_id AS "facultyId"
            FROM crm.batch_faculty_assignments
            WHERE batch_id = $1
            LIMIT 1
          `,
          [enrollment.batchId]
        );
        facultyAssignment = facultyAssignmentRows[0] as { facultyId: string | null } | undefined;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Skipping faculty lookup for enrollment ${enrollment.enrollmentId}: ${message}`
        );
        facultyAssignment = undefined;
      }

      const certificate = await this.certificatesService.issueCourseCompletionCertificate({
        enrollmentId: enrollment.enrollmentId,
        batchId: enrollment.batchId,
        studentId,
        courseId: enrollment.courseId,
        facultyId: facultyAssignment?.facultyId ?? null,
        completedAt: new Date()
      });

      return {
        enrollmentId: enrollment.enrollmentId,
        status: EnrollmentStatus.COMPLETED,
        completionPercentage: 100,
        certificate
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Video completion certificate generation failed for enrollment ${enrollment.enrollmentId}: ${message}`
      );
      throw new BadRequestException(message || 'Could not generate certificate right now.');
    }
  }

  private validateDateRange(startDateRaw: string, endDateRaw: string) {
    const start = new Date(startDateRaw);
    const end = new Date(endDateRaw);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid startDate or endDate.');
    }

    if (end < start) {
      throw new BadRequestException('endDate must be greater than or equal to startDate.');
    }

    const normalizedStart = start.toISOString().slice(0, 10);
    const normalizedEnd = end.toISOString().slice(0, 10);

    return { startDate: normalizedStart, endDate: normalizedEnd };
  }

  private async validateFaculty(facultyId: string) {
    const faculty = await this.usersService.findById(facultyId);
    if (!faculty || faculty.role !== Role.FACULTY || faculty.status !== UserStatus.ACTIVE) {
      throw new UnprocessableEntityException('facultyId must belong to an active faculty user.');
    }
  }

  private deriveBatchStatus(startDate: string, endDate: string): BatchStatus {
    const today = new Date().toISOString().slice(0, 10);
    if (endDate < today) {
      return BatchStatus.COMPLETED;
    }

    if (startDate <= today) {
      return BatchStatus.ACTIVE;
    }

    return BatchStatus.PLANNED;
  }

  private async generateCourseCode(courseName: string): Promise<string> {
    const alphaOnly = courseName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    const base = alphaOnly.length >= 3 ? alphaOnly : `CRS${alphaOnly}`;

    const latestCodeRows = await this.dataSource.query(
      `
        SELECT course_code AS "courseCode"
        FROM crm.courses
        WHERE course_code LIKE $1
        ORDER BY course_code DESC
        LIMIT 1
      `,
      [`${base}%`]
    );
    const latestCode = latestCodeRows[0] as { courseCode?: string } | undefined;

    const nextSequence = latestCode?.courseCode
      ? (Number(latestCode.courseCode.match(/(\d+)$/)?.[1] ?? '0') + 1).toString()
      : '1';

    return `${base}${nextSequence}`.slice(0, 30);
  }

  private async generateBatchCode(courseCode: string): Promise<string> {
    const prefix = `B-${courseCode}`.slice(0, 20).toUpperCase();

    const latestBatchCodeRows = await this.dataSource.query(
      `
        SELECT batch_code AS "batchCode"
        FROM crm.batches
        WHERE batch_code LIKE $1
        ORDER BY batch_code DESC
        LIMIT 1
      `,
      [`${prefix}%`]
    );
    const latestBatchCode = latestBatchCodeRows[0] as { batchCode?: string } | undefined;

    const nextSequence = latestBatchCode?.batchCode
      ? (Number(latestBatchCode.batchCode.match(/(\d+)$/)?.[1] ?? '0') + 1).toString()
      : '1';

    return `${prefix}${nextSequence}`.slice(0, 30);
  }

  private generateBatchName(courseName: string, startDate: string): string {
    return `${courseName} - ${startDate}`.slice(0, 150);
  }

  private toCourseResponse(course: Course | {
    courseId: string;
    courseName: string;
    description: string | null;
    durationDays: number;
    courseCode: string;
    status: string;
    createdAt: Date | string;
  }) {
    return {
      courseId: course.courseId,
      name: course.courseName,
      description: course.description,
      duration: course.durationDays,
      courseCode: course.courseCode,
      status: course.status,
      createdAt: course.createdAt
    };
  }

  private async getBatchWithFaculty(batchId: string) {
    const batch = await this.batchesRepository.findOne({ where: { batchId } });
    if (!batch) {
      throw new NotFoundException('Batch not found after write operation.');
    }

    const facultyAssignment = await this.batchFacultyAssignmentsRepository.findOne({
      where: { batchId }
    });

    return {
      batchId: batch.batchId,
      courseId: batch.courseId,
      facultyId: facultyAssignment?.facultyId ?? null,
      startDate: batch.startDate,
      endDate: batch.endDate,
      status: batch.status,
      capacity: batch.capacity,
      batchCode: batch.batchCode,
      batchName: batch.batchName,
      createdAt: batch.createdAt
    };
  }
}
