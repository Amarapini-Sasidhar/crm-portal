import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../course-batch/entities/course.entity';
import { User } from '../users/entities/user.entity';
import { CertificatePdfService } from './certificate-pdf.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificateStorageService } from './certificate-storage.service';
import { Certificate } from './entities/certificate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Certificate, User, Course])],
  providers: [CertificatesService, CertificateStorageService, CertificatePdfService],
  controllers: [CertificatesController],
  exports: [CertificatesService]
})
export class CertificatesModule {}
