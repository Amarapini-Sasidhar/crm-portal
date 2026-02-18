import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { CourseStatus } from '../../../common/enums/course-status.enum';

@Entity({ schema: 'crm', name: 'courses' })
export class Course {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'course_id'
  })
  courseId!: string;

  @Column({ name: 'course_code', type: 'varchar', length: 30, unique: true })
  courseCode!: string;

  @Column({ name: 'course_name', type: 'varchar', length: 200 })
  courseName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'duration_days', type: 'integer' })
  durationDays!: number;

  @Column({
    type: 'enum',
    enum: CourseStatus,
    enumName: 'course_status',
    default: CourseStatus.ACTIVE
  })
  status!: CourseStatus;

  @Column({ name: 'created_by', type: 'bigint' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
