import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { CourseBatchModule } from '../course-batch/course-batch.module';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { FacultyExamsModule } from '../faculty-exams/faculty-exams.module';
import { StudentAttemptsModule } from '../student-attempts/student-attempts.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { FacultyController } from './faculty.controller';
import { StudentController } from './student.controller';
import { SuperAdminController } from './super-admin.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    CourseBatchModule,
    CertificatesModule,
    DashboardsModule,
    FacultyExamsModule,
    StudentAttemptsModule
  ],
  controllers: [
    SuperAdminController,
    AdminController,
    FacultyController,
    StudentController
  ]
})
export class AccessModule {}
