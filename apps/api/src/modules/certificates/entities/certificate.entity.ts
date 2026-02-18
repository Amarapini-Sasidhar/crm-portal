import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string | number) => Number(value)
};

@Entity({ schema: 'crm', name: 'certificates' })
export class Certificate {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'certificate_id'
  })
  certificateId!: string;

  @Column({ name: 'certificate_no', type: 'varchar', length: 60, unique: true })
  certificateNo!: string;

  @Column({ name: 'result_id', type: 'bigint', unique: true })
  resultId!: string;

  @Column({ name: 'exam_id', type: 'bigint' })
  examId!: string;

  @Column({ name: 'student_id', type: 'bigint' })
  studentId!: string;

  @Column({ name: 'course_id', type: 'bigint' })
  courseId!: string;

  @Column({ name: 'faculty_id', type: 'bigint', nullable: true })
  facultyId!: string | null;

  @Column({
    name: 'score_percentage',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer
  })
  scorePercentage!: number;

  @Column({ name: 'passed_at', type: 'timestamptz' })
  passedAt!: Date;

  @Column({ name: 'file_key', type: 'text' })
  fileKey!: string;

  @Column({ name: 'qr_payload', type: 'text' })
  qrPayload!: string;

  @Column({ name: 'verification_token', type: 'varchar', length: 64, unique: true })
  verificationToken!: string;

  @CreateDateColumn({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ type: 'boolean', default: false })
  revoked!: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
