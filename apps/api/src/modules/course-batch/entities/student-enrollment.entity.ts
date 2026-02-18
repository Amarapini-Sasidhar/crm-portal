import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from 'typeorm';
import { EnrollmentStatus } from '../../../common/enums/enrollment-status.enum';

@Entity({ schema: 'crm', name: 'student_enrollments' })
@Unique('uq_student_batch_enrollment', ['studentId', 'batchId'])
export class StudentEnrollment {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'enrollment_id'
  })
  enrollmentId!: string;

  @Column({ name: 'student_id', type: 'bigint' })
  studentId!: string;

  @Column({ name: 'batch_id', type: 'bigint' })
  batchId!: string;

  @CreateDateColumn({ name: 'enrolled_at', type: 'timestamptz' })
  enrolledAt!: Date;

  @Column({
    type: 'enum',
    enum: EnrollmentStatus,
    enumName: 'enrollment_status',
    default: EnrollmentStatus.ACTIVE
  })
  status!: EnrollmentStatus;

  @Column({ name: 'created_by', type: 'bigint' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
