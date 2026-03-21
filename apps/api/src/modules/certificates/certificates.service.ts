import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import { Course } from '../course-batch/entities/course.entity';
import { User } from '../users/entities/user.entity';
import { CertificatePdfService } from './certificate-pdf.service';
import { CertificateStorageService } from './certificate-storage.service';
import { Certificate } from './entities/certificate.entity';

const CERTIFICATE_MIN_PERCENTAGE = 75;

export type CertificateIssueInput = {
  resultId: string;
  examId: string;
  studentId: string;
  courseId: string;
  facultyId: string | null;
  scorePercentage: number;
  passedAt: Date;
};

export type CourseCompletionCertificateInput = {
  enrollmentId: string;
  batchId: string;
  studentId: string;
  courseId: string;
  facultyId: string | null;
  completedAt: Date;
};

export type CertificateSummary = {
  certificateId: string;
  certificateNo: string;
  issuedAt: Date;
  downloadUrl: string;
  verificationUrl: string;
  verificationApiUrl: string;
};

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    @InjectRepository(Certificate)
    private readonly certificatesRepository: Repository<Certificate>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    private readonly certificatePdfService: CertificatePdfService,
    private readonly certificateStorageService: CertificateStorageService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {}

  async issueCertificateIfEligible(input: CertificateIssueInput): Promise<CertificateSummary | null> {
    if (input.scorePercentage < CERTIFICATE_MIN_PERCENTAGE) {
      return null;
    }

    const existingCertificate = await this.findCertificateByResultId(input.resultId);
    if (existingCertificate) {
      return this.toSummary(existingCertificate);
    }

    const [student, course, faculty] = await Promise.all([
      this.findUserById(input.studentId),
      this.findCourseById(input.courseId),
      input.facultyId ? this.findUserById(input.facultyId) : Promise.resolve(null)
    ]);

    if (!student) {
      throw new NotFoundException('Student not found while issuing certificate.');
    }

    if (!course) {
      throw new NotFoundException('Course not found while issuing certificate.');
    }

    const trainerName = faculty
      ? `${faculty.firstName} ${faculty.lastName}`.trim()
      : 'Assigned Faculty';
    const certificateNo = this.buildCertificateNo(input.resultId, course.courseCode, input.passedAt);
    const verificationToken = randomUUID().replace(/-/g, '');
    const verificationPageUrl = this.buildVerificationPageUrl(certificateNo, verificationToken);
    const qrPng = await this.generateQrPng(verificationPageUrl);
    const issuedAt = new Date();

    const pdfBuffer = await this.certificatePdfService.generatePdf({
      certificateNo,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      courseName: course.courseName,
      scorePercentage: input.scorePercentage,
      passedAt: input.passedAt,
      issuedAt,
      trainerName,
      qrImage: qrPng,
      verificationUrl: verificationPageUrl
    });

    const storedFile = await this.certificateStorageService.saveCertificatePdf(certificateNo, pdfBuffer);

    const certificate = this.certificatesRepository.create({
      certificateNo,
      resultId: input.resultId,
      examId: input.examId,
      studentId: input.studentId,
      courseId: input.courseId,
      facultyId: input.facultyId,
      scorePercentage: input.scorePercentage,
      passedAt: input.passedAt,
      fileKey: storedFile.fileKey,
      qrPayload: verificationPageUrl,
      verificationToken,
      issuedAt,
      revoked: false,
      revokedAt: null
    });

    try {
      const savedCertificate = await this.certificatesRepository.save(certificate);
      return this.toSummary(savedCertificate);
    } catch (error) {
      await this.certificateStorageService.safeDelete(storedFile.fileKey);
      if (this.isUniqueViolation(error)) {
        const createdByConcurrentRequest = await this.certificatesRepository.findOne({
          where: { resultId: input.resultId }
        });
        if (createdByConcurrentRequest) {
          return this.toSummary(createdByConcurrentRequest);
        }
      }
      throw error;
    }
  }

  async issueCourseCompletionCertificate(
    input: CourseCompletionCertificateInput
  ): Promise<CertificateSummary> {
    const resultId = this.buildCourseCompletionResultId(input.enrollmentId);
    await this.prepareCourseCompletionCertificatePersistence();

    const existingCourseCertificate = await this.findCourseCompletionCertificate(
      input.studentId,
      input.courseId
    );
    if (existingCourseCertificate) {
      return this.toSummary(existingCourseCertificate);
    }

    const existingCertificate = await this.findCertificateByResultId(resultId);
    if (existingCertificate) {
      return this.toSummary(existingCertificate);
    }

    const [student, course, faculty] = await Promise.all([
      this.findUserById(input.studentId),
      this.findCourseById(input.courseId),
      input.facultyId ? this.findUserById(input.facultyId) : Promise.resolve(null)
    ]);

    if (!student) {
      throw new NotFoundException('Student not found while issuing certificate.');
    }

    if (!course) {
      throw new NotFoundException('Course not found while issuing certificate.');
    }

    const trainerName = faculty
      ? `${faculty.firstName} ${faculty.lastName}`.trim()
      : 'Assigned Faculty';
    const certificateNo = this.buildCertificateNo(resultId, course.courseCode, input.completedAt);
    const verificationToken = randomUUID().replace(/-/g, '');
    const verificationPageUrl = this.buildVerificationPageUrl(certificateNo, verificationToken);
    const qrPng = await this.generateQrPng(verificationPageUrl);
    const issuedAt = new Date();

    const pdfBuffer = await this.certificatePdfService.generatePdf({
      certificateNo,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      courseName: course.courseName,
      scorePercentage: 100,
      passedAt: input.completedAt,
      issuedAt,
      trainerName,
      qrImage: qrPng,
      verificationUrl: verificationPageUrl
    });

    const storedFile = await this.certificateStorageService.saveCertificatePdf(certificateNo, pdfBuffer);
    try {
      const insertedRows = await this.dataSource.query(
        `
          INSERT INTO crm.certificates (
            certificate_no,
            result_id,
            student_id,
            course_id,
            faculty_id,
            score_percentage,
            passed_at,
            file_key,
            qr_payload,
            verification_token,
            issued_at,
            revoked,
            revoked_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, null)
          RETURNING
            certificate_id AS "certificateId",
            certificate_no AS "certificateNo",
            result_id AS "resultId",
            NULL::text AS "examId",
            student_id AS "studentId",
            course_id AS "courseId",
            faculty_id AS "facultyId",
            score_percentage AS "scorePercentage",
            passed_at AS "passedAt",
            file_key AS "fileKey",
            qr_payload AS "qrPayload",
            verification_token AS "verificationToken",
            issued_at AS "issuedAt",
            revoked AS "revoked",
            revoked_at AS "revokedAt",
            created_at AS "createdAt"
        `,
        [
          certificateNo,
          resultId,
          input.studentId,
          input.courseId,
          input.facultyId,
          100,
          input.completedAt,
          storedFile.fileKey,
          verificationPageUrl,
          verificationToken,
          issuedAt
        ]
      );
      const savedCertificate = this.mapCertificateRow(insertedRows[0]);
      if (!savedCertificate) {
        throw new NotFoundException('Certificate could not be loaded after creation.');
      }
      return this.toSummary(savedCertificate);
    } catch (error) {
      await this.certificateStorageService.safeDelete(storedFile.fileKey);
      if (this.isUniqueViolation(error)) {
        const createdByConcurrentRequest = await this.findCertificateByResultId(resultId);
        if (createdByConcurrentRequest) {
          return this.toSummary(createdByConcurrentRequest);
        }
      }
      throw error;
    }
  }

  async listStudentCertificates(studentId: string) {
    try {
      const certificates = (await this.dataSource.query(
        `
          SELECT
            certificate.certificate_id AS "certificateId",
            certificate.certificate_no AS "certificateNo",
            certificate.score_percentage AS "scorePercentage",
            certificate.passed_at AS "passedAt",
            certificate.issued_at AS "issuedAt",
            certificate.revoked AS "revoked",
            certificate.verification_token AS "verificationToken",
            course.course_name AS "courseName"
          FROM crm.certificates certificate
          LEFT JOIN crm.courses course ON course.course_id = certificate.course_id
          WHERE certificate.student_id = $1
          ORDER BY certificate.issued_at DESC
        `,
        [studentId]
      )) as Array<{
          certificateId: string;
          certificateNo: string;
          scorePercentage: string;
          passedAt: Date;
          issuedAt: Date;
          revoked: boolean;
          verificationToken: string;
          courseName: string | null;
        }>;

      if (certificates.length === 0) {
        return [];
      }

      return certificates.map((item) => ({
        certificateId: item.certificateId,
        certificateNo: item.certificateNo,
        courseName: item.courseName,
        scorePercentage: Number(item.scorePercentage),
        passedAt: item.passedAt,
        issuedAt: item.issuedAt,
        revoked: item.revoked,
        downloadUrl: this.buildDownloadUrl(item.certificateNo),
        verificationUrl: this.buildVerificationPageUrl(item.certificateNo, item.verificationToken),
        verificationApiUrl: this.buildVerificationApiUrl(item.certificateNo, item.verificationToken)
      }));
    } catch (error) {
      if (this.isUndefinedTableError(error)) {
        return [];
      }
      this.logger.warn(`Failed to list certificates for student ${studentId}: ${this.describeError(error)}`);
      return [];
    }
  }

  async getCertificateNumbersByResultIds(resultIds: string[]): Promise<Map<string, string>> {
    if (resultIds.length === 0) {
      return new Map<string, string>();
    }

    try {
      const rows = (await this.dataSource.query(
        `
          SELECT
            result_id AS "resultId",
            certificate_no AS "certificateNo"
          FROM crm.certificates
          WHERE result_id = ANY($1::bigint[])
            AND revoked = false
        `,
        [resultIds]
      )) as Array<{ resultId: string; certificateNo: string }>;

      return new Map<string, string>(
        rows.map((row) => [String(row.resultId), String(row.certificateNo)])
      );
    } catch (error) {
      if (this.isUndefinedTableError(error)) {
        return new Map<string, string>();
      }
      this.logger.warn(`Failed to map certificate numbers: ${this.describeError(error)}`);
      return new Map<string, string>();
    }
  }

  async getStudentCertificateDownload(studentId: string, certificateNo: string) {
    const certificateRows = await this.dataSource.query(
      `
        SELECT
          certificate_no AS "certificateNo",
          file_key AS "fileKey"
        FROM crm.certificates
        WHERE certificate_no = $1
          AND student_id = $2
          AND revoked = false
        LIMIT 1
      `,
      [certificateNo, studentId]
    );
    const certificate = certificateRows[0] as { certificateNo: string; fileKey: string } | undefined;

    if (!certificate) {
      throw new NotFoundException('Certificate not found for this student.');
    }

    const absolutePath = await this.certificateStorageService.getReadablePath(certificate.fileKey);

    return {
      certificateNo: certificate.certificateNo,
      absolutePath,
      fileName: `${certificate.certificateNo}.pdf`
    };
  }

  async getCertificateSummaryByResultId(resultId: string): Promise<CertificateSummary | null> {
    const certificate = await this.findCertificateByResultId(resultId, false);
    return certificate ? this.toSummary(certificate) : null;
  }

  async verifyCertificate(certificateNo: string, verificationToken?: string) {
    const certificate = await this.findCertificateByNumber(certificateNo);

    if (!certificate || certificate.revoked) {
      return this.buildInvalidVerificationResponse(certificateNo);
    }

    if (verificationToken && verificationToken !== certificate.verificationToken) {
      return this.buildInvalidVerificationResponse(certificateNo);
    }

    const [student, course, faculty] = await Promise.all([
      this.findUserById(certificate.studentId),
      this.findCourseById(certificate.courseId),
      certificate.facultyId ? this.findUserById(certificate.facultyId) : Promise.resolve(null)
    ]);

    return {
      valid: true,
      status: 'VALID',
      certificateNumber: certificate.certificateNo,
      studentName: student ? `${student.firstName} ${student.lastName}`.trim() : null,
      course: course?.courseName ?? null,
      issueDate: certificate.issuedAt.toISOString().slice(0, 10),
      trainerName: faculty ? `${faculty.firstName} ${faculty.lastName}`.trim() : null,
      verificationApiUrl: this.buildVerificationApiUrl(certificate.certificateNo),
      verificationPageUrl: this.buildVerificationPageUrl(certificate.certificateNo)
    };
  }

  buildDownloadUrl(certificateNo: string): string {
    return `/api/v1/student/certificates/${certificateNo}/download`;
  }

  buildCourseCompletionResultId(enrollmentId: string): string {
    return (4000000000000000000n + BigInt(enrollmentId)).toString();
  }

  private buildCertificateNo(resultId: string, courseCode: string, passedAt: Date): string {
    const yearMonth = `${passedAt.getUTCFullYear()}${String(passedAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const normalizedCourseCode = courseCode
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6)
      .padEnd(6, 'X');

    return `CERT-${yearMonth}-${normalizedCourseCode}-${resultId.padStart(8, '0')}`;
  }

  buildVerificationApiUrl(certificateNo: string, verificationToken?: string): string {
    const appBaseUrl = this.configService
      .get<string>('APP_BASE_URL', 'http://localhost:4000')
      .replace(/\/+$/, '');
    const encodedCertificateNo = encodeURIComponent(certificateNo);

    if (!verificationToken) {
      return `${appBaseUrl}/api/v1/certificates/verify/${encodedCertificateNo}`;
    }

    return `${appBaseUrl}/api/v1/certificates/verify/${encodedCertificateNo}?token=${encodeURIComponent(
      verificationToken
    )}`;
  }

  buildVerificationPageUrl(certificateNo: string, verificationToken?: string): string {
    const appBaseUrl = this.configService
      .get<string>('APP_BASE_URL', 'http://localhost:4000')
      .replace(/\/+$/, '');
    const encodedCertificateNo = encodeURIComponent(certificateNo);

    if (!verificationToken) {
      return `${appBaseUrl}/api/v1/certificates/verify/${encodedCertificateNo}/page`;
    }

    return `${appBaseUrl}/api/v1/certificates/verify/${encodedCertificateNo}/page?token=${encodeURIComponent(
      verificationToken
    )}`;
  }

  private async generateQrPng(payload: string): Promise<Buffer> {
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220
    });

    const base64Payload = qrDataUrl.split(',')[1];
    return Buffer.from(base64Payload, 'base64');
  }

  private toSummary(certificate: Certificate): CertificateSummary {
    return {
      certificateId: certificate.certificateId,
      certificateNo: certificate.certificateNo,
      issuedAt: certificate.issuedAt,
      downloadUrl: this.buildDownloadUrl(certificate.certificateNo),
      verificationUrl: this.buildVerificationPageUrl(
        certificate.certificateNo,
        certificate.verificationToken
      ),
      verificationApiUrl: this.buildVerificationApiUrl(
        certificate.certificateNo,
        certificate.verificationToken
      )
    };
  }

  private buildInvalidVerificationResponse(certificateNo: string) {
    return {
      valid: false,
      status: 'INVALID',
      certificateNumber: certificateNo,
      message: 'Invalid Certificate'
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
        'string' &&
      (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
    );
  }

  private isUndefinedTableError(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
        'string' &&
      (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '42P01'
    );
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private async findCertificateByResultId(
    resultId: string,
    includeRevoked = true
  ): Promise<Certificate | null> {
    const rows = await this.dataSource.query(
      `
        SELECT
          certificate_id AS "certificateId",
          certificate_no AS "certificateNo",
          result_id AS "resultId",
          NULL::text AS "examId",
          student_id AS "studentId",
          course_id AS "courseId",
          faculty_id AS "facultyId",
          score_percentage AS "scorePercentage",
          passed_at AS "passedAt",
          file_key AS "fileKey",
          qr_payload AS "qrPayload",
          verification_token AS "verificationToken",
          issued_at AS "issuedAt",
          revoked AS "revoked",
          revoked_at AS "revokedAt",
          created_at AS "createdAt"
        FROM crm.certificates
        WHERE result_id = $1
          ${includeRevoked ? '' : 'AND revoked = false'}
        LIMIT 1
      `,
      [resultId]
    );

    return this.mapCertificateRow(rows[0]);
  }

  private async findCertificateByNumber(certificateNo: string): Promise<Certificate | null> {
    const rows = await this.dataSource.query(
      `
        SELECT
          certificate_id AS "certificateId",
          certificate_no AS "certificateNo",
          result_id AS "resultId",
          NULL::text AS "examId",
          student_id AS "studentId",
          course_id AS "courseId",
          faculty_id AS "facultyId",
          score_percentage AS "scorePercentage",
          passed_at AS "passedAt",
          file_key AS "fileKey",
          qr_payload AS "qrPayload",
          verification_token AS "verificationToken",
          issued_at AS "issuedAt",
          revoked AS "revoked",
          revoked_at AS "revokedAt",
          created_at AS "createdAt"
        FROM crm.certificates
        WHERE certificate_no = $1
        LIMIT 1
      `,
      [certificateNo]
    );

    return this.mapCertificateRow(rows[0]);
  }

  private async findUserById(userId: string): Promise<Pick<User, 'userId' | 'firstName' | 'lastName'> | null> {
    const rows = await this.dataSource.query(
      `
        SELECT
          user_id AS "userId",
          first_name AS "firstName",
          last_name AS "lastName"
        FROM crm.users
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    return (rows[0] as Pick<User, 'userId' | 'firstName' | 'lastName'> | undefined) ?? null;
  }

  private async findCourseById(
    courseId: string
  ): Promise<Pick<Course, 'courseId' | 'courseCode' | 'courseName'> | null> {
    const rows = await this.dataSource.query(
      `
        SELECT
          course_id AS "courseId",
          course_code AS "courseCode",
          course_name AS "courseName"
        FROM crm.courses
        WHERE course_id = $1
        LIMIT 1
      `,
      [courseId]
    );

    return (rows[0] as Pick<Course, 'courseId' | 'courseCode' | 'courseName'> | undefined) ?? null;
  }

  private async findCourseCompletionCertificate(
    studentId: string,
    courseId: string
  ): Promise<Certificate | null> {
    const rows = await this.dataSource.query(
      `
        SELECT
          certificate_id AS "certificateId",
          certificate_no AS "certificateNo",
          result_id AS "resultId",
          NULL::text AS "examId",
          student_id AS "studentId",
          course_id AS "courseId",
          faculty_id AS "facultyId",
          score_percentage AS "scorePercentage",
          passed_at AS "passedAt",
          file_key AS "fileKey",
          qr_payload AS "qrPayload",
          verification_token AS "verificationToken",
          issued_at AS "issuedAt",
          revoked AS "revoked",
          revoked_at AS "revokedAt",
          created_at AS "createdAt"
        FROM crm.certificates
        WHERE student_id = $1
          AND course_id = $2
          AND revoked = false
        ORDER BY issued_at DESC
        LIMIT 1
      `,
      [studentId, courseId]
    );

    return this.mapCertificateRow(rows[0]);
  }

  private mapCertificateRow(row: Record<string, unknown> | undefined): Certificate | null {
    if (!row) {
      return null;
    }

    const certificate = new Certificate();
    certificate.certificateId = String(row.certificateId);
    certificate.certificateNo = String(row.certificateNo);
    certificate.resultId = String(row.resultId);
    certificate.examId = row.examId === null || row.examId === undefined ? '' : String(row.examId);
    certificate.studentId = String(row.studentId);
    certificate.courseId = String(row.courseId);
    certificate.facultyId = row.facultyId === null ? null : String(row.facultyId);
    certificate.scorePercentage = Number(row.scorePercentage);
    certificate.passedAt = new Date(String(row.passedAt));
    certificate.fileKey = String(row.fileKey);
    certificate.qrPayload = String(row.qrPayload);
    certificate.verificationToken = String(row.verificationToken);
    certificate.issuedAt = new Date(String(row.issuedAt));
    certificate.revoked = Boolean(row.revoked);
    certificate.revokedAt = row.revokedAt ? new Date(String(row.revokedAt)) : null;
    certificate.createdAt = new Date(String(row.createdAt));
    return certificate;
  }

  private async prepareCourseCompletionCertificatePersistence(): Promise<void> {
    const constraints = (await this.dataSource.query(
      `
        SELECT DISTINCT con.conname AS "constraintName"
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_namespace rel_ns ON rel_ns.oid = rel.relnamespace
        INNER JOIN unnest(con.conkey) AS key(attnum) ON TRUE
        INNER JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = key.attnum
        WHERE rel_ns.nspname = 'crm'
          AND rel.relname = 'certificates'
          AND con.contype = 'f'
          AND attr.attname IN ('result_id', 'exam_id')
      `
    )) as Array<{ constraintName: string }>;

    for (const constraint of constraints) {
      await this.dataSource.query(
        `ALTER TABLE crm.certificates DROP CONSTRAINT IF EXISTS "${constraint.constraintName}"`
      );
    }

    const triggers = (await this.dataSource.query(
      `
        SELECT DISTINCT t.tgname AS "triggerName"
        FROM pg_trigger t
        INNER JOIN pg_class c ON c.oid = t.tgrelid
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        INNER JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'crm'
          AND c.relname = 'certificates'
          AND NOT t.tgisinternal
          AND (p.proname = 'fn_validate_certificate_issue' OR t.tgname = 'trg_validate_certificate_issue')
      `
    )) as Array<{ triggerName: string }>;

    for (const trigger of triggers) {
      await this.dataSource.query(
        `DROP TRIGGER IF EXISTS "${trigger.triggerName}" ON crm.certificates`
      );
    }
  }
}
