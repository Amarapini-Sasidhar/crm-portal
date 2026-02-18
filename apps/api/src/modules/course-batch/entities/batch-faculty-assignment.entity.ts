import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from 'typeorm';

@Entity({ schema: 'crm', name: 'batch_faculty_assignments' })
@Unique('uq_batch_faculty_batch', ['batchId'])
export class BatchFacultyAssignment {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'assignment_id'
  })
  assignmentId!: string;

  @Column({ name: 'batch_id', type: 'bigint' })
  batchId!: string;

  @Column({ name: 'faculty_id', type: 'bigint' })
  facultyId!: string;

  @Column({ name: 'assigned_by', type: 'bigint' })
  assignedBy!: string;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
