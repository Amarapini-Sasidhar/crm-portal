import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { AttemptStatus } from '../../../common/enums/attempt-status.enum';

@Entity({ schema: 'crm', name: 'exam_attempts' })
export class ExamAttempt {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'attempt_id'
  })
  attemptId!: string;

  @Column({ name: 'exam_id', type: 'bigint' })
  examId!: string;

  @Column({ name: 'student_id', type: 'bigint' })
  studentId!: string;

  @Column({ name: 'attempt_no', type: 'smallint' })
  attemptNo!: number;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({
    type: 'enum',
    enum: AttemptStatus,
    enumName: 'attempt_status',
    default: AttemptStatus.IN_PROGRESS
  })
  status!: AttemptStatus;

  @Column({ name: 'time_spent_seconds', type: 'integer', nullable: true })
  timeSpentSeconds!: number | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
