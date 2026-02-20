import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
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
  constructor(
    @InjectRepository(Certificate)
    private readonly certificatesRepository: Repository<Certificate>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Course)
    private readonly coursesRepository: Repository<Course>,
    private readonly certificatePdfService: CertificatePdfService,
    private readonly certificateStorageService: CertificateStorageService,
    private readonly configService: ConfigService
  ) {}

  async issueCertificateIfEligible(input: CertificateIssueInput): Promise<CertificateSummary | null> {
    if (input.scorePercentage < CERTIFICATE_MIN_PERCENTAGE) {
      return null;
    }

    const existingCertificate = await this.certificatesRepository.findOne({
      where: { resultId: input.resultId }
    });
    if (existingCertificate) {
      return this.toSummary(existingCertificate);
    }

    const [student, course, faculty] = await Promise.all([
      this.usersRepository.findOne({
        where: { userId: input.studentId }
      }),
      this.coursesRepository.findOne({
        where: { courseId: input.courseId }
      }),
      input.facultyId
        ? this.usersRepository.findOne({
            where: { userId: input.facultyId }
          })
        : Promise.resolve(null)
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

  async listStudentCertificates(studentId: string) {
    try {
      const certificates = await this.certificatesRepository
        .createQueryBuilder('certificate')
        .leftJoin(Course, 'course', 'course.course_id = certificate.course_id')
        .select([
          'certificate.certificate_id AS "certificateId"',
          'certificate.certificate_no AS "certificateNo"',
          'certificate.score_percentage AS "scorePercentage"',
          'certificate.passed_at AS "passedAt"',
          'certificate.issued_at AS "issuedAt"',
          'certificate.revoked AS "revoked"',
          'certificate.verification_token AS "verificationToken"',
          'course.course_name AS "courseName"'
        ])
        .where('certificate.student_id = :studentId', { studentId })
        .orderBy('certificate.issued_at', 'DESC')
        .getRawMany<{
          certificateId: string;
          certificateNo: string;
          scorePercentage: string;
          passedAt: Date;
          issuedAt: Date;
          revoked: boolean;
          verificationToken: string;
          courseName: string | null;
        }>();

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
      throw error;
    }
  }

  async getCertificateNumbersByResultIds(resultIds: string[]): Promise<Map<string, string>> {
    if (resultIds.length === 0) {
      return new Map<string, string>();
    }

    try {
      const rows = await this.certificatesRepository
        .createQueryBuilder('certificate')
        .select('certificate.result_id', 'resultId')
        .addSelect('certificate.certificate_no', 'certificateNo')
        .where('certificate.result_id IN (:...resultIds)', { resultIds })
        .andWhere('certificate.revoked = false')
        .getRawMany<{ resultId: string; certificateNo: string }>();

      return new Map<string, string>(
        rows.map((row) => [String(row.resultId), String(row.certificateNo)])
      );
    } catch (error) {
      if (this.isUndefinedTableError(error)) {
        return new Map<string, string>();
      }
      throw error;
    }
  }

  async getStudentCertificateDownload(studentId: string, certificateNo: string) {
    const certificate = await this.certificatesRepository.findOne({
      where: {
        certificateNo,
        studentId,
        revoked: false
      }
    });

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
    const certificate = await this.certificatesRepository.findOne({
      where: { resultId, revoked: false }
    });
    return certificate ? this.toSummary(certificate) : null;
  }

  async verifyCertificate(certificateNo: string, verificationToken?: string) {
    const certificate = await this.certificatesRepository.findOne({
      where: {
        certificateNo
      }
    });

    if (!certificate || certificate.revoked) {
      return this.buildInvalidVerificationResponse(certificateNo);
    }

    if (verificationToken && verificationToken !== certificate.verificationToken) {
      return this.buildInvalidVerificationResponse(certificateNo);
    }

    const [student, course, faculty] = await Promise.all([
      this.usersRepository.findOne({
        where: { userId: certificate.studentId }
      }),
      this.coursesRepository.findOne({
        where: { courseId: certificate.courseId }
      }),
      certificate.facultyId
        ? this.usersRepository.findOne({
            where: { userId: certificate.facultyId }
          })
        : Promise.resolve(null)
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
}
