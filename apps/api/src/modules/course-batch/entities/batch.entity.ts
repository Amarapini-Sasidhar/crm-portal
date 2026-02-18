import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { BatchStatus } from '../../../common/enums/batch-status.enum';

@Entity({ schema: 'crm', name: 'batches' })
export class Batch {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'batch_id'
  })
  batchId!: string;

  @Column({ name: 'course_id', type: 'bigint' })
  courseId!: string;

  @Column({ name: 'batch_code', type: 'varchar', length: 30, unique: true })
  batchCode!: string;

  @Column({ name: 'batch_name', type: 'varchar', length: 150 })
  batchName!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ type: 'integer' })
  capacity!: number;

  @Column({
    type: 'enum',
    enum: BatchStatus,
    enumName: 'batch_status',
    default: BatchStatus.PLANNED
  })
  status!: BatchStatus;

  @Column({ name: 'created_by', type: 'bigint' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
