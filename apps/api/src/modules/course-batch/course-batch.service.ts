import {
  BadRequestException,
  ConflictException,
  Injectable,
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
import { UsersService } from '../users/users.service';
import { AssignFacultyDto } from './dto/assign-faculty.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { BatchFacultyAssignment } from './entities/batch-faculty-assignment.entity';
import { Batch } from './entities/batch.entity';
import { Course } from './entities/course.entity';
import { StudentEnrollment } from './entities/student-enrollment.entity';

const DEFAULT_BATCH_CAPACITY = 100;

@Injectable()
export class CourseBatchService {
  constructor(
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    @InjectRepository(Batch)
    private readonly batchesRepository: Repository<Batch>,
    @InjectRepository(BatchFacultyAssignment)
    private readonly batchFacultyAssignmentsRepository: Repository<BatchFacultyAssignment>,
    @InjectRepository(StudentEnrollment)
    private readonly studentEnrollmentsRepository: Repository<StudentEnrollment>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource
  ) {}

  async createCourse(adminUserId: string, payload: CreateCourseDto) {
    const normalizedName = payload.name.trim();

    const duplicateName = await this.coursesRepository
      .createQueryBuilder('course')
      .where('LOWER(course.course_name) = LOWER(:courseName)', { courseName: normalizedName })
      .getOne();

    if (duplicateName) {
      throw new ConflictException('Course with this name already exists.');
    }

    const courseCode = await this.generateCourseCode(normalizedName);

    const course = this.coursesRepository.create({
      courseCode,
      courseName: normalizedName,
      description: payload.description?.trim() ?? null,
      durationDays: payload.duration,
      status: CourseStatus.ACTIVE,
      createdBy: adminUserId
    });

    const savedCourse = await this.coursesRepository.save(course);
    return this.toCourseResponse(savedCourse);
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

      const batchCode = await this.generateBatchCode(course.courseCode, batchRepo);
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

    const batch = await this.batchesRepository.findOne({ where: { batchId: payload.batchId } });
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }

    if (batch.status === BatchStatus.CANCELLED || batch.status === BatchStatus.COMPLETED) {
      throw new UnprocessableEntityException('Enrollment is not allowed for cancelled or completed batches.');
    }

    const existingEnrollment = await this.studentEnrollmentsRepository.findOne({
      where: { studentId, batchId: payload.batchId }
    });

    if (existingEnrollment) {
      throw new ConflictException('Student is already enrolled in this batch.');
    }

    const currentEnrollmentCount = await this.studentEnrollmentsRepository.count({
      where: {
        batchId: payload.batchId,
        status: In([EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED])
      }
    });

    if (currentEnrollmentCount >= batch.capacity) {
      throw new ConflictException('Batch has reached maximum enrollment capacity.');
    }

    const enrollment = this.studentEnrollmentsRepository.create({
      studentId,
      batchId: payload.batchId,
      status: EnrollmentStatus.ACTIVE,
      createdBy: studentId
    });

    const savedEnrollment = await this.studentEnrollmentsRepository.save(enrollment);
    return {
      enrollmentId: savedEnrollment.enrollmentId,
      studentId: savedEnrollment.studentId,
      batchId: savedEnrollment.batchId,
      status: savedEnrollment.status,
      enrolledAt: savedEnrollment.enrolledAt
    };
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

    const latestCode = await this.coursesRepository
      .createQueryBuilder('course')
      .select('course.course_code', 'courseCode')
      .where('course.course_code LIKE :prefix', { prefix: `${base}%` })
      .orderBy('course.course_code', 'DESC')
      .limit(1)
      .getRawOne<{ courseCode?: string }>();

    const nextSequence = latestCode?.courseCode
      ? (Number(latestCode.courseCode.match(/(\d+)$/)?.[1] ?? '0') + 1).toString()
      : '1';

    return `${base}${nextSequence}`.slice(0, 30);
  }

  private async generateBatchCode(
    courseCode: string,
    batchRepo: Repository<Batch>
  ): Promise<string> {
    const prefix = `B-${courseCode}`.slice(0, 20).toUpperCase();

    const latestBatchCode = await batchRepo
      .createQueryBuilder('batch')
      .select('batch.batch_code', 'batchCode')
      .where('batch.batch_code LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('batch.batch_code', 'DESC')
      .limit(1)
      .getRawOne<{ batchCode?: string }>();

    const nextSequence = latestBatchCode?.batchCode
      ? (Number(latestBatchCode.batchCode.match(/(\d+)$/)?.[1] ?? '0') + 1).toString()
      : '1';

    return `${prefix}${nextSequence}`.slice(0, 30);
  }

  private generateBatchName(courseName: string, startDate: string): string {
    return `${courseName} - ${startDate}`.slice(0, 150);
  }

  private toCourseResponse(course: Course) {
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
