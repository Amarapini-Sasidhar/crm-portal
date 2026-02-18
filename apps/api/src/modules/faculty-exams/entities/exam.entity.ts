import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { ExamStatus } from '../../../common/enums/exam-status.enum';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value)
};

@Entity({ schema: 'crm', name: 'exams' })
export class Exam {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'exam_id'
  })
  examId!: string;

  @Column({ name: 'course_id', type: 'bigint' })
  courseId!: string;

  @Column({ name: 'batch_id', type: 'bigint' })
  batchId!: string;

  @Column({ name: 'created_by_faculty_id', type: 'bigint' })
  createdByFacultyId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'duration_minutes', type: 'integer' })
  durationMinutes!: number;

  @Column({
    name: 'total_marks',
    type: 'numeric',
    precision: 8,
    scale: 2,
    transformer: numericTransformer
  })
  totalMarks!: number;

  @Column({
    name: 'pass_percentage',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
    default: 70
  })
  passPercentage!: number;

  @Column({ name: 'max_attempts', type: 'smallint', default: 1 })
  maxAttempts!: number;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt!: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt!: Date | null;

  @Column({
    type: 'enum',
    enum: ExamStatus,
    enumName: 'exam_status',
    default: ExamStatus.DRAFT
  })
  status!: ExamStatus;

  @Column({ name: 'shuffle_questions', type: 'boolean', default: false })
  shuffleQuestions!: boolean;

  @Column({ name: 'shuffle_options', type: 'boolean', default: false })
  shuffleOptions!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
