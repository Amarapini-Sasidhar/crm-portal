import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CertificatesModule } from '../certificates/certificates.module';
import { UsersModule } from '../users/users.module';
import { CourseBatchService } from './course-batch.service';
import { BatchFacultyAssignment } from './entities/batch-faculty-assignment.entity';
import { Batch } from './entities/batch.entity';
import { Course } from './entities/course.entity';
import { StudentEnrollment } from './entities/student-enrollment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, Batch, BatchFacultyAssignment, StudentEnrollment]),
    CertificatesModule,
    UsersModule
  ],
  providers: [CourseBatchService],
  exports: [CourseBatchService]
})
export class CourseBatchModule {}
